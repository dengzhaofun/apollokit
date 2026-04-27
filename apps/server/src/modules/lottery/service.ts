/**
 * Lottery service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Pull execution flow (without transactions):
 * 1. Idempotency check via pull_logs batchId
 * 2. Load pool, tiers, prizes, pity rules
 * 3. Deduct cost (if costPerPull is non-empty)
 * 4. Load/init user state (atomic upsert)
 * 5. Run selection algorithm (pure, in-memory)
 * 6. Claim stock for limited prizes (atomic UPDATE)
 * 7. Update pity counters (atomic UPDATE with version guard)
 * 8. Grant reward items
 * 9. Insert pull logs
 *
 * Multi-pull: cost deducted once upfront, selection loop in-memory,
 * state written once at the end.
 */

import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  lotteryPools,
  lotteryTiers,
  lotteryPrizes,
  lotteryPityRules,
  lotteryUserStates,
  lotteryPullLogs,
} from "../../schema/lottery";
import { assertActivityWritable } from "../activity/gate";
import type { ItemService } from "../item";
import type { RewardEntry } from "../../lib/rewards";
import {
  LotteryPoolNotFound,
  LotteryPoolInactive,
  LotteryPoolTimeWindowClosed,
  LotteryPoolAliasConflict,
  LotteryPoolGlobalLimitReached,
  LotteryTierNotFound,
  LotteryPrizeNotFound,
  LotteryPityRuleNotFound,
  LotteryPityRuleConflict,
  LotteryNoPrizesAvailable,
  LotteryConcurrencyConflict,
} from "./errors";
import { selectPrize, updatePityCounters } from "./rng";
import type {
  LotteryPool,
  LotteryTier,
  LotteryPrize,
  LotteryPityRule,
  PullResult,
  PullResultEntry,
} from "./types";
import type {
  CreatePoolInput,
  UpdatePoolInput,
  CreateTierInput,
  UpdateTierInput,
  CreatePrizeInput,
  UpdatePrizeInput,
  CreatePityRuleInput,
  UpdatePityRuleInput,
} from "./validators";

// `events` stays optional so existing `createLotteryService({ db }, ...)`
// test sites keep compiling. Production wiring hands it in via `deps`.
type LotteryDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with lottery-domain events.
// A single `pull` and a multi-pull both emit one `lottery.pulled` event
// with `count` — emitting N events for a 10-pull would blow up both the
// bus and Tinybird for low analytical gain.
declare module "../../lib/event-bus" {
  interface EventMap {
    "lottery.pulled": {
      organizationId: string;
      endUserId: string;
      batchId: string;
      poolId: string;
      poolAlias: string | null;
      count: number;
      pulls: PullResultEntry[];
      costItems: RewardEntry[];
      pityTriggeredCount: number;
    };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

export function createLotteryService(d: LotteryDeps, itemSvc: ItemService) {
  const { db, events } = d;

  // ─── Internal helpers ────────────────────────────────────────

  async function loadPoolByKey(
    organizationId: string,
    key: string,
  ): Promise<LotteryPool> {
    const where = looksLikeId(key)
      ? and(
          eq(lotteryPools.organizationId, organizationId),
          eq(lotteryPools.id, key),
        )
      : and(
          eq(lotteryPools.organizationId, organizationId),
          eq(lotteryPools.alias, key),
        );
    const rows = await db.select().from(lotteryPools).where(where).limit(1);
    if (!rows[0]) throw new LotteryPoolNotFound(key);
    return rows[0];
  }

  function validatePoolActive(pool: LotteryPool, now: Date = new Date()): void {
    if (!pool.isActive) throw new LotteryPoolInactive(pool.id);
    if (pool.startAt && now < pool.startAt) {
      throw new LotteryPoolTimeWindowClosed(pool.id);
    }
    if (pool.endAt && now > pool.endAt) {
      throw new LotteryPoolTimeWindowClosed(pool.id);
    }
  }

  async function loadPoolData(organizationId: string, poolKey: string) {
    const pool = await loadPoolByKey(organizationId, poolKey);
    const [tiers, prizes, pityRules] = await Promise.all([
      db
        .select()
        .from(lotteryTiers)
        .where(eq(lotteryTiers.poolId, pool.id))
        .orderBy(lotteryTiers.sortOrder),
      db
        .select()
        .from(lotteryPrizes)
        .where(eq(lotteryPrizes.poolId, pool.id))
        .orderBy(lotteryPrizes.sortOrder),
      db
        .select()
        .from(lotteryPityRules)
        .where(eq(lotteryPityRules.poolId, pool.id)),
    ]);
    return { pool, tiers, prizes, pityRules };
  }

  async function loadOrInitUserState(
    poolId: string,
    endUserId: string,
    organizationId: string,
  ) {
    const upserted = await db
      .insert(lotteryUserStates)
      .values({
        poolId,
        endUserId,
        organizationId,
        totalPullCount: 0,
        pityCounters: {},
      })
      .onConflictDoUpdate({
        target: [lotteryUserStates.poolId, lotteryUserStates.endUserId],
        set: {
          // no-op update to get the current row
          version: lotteryUserStates.version,
        },
      })
      .returning();
    return upserted[0]!;
  }

  /**
   * Attempt to claim stock for a limited prize.
   * Returns true if stock was claimed, false if depleted.
   */
  async function claimStock(prizeId: string): Promise<boolean> {
    const updated = await db
      .update(lotteryPrizes)
      .set({
        globalStockUsed: sql`${lotteryPrizes.globalStockUsed} + 1`,
      })
      .where(
        and(
          eq(lotteryPrizes.id, prizeId),
          sql`${lotteryPrizes.globalStockUsed} < ${lotteryPrizes.globalStockLimit}`,
        ),
      )
      .returning({ id: lotteryPrizes.id });
    return updated.length > 0;
  }

  /**
   * Execute a single pull with stock fallback logic.
   * Returns the prize and selection metadata.
   */
  function executeSingleSelection(
    tiers: LotteryTier[],
    prizes: LotteryPrize[],
    pityRules: LotteryPityRule[],
    pityCounters: Record<string, number>,
    excludePrizeIds?: Set<string>,
  ): {
    prize: LotteryPrize;
    tierId: string | null;
    tierName: string | null;
    pityTriggered: boolean;
    pityRuleId: string | null;
  } | null {
    const result = selectPrize({
      tiers,
      prizes,
      pityRules,
      pityCounters,
      excludePrizeIds,
    });
    if (!result) return null;

    const prize = prizes.find((p) => p.id === result.prizeId);
    if (!prize) return null;

    return {
      prize,
      tierId: result.tierId,
      tierName: result.tierName,
      pityTriggered: result.pityTriggered,
      pityRuleId: result.pityRuleId,
    };
  }

  return {
    // ─── Pool CRUD ─────────────────────────────────────────────

    async createPool(
      organizationId: string,
      input: CreatePoolInput,
    ): Promise<LotteryPool> {
      try {
        const [row] = await db
          .insert(lotteryPools)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            costPerPull: input.costPerPull ?? [],
            isActive: input.isActive ?? true,
            startAt: input.startAt ? new Date(input.startAt) : null,
            endAt: input.endAt ? new Date(input.endAt) : null,
            globalPullLimit: input.globalPullLimit ?? null,
            activityId: input.activityId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new LotteryPoolAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updatePool(
      organizationId: string,
      id: string,
      patch: UpdatePoolInput,
    ): Promise<LotteryPool> {
      const existing = await loadPoolByKey(organizationId, id);
      const v: Partial<typeof lotteryPools.$inferInsert> = {};
      if (patch.name !== undefined) v.name = patch.name;
      if (patch.alias !== undefined) v.alias = patch.alias;
      if (patch.description !== undefined) v.description = patch.description;
      if (patch.costPerPull !== undefined) v.costPerPull = patch.costPerPull;
      if (patch.isActive !== undefined) v.isActive = patch.isActive;
      if (patch.startAt !== undefined)
        v.startAt = patch.startAt ? new Date(patch.startAt) : null;
      if (patch.endAt !== undefined)
        v.endAt = patch.endAt ? new Date(patch.endAt) : null;
      if (patch.globalPullLimit !== undefined)
        v.globalPullLimit = patch.globalPullLimit;
      if (patch.activityId !== undefined) v.activityId = patch.activityId;
      if (patch.activityNodeId !== undefined)
        v.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) v.metadata = patch.metadata;

      if (Object.keys(v).length === 0) return existing;

      try {
        const [row] = await db
          .update(lotteryPools)
          .set(v)
          .where(
            and(
              eq(lotteryPools.id, existing.id),
              eq(lotteryPools.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new LotteryPoolNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new LotteryPoolAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deletePool(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(lotteryPools)
        .where(
          and(
            eq(lotteryPools.id, id),
            eq(lotteryPools.organizationId, organizationId),
          ),
        )
        .returning({ id: lotteryPools.id });
      if (deleted.length === 0) throw new LotteryPoolNotFound(id);
    },

    /**
     * List lottery pools. Defaults to standalone pools only
     * (`activityId IS NULL`). Pass `{ activityId }` for a single
     * activity's pools, or `{ includeActivity: true }` for everything.
     */
    async listPools(
      organizationId: string,
      filter: PageParams & { includeActivity?: boolean; activityId?: string } = {},
    ): Promise<Page<LotteryPool>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(lotteryPools.organizationId, organizationId)];
      if (filter.activityId) {
        conds.push(eq(lotteryPools.activityId, filter.activityId));
      } else if (!filter.includeActivity) {
        conds.push(isNull(lotteryPools.activityId));
      }
      const seek = cursorWhere(filter.cursor, lotteryPools.createdAt, lotteryPools.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(lotteryPools.name, pat), ilike(lotteryPools.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(lotteryPools)
        .where(and(...conds))
        .orderBy(desc(lotteryPools.createdAt), desc(lotteryPools.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getPool(
      organizationId: string,
      idOrAlias: string,
    ): Promise<LotteryPool> {
      return loadPoolByKey(organizationId, idOrAlias);
    },

    // ─── Tier CRUD ─────────────────────────────────────────────

    async createTier(
      organizationId: string,
      poolKey: string,
      input: CreateTierInput,
    ): Promise<LotteryTier> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      const [row] = await db
        .insert(lotteryTiers)
        .values({
          poolId: pool.id,
          organizationId,
          name: input.name,
          alias: input.alias ?? null,
          baseWeight: input.baseWeight,
          color: input.color ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    async updateTier(
      organizationId: string,
      tierId: string,
      patch: UpdateTierInput,
    ): Promise<LotteryTier> {
      const v: Partial<typeof lotteryTiers.$inferInsert> = {};
      if (patch.name !== undefined) v.name = patch.name;
      if (patch.alias !== undefined) v.alias = patch.alias;
      if (patch.baseWeight !== undefined) v.baseWeight = patch.baseWeight;
      if (patch.color !== undefined) v.color = patch.color;
      if (patch.icon !== undefined) v.icon = patch.icon;
      if (patch.sortOrder !== undefined) v.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) v.isActive = patch.isActive;
      if (patch.metadata !== undefined) v.metadata = patch.metadata;

      if (Object.keys(v).length === 0) {
        const rows = await db
          .select()
          .from(lotteryTiers)
          .where(
            and(
              eq(lotteryTiers.id, tierId),
              eq(lotteryTiers.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new LotteryTierNotFound(tierId);
        return rows[0];
      }

      const [row] = await db
        .update(lotteryTiers)
        .set(v)
        .where(
          and(
            eq(lotteryTiers.id, tierId),
            eq(lotteryTiers.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new LotteryTierNotFound(tierId);
      return row;
    },

    async deleteTier(
      organizationId: string,
      tierId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(lotteryTiers)
        .where(
          and(
            eq(lotteryTiers.id, tierId),
            eq(lotteryTiers.organizationId, organizationId),
          ),
        )
        .returning({ id: lotteryTiers.id });
      if (deleted.length === 0) throw new LotteryTierNotFound(tierId);
    },

    async listTiers(
      organizationId: string,
      poolKey: string,
      params: PageParams = {},
    ): Promise<Page<LotteryTier>> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(lotteryTiers.poolId, pool.id)];
      const seek = cursorWhere(params.cursor, lotteryTiers.createdAt, lotteryTiers.id);
      if (seek) conds.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(lotteryTiers.name, pat), ilike(lotteryTiers.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(lotteryTiers)
        .where(and(...conds))
        .orderBy(desc(lotteryTiers.createdAt), desc(lotteryTiers.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Prize CRUD ────────────────────────────────────────────

    async createPrize(
      organizationId: string,
      poolKey: string,
      tierId: string | null,
      input: CreatePrizeInput,
    ): Promise<LotteryPrize> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      const [row] = await db
        .insert(lotteryPrizes)
        .values({
          poolId: pool.id,
          tierId: tierId ?? null,
          organizationId,
          name: input.name,
          description: input.description ?? null,
          rewardItems: input.rewardItems,
          weight: input.weight ?? 100,
          isRateUp: input.isRateUp ?? false,
          rateUpWeight: input.rateUpWeight ?? 0,
          globalStockLimit: input.globalStockLimit ?? null,
          fallbackPrizeId: input.fallbackPrizeId ?? null,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    async updatePrize(
      organizationId: string,
      prizeId: string,
      patch: UpdatePrizeInput,
    ): Promise<LotteryPrize> {
      const v: Partial<typeof lotteryPrizes.$inferInsert> = {};
      if (patch.name !== undefined) v.name = patch.name;
      if (patch.description !== undefined) v.description = patch.description;
      if (patch.rewardItems !== undefined) v.rewardItems = patch.rewardItems;
      if (patch.weight !== undefined) v.weight = patch.weight;
      if (patch.isRateUp !== undefined) v.isRateUp = patch.isRateUp;
      if (patch.rateUpWeight !== undefined) v.rateUpWeight = patch.rateUpWeight;
      if (patch.globalStockLimit !== undefined)
        v.globalStockLimit = patch.globalStockLimit;
      if (patch.fallbackPrizeId !== undefined)
        v.fallbackPrizeId = patch.fallbackPrizeId;
      if (patch.isActive !== undefined) v.isActive = patch.isActive;
      if (patch.sortOrder !== undefined) v.sortOrder = patch.sortOrder;
      if (patch.metadata !== undefined) v.metadata = patch.metadata;

      if (Object.keys(v).length === 0) {
        const rows = await db
          .select()
          .from(lotteryPrizes)
          .where(
            and(
              eq(lotteryPrizes.id, prizeId),
              eq(lotteryPrizes.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new LotteryPrizeNotFound(prizeId);
        return rows[0];
      }

      const [row] = await db
        .update(lotteryPrizes)
        .set(v)
        .where(
          and(
            eq(lotteryPrizes.id, prizeId),
            eq(lotteryPrizes.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new LotteryPrizeNotFound(prizeId);
      return row;
    },

    async deletePrize(
      organizationId: string,
      prizeId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(lotteryPrizes)
        .where(
          and(
            eq(lotteryPrizes.id, prizeId),
            eq(lotteryPrizes.organizationId, organizationId),
          ),
        )
        .returning({ id: lotteryPrizes.id });
      if (deleted.length === 0) throw new LotteryPrizeNotFound(prizeId);
    },

    async listPrizes(
      organizationId: string,
      poolKey: string,
      params: PageParams = {},
    ): Promise<Page<LotteryPrize>> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(lotteryPrizes.poolId, pool.id)];
      const seek = cursorWhere(params.cursor, lotteryPrizes.createdAt, lotteryPrizes.id);
      if (seek) conds.push(seek);
      if (params.q) {
        conds.push(ilike(lotteryPrizes.name, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(lotteryPrizes)
        .where(and(...conds))
        .orderBy(desc(lotteryPrizes.createdAt), desc(lotteryPrizes.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Pity Rule CRUD ────────────────────────────────────────

    async createPityRule(
      organizationId: string,
      poolKey: string,
      input: CreatePityRuleInput,
    ): Promise<LotteryPityRule> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      try {
        const [row] = await db
          .insert(lotteryPityRules)
          .values({
            poolId: pool.id,
            organizationId,
            guaranteeTierId: input.guaranteeTierId,
            hardPityThreshold: input.hardPityThreshold,
            softPityStartAt: input.softPityStartAt ?? null,
            softPityWeightIncrement: input.softPityWeightIncrement ?? null,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new LotteryPityRuleConflict(
            pool.id,
            input.guaranteeTierId,
          );
        }
        throw err;
      }
    },

    async updatePityRule(
      organizationId: string,
      ruleId: string,
      patch: UpdatePityRuleInput,
    ): Promise<LotteryPityRule> {
      const v: Partial<typeof lotteryPityRules.$inferInsert> = {};
      if (patch.hardPityThreshold !== undefined)
        v.hardPityThreshold = patch.hardPityThreshold;
      if (patch.softPityStartAt !== undefined)
        v.softPityStartAt = patch.softPityStartAt;
      if (patch.softPityWeightIncrement !== undefined)
        v.softPityWeightIncrement = patch.softPityWeightIncrement;
      if (patch.isActive !== undefined) v.isActive = patch.isActive;
      if (patch.metadata !== undefined) v.metadata = patch.metadata;

      if (Object.keys(v).length === 0) {
        const rows = await db
          .select()
          .from(lotteryPityRules)
          .where(
            and(
              eq(lotteryPityRules.id, ruleId),
              eq(lotteryPityRules.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new LotteryPityRuleNotFound(ruleId);
        return rows[0];
      }

      const [row] = await db
        .update(lotteryPityRules)
        .set(v)
        .where(
          and(
            eq(lotteryPityRules.id, ruleId),
            eq(lotteryPityRules.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new LotteryPityRuleNotFound(ruleId);
      return row;
    },

    async deletePityRule(
      organizationId: string,
      ruleId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(lotteryPityRules)
        .where(
          and(
            eq(lotteryPityRules.id, ruleId),
            eq(lotteryPityRules.organizationId, organizationId),
          ),
        )
        .returning({ id: lotteryPityRules.id });
      if (deleted.length === 0) throw new LotteryPityRuleNotFound(ruleId);
    },

    async listPityRules(
      organizationId: string,
      poolKey: string,
      params: PageParams = {},
    ): Promise<Page<LotteryPityRule>> {
      const pool = await loadPoolByKey(organizationId, poolKey);
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(lotteryPityRules.poolId, pool.id)];
      const seek = cursorWhere(params.cursor, lotteryPityRules.createdAt, lotteryPityRules.id);
      if (seek) conds.push(seek);
      const rows = await db
        .select()
        .from(lotteryPityRules)
        .where(and(...conds))
        .orderBy(desc(lotteryPityRules.createdAt), desc(lotteryPityRules.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Pull execution ────────────────────────────────────────

    async pull(params: {
      organizationId: string;
      endUserId: string;
      poolKey: string;
      idempotencyKey?: string;
    }): Promise<PullResult> {
      const batchId = params.idempotencyKey ?? crypto.randomUUID();

      // 1. Idempotency check
      const existing = await db
        .select({ id: lotteryPullLogs.id })
        .from(lotteryPullLogs)
        .where(eq(lotteryPullLogs.batchId, batchId))
        .limit(1);
      if (existing.length > 0) {
        // Already executed — reconstruct result from logs
        const logs = await db
          .select()
          .from(lotteryPullLogs)
          .where(eq(lotteryPullLogs.batchId, batchId))
          .orderBy(lotteryPullLogs.batchIndex);
        const first = logs[0]!;
        return {
          batchId,
          poolId: first.poolId,
          endUserId: first.endUserId,
          costItems: first.costItems,
          pulls: logs.map((l) => ({
            batchIndex: l.batchIndex,
            prizeId: l.prizeId,
            prizeName: l.prizeName,
            tierId: l.tierId,
            tierName: l.tierName,
            rewardItems: l.rewardItems,
            pityTriggered: l.pityTriggered,
            pityRuleId: l.pityRuleId,
          })),
        };
      }

      // 2. Load pool + validate
      const { pool, tiers, prizes, pityRules } = await loadPoolData(
        params.organizationId,
        params.poolKey,
      );
      validatePoolActive(pool);
      // 2b. If the pool is bound to an activity, the activity must be in
      //     its writable phase ('active'). Independent from the pool's own
      //     startAt/endAt window already checked above.
      if (pool.activityId) {
        await assertActivityWritable(db, pool.activityId);
      }

      // 3. Check global pull limit
      if (pool.globalPullLimit != null) {
        const updated = await db
          .update(lotteryPools)
          .set({
            globalPullCount: sql`${lotteryPools.globalPullCount} + 1`,
          })
          .where(
            and(
              eq(lotteryPools.id, pool.id),
              sql`${lotteryPools.globalPullCount} < ${pool.globalPullLimit}`,
            ),
          )
          .returning({ id: lotteryPools.id });
        if (updated.length === 0) {
          throw new LotteryPoolGlobalLimitReached(pool.id);
        }
      }

      // 4. Deduct cost
      const costItems = pool.costPerPull;
      if (costItems.length > 0) {
        await itemSvc.deductItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          deductions: costItems,
          source: "lottery",
          sourceId: batchId,
        });
      }

      // 5. Load user state
      const userState = await loadOrInitUserState(
        pool.id,
        params.endUserId,
        params.organizationId,
      );

      // 6. Selection with stock fallback
      const pityCounters = { ...userState.pityCounters };
      const excludeIds = new Set<string>();
      let selection = executeSingleSelection(
        tiers,
        prizes,
        pityRules,
        pityCounters,
        excludeIds,
      );
      if (!selection) throw new LotteryNoPrizesAvailable(pool.id);

      // Stock claim with fallback loop
      if (selection.prize.globalStockLimit != null) {
        let claimed = await claimStock(selection.prize.id);
        while (!claimed) {
          // Try fallback
          if (selection!.prize.fallbackPrizeId) {
            const fallback = prizes.find(
              (p) => p.id === selection!.prize.fallbackPrizeId,
            );
            if (fallback) {
              selection = {
                prize: fallback,
                tierId: selection!.tierId,
                tierName: selection!.tierName,
                pityTriggered: selection!.pityTriggered,
                pityRuleId: selection!.pityRuleId,
              };
              if (fallback.globalStockLimit != null) {
                claimed = await claimStock(fallback.id);
                if (claimed) break;
              } else {
                break; // Unlimited fallback
              }
            }
          }
          // No fallback or fallback also depleted — exclude and re-select
          excludeIds.add(selection!.prize.id);
          selection = executeSingleSelection(
            tiers,
            prizes,
            pityRules,
            pityCounters,
            excludeIds,
          );
          if (!selection) throw new LotteryNoPrizesAvailable(pool.id);
          if (selection.prize.globalStockLimit != null) {
            claimed = await claimStock(selection.prize.id);
          } else {
            break; // Unlimited stock
          }
        }
      }

      // 7. Update pity counters
      const newPityCounters = updatePityCounters(
        pityRules,
        pityCounters,
        selection.tierId,
      );

      const stateUpdated = await db
        .update(lotteryUserStates)
        .set({
          totalPullCount: sql`${lotteryUserStates.totalPullCount} + 1`,
          pityCounters: newPityCounters,
          version: sql`${lotteryUserStates.version} + 1`,
        })
        .where(
          and(
            eq(lotteryUserStates.poolId, pool.id),
            eq(lotteryUserStates.endUserId, params.endUserId),
            eq(lotteryUserStates.version, userState.version),
          ),
        )
        .returning();
      if (stateUpdated.length === 0) {
        throw new LotteryConcurrencyConflict();
      }

      // 8. Grant reward items
      if (selection.prize.rewardItems.length > 0) {
        await itemSvc.grantItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          grants: selection.prize.rewardItems,
          source: "lottery",
          sourceId: batchId,
        });
      }

      // 9. Insert pull log
      const pullEntry: PullResultEntry = {
        batchIndex: 0,
        prizeId: selection.prize.id,
        prizeName: selection.prize.name,
        tierId: selection.tierId,
        tierName: selection.tierName,
        rewardItems: selection.prize.rewardItems,
        pityTriggered: selection.pityTriggered,
        pityRuleId: selection.pityRuleId,
      };

      await db.insert(lotteryPullLogs).values({
        organizationId: params.organizationId,
        poolId: pool.id,
        endUserId: params.endUserId,
        batchId,
        batchIndex: 0,
        prizeId: selection.prize.id,
        tierId: selection.tierId,
        tierName: selection.tierName,
        prizeName: selection.prize.name,
        rewardItems: selection.prize.rewardItems,
        pityTriggered: selection.pityTriggered,
        pityRuleId: selection.pityRuleId,
        pityCountersBefore: userState.pityCounters,
        costItems,
      });

      if (events) {
        await events.emit("lottery.pulled", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          batchId,
          poolId: pool.id,
          poolAlias: pool.alias,
          count: 1,
          pulls: [pullEntry],
          costItems,
          pityTriggeredCount: selection.pityTriggered ? 1 : 0,
        });
      }

      return {
        batchId,
        poolId: pool.id,
        endUserId: params.endUserId,
        costItems,
        pulls: [pullEntry],
      };
    },

    async multiPull(params: {
      organizationId: string;
      endUserId: string;
      poolKey: string;
      count: number;
      idempotencyKey?: string;
    }): Promise<PullResult> {
      const batchId = params.idempotencyKey ?? crypto.randomUUID();

      // 1. Idempotency check
      const existing = await db
        .select({ id: lotteryPullLogs.id })
        .from(lotteryPullLogs)
        .where(eq(lotteryPullLogs.batchId, batchId))
        .limit(1);
      if (existing.length > 0) {
        const logs = await db
          .select()
          .from(lotteryPullLogs)
          .where(eq(lotteryPullLogs.batchId, batchId))
          .orderBy(lotteryPullLogs.batchIndex);
        const first = logs[0]!;
        return {
          batchId,
          poolId: first.poolId,
          endUserId: first.endUserId,
          costItems: first.costItems,
          pulls: logs.map((l) => ({
            batchIndex: l.batchIndex,
            prizeId: l.prizeId,
            prizeName: l.prizeName,
            tierId: l.tierId,
            tierName: l.tierName,
            rewardItems: l.rewardItems,
            pityTriggered: l.pityTriggered,
            pityRuleId: l.pityRuleId,
          })),
        };
      }

      // 2. Load pool + validate
      const { pool, tiers, prizes, pityRules } = await loadPoolData(
        params.organizationId,
        params.poolKey,
      );
      validatePoolActive(pool);
      // 2b. Activity-phase gate (see pull).
      if (pool.activityId) {
        await assertActivityWritable(db, pool.activityId);
      }

      // 3. Check global pull limit (claim N slots)
      if (pool.globalPullLimit != null) {
        const updated = await db
          .update(lotteryPools)
          .set({
            globalPullCount: sql`${lotteryPools.globalPullCount} + ${params.count}`,
          })
          .where(
            and(
              eq(lotteryPools.id, pool.id),
              sql`${lotteryPools.globalPullCount} + ${params.count} <= ${pool.globalPullLimit}`,
            ),
          )
          .returning({ id: lotteryPools.id });
        if (updated.length === 0) {
          throw new LotteryPoolGlobalLimitReached(pool.id);
        }
      }

      // 4. Deduct total cost (costPerPull × count)
      const totalCost = pool.costPerPull.map((c) => ({
        type: c.type,
        id: c.id,
        count: c.count * params.count,
      } as RewardEntry));
      if (totalCost.length > 0) {
        await itemSvc.deductItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          deductions: totalCost,
          source: "lottery",
          sourceId: batchId,
        });
      }

      // 5. Load user state
      const userState = await loadOrInitUserState(
        pool.id,
        params.endUserId,
        params.organizationId,
      );

      // 6. Selection loop (in-memory pity tracking)
      let pityCounters = { ...userState.pityCounters };
      const pullEntries: PullResultEntry[] = [];
      const stockClaims: Map<string, number> = new Map(); // prizeId → claim count
      // Track in-memory stock depletion
      const localStockUsed: Map<string, number> = new Map();

      for (let i = 0; i < params.count; i++) {
        const excludeIds = new Set<string>();
        // Pre-exclude locally-depleted prizes
        for (const prize of prizes) {
          if (prize.globalStockLimit != null) {
            const used =
              prize.globalStockUsed + (localStockUsed.get(prize.id) ?? 0);
            if (used >= prize.globalStockLimit) {
              excludeIds.add(prize.id);
            }
          }
        }

        let selection = executeSingleSelection(
          tiers,
          prizes,
          pityRules,
          pityCounters,
          excludeIds,
        );
        if (!selection) throw new LotteryNoPrizesAvailable(pool.id);

        // Handle stock-limited prizes locally
        if (selection.prize.globalStockLimit != null) {
          const used =
            selection.prize.globalStockUsed +
            (localStockUsed.get(selection.prize.id) ?? 0);
          if (used >= selection.prize.globalStockLimit) {
            // Try fallback
            excludeIds.add(selection.prize.id);
            selection = executeSingleSelection(
              tiers,
              prizes,
              pityRules,
              pityCounters,
              excludeIds,
            );
            if (!selection) throw new LotteryNoPrizesAvailable(pool.id);
          }
        }

        // Track local stock usage
        if (selection.prize.globalStockLimit != null) {
          localStockUsed.set(
            selection.prize.id,
            (localStockUsed.get(selection.prize.id) ?? 0) + 1,
          );
          stockClaims.set(
            selection.prize.id,
            (stockClaims.get(selection.prize.id) ?? 0) + 1,
          );
        }

        // Update in-memory pity counters
        pityCounters = updatePityCounters(
          pityRules,
          pityCounters,
          selection.tierId,
        );

        pullEntries.push({
          batchIndex: i,
          prizeId: selection.prize.id,
          prizeName: selection.prize.name,
          tierId: selection.tierId,
          tierName: selection.tierName,
          rewardItems: selection.prize.rewardItems,
          pityTriggered: selection.pityTriggered,
          pityRuleId: selection.pityRuleId,
        });
      }

      // 7. Claim stock in DB (one UPDATE per prize)
      for (const [prizeId, count] of stockClaims) {
        const updated = await db
          .update(lotteryPrizes)
          .set({
            globalStockUsed: sql`${lotteryPrizes.globalStockUsed} + ${count}`,
          })
          .where(
            and(
              eq(lotteryPrizes.id, prizeId),
              sql`${lotteryPrizes.globalStockUsed} + ${count} <= ${lotteryPrizes.globalStockLimit}`,
            ),
          )
          .returning({ id: lotteryPrizes.id });
        // If stock claim fails, we accept this risk (same as exchange)
        // The in-memory check already filtered, so this is very unlikely
        if (updated.length === 0) {
          // Best-effort: log but don't fail the whole batch
          console.warn(
            `lottery: stock claim failed for prize ${prizeId}, count ${count}`,
          );
        }
      }

      // 8. Update pity state (one atomic UPDATE with version guard)
      const stateUpdated = await db
        .update(lotteryUserStates)
        .set({
          totalPullCount: sql`${lotteryUserStates.totalPullCount} + ${params.count}`,
          pityCounters,
          version: sql`${lotteryUserStates.version} + 1`,
        })
        .where(
          and(
            eq(lotteryUserStates.poolId, pool.id),
            eq(lotteryUserStates.endUserId, params.endUserId),
            eq(lotteryUserStates.version, userState.version),
          ),
        )
        .returning();
      if (stateUpdated.length === 0) {
        throw new LotteryConcurrencyConflict();
      }

      // 9. Grant all reward items (merge duplicates)
      const mergedGrants = new Map<string, number>();
      for (const entry of pullEntries) {
        for (const item of entry.rewardItems) {
          mergedGrants.set(
            item.id,
            (mergedGrants.get(item.id) ?? 0) + item.count,
          );
        }
      }
      if (mergedGrants.size > 0) {
        const grants = Array.from(mergedGrants.entries()).map(
          ([definitionId, quantity]) => ({ definitionId, quantity }),
        );
        await itemSvc.grantItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          grants,
          source: "lottery",
          sourceId: batchId,
        });
      }

      // 10. Insert pull logs (batch insert)
      await db.insert(lotteryPullLogs).values(
        pullEntries.map((entry) => ({
          organizationId: params.organizationId,
          poolId: pool.id,
          endUserId: params.endUserId,
          batchId,
          batchIndex: entry.batchIndex,
          prizeId: entry.prizeId,
          tierId: entry.tierId,
          tierName: entry.tierName,
          prizeName: entry.prizeName,
          rewardItems: entry.rewardItems,
          pityTriggered: entry.pityTriggered,
          pityRuleId: entry.pityRuleId,
          pityCountersBefore: userState.pityCounters,
          costItems: pool.costPerPull,
        })),
      );

      const totalCostItems = pool.costPerPull.map((c) => ({
        ...c,
        count: c.count * params.count,
      }));
      const pityTriggeredCount = pullEntries.reduce(
        (n, e) => (e.pityTriggered ? n + 1 : n),
        0,
      );

      if (events) {
        await events.emit("lottery.pulled", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          batchId,
          poolId: pool.id,
          poolAlias: pool.alias,
          count: params.count,
          pulls: pullEntries,
          costItems: totalCostItems,
          pityTriggeredCount,
        });
      }

      return {
        batchId,
        poolId: pool.id,
        endUserId: params.endUserId,
        costItems: totalCostItems,
        pulls: pullEntries,
      };
    },

    // ─── Query helpers ─────────────────────────────────────────

    async getUserState(params: {
      organizationId: string;
      endUserId: string;
      poolKey: string;
    }) {
      const pool = await loadPoolByKey(
        params.organizationId,
        params.poolKey,
      );
      const rows = await db
        .select()
        .from(lotteryUserStates)
        .where(
          and(
            eq(lotteryUserStates.poolId, pool.id),
            eq(lotteryUserStates.endUserId, params.endUserId),
          ),
        )
        .limit(1);
      return {
        poolId: pool.id,
        endUserId: params.endUserId,
        totalPullCount: rows[0]?.totalPullCount ?? 0,
        pityCounters: rows[0]?.pityCounters ?? {},
      };
    },

    async getPullHistory(params: {
      organizationId: string;
      endUserId: string;
      poolKey: string;
      limit?: number;
      offset?: number;
    }) {
      const pool = await loadPoolByKey(
        params.organizationId,
        params.poolKey,
      );
      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;
      return db
        .select()
        .from(lotteryPullLogs)
        .where(
          and(
            eq(lotteryPullLogs.poolId, pool.id),
            eq(lotteryPullLogs.endUserId, params.endUserId),
          ),
        )
        .orderBy(desc(lotteryPullLogs.createdAt))
        .limit(limit)
        .offset(offset);
    },
  };
}

export type LotteryService = ReturnType<typeof createLotteryService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
