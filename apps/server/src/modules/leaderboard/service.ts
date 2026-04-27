/**
 * Leaderboard service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Dependencies arrive via a typed `Pick<AppDeps, ...>` factory param and
 * an optional mail-service getter for cycle-settlement reward delivery.
 *
 * ---------------------------------------------------------------------
 * Writes: Redis ZSET is the live truth, PG is the durable mirror
 * ---------------------------------------------------------------------
 *
 * Every `contribute()` fans out to all matching configs and, for each,
 * performs two writes:
 *
 *   1. Redis ZSET update keyed by (org, config, cycle, scope) honoring
 *      the config's aggregation policy (sum / max / latest).
 *   2. Postgres upsert of the same (config, cycle, scope, endUser) row
 *      with the same aggregation semantics.
 *
 * If Redis is down, the Postgres write still succeeds and later reads
 * fall back to PG. If PG fails we re-throw and abandon the Redis write
 * — the caller will likely retry, and a later settlement cron rebuilds
 * Redis from PG if the gap widens.
 *
 * ---------------------------------------------------------------------
 * Settlement: closes cycles that have rolled over
 * ---------------------------------------------------------------------
 *
 * `settleDue(now)` is called from the hourly cron trigger. For each
 * active, non-`all_time` config it:
 *
 *   1. Enumerates (previous-cycle-key, scope-key) pairs that have NOT
 *      yet been snapshotted.
 *   2. Reads the top-N rankings for that bucket from Redis (with PG
 *      fallback) and inserts a `leaderboard_snapshots` row. The unique
 *      (config_id, cycle_key, scope_key) index guarantees exactly one
 *      snapshot per cycle end, even if the cron double-fires.
 *   3. For each rank that matches a `reward_tiers` entry, inserts a
 *      `leaderboard_reward_claims` row (unique key = dedup) and — if
 *      mail is wired — dispatches a unicast reward mail with a stable
 *      `originSourceId = snapshotId:rank:endUserId` for end-to-end
 *      idempotency across cron retries.
 *   4. Trims / purges the Redis ZSET so the next cycle starts fresh.
 */

import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";

// Augment the runtime event-bus type map. Other modules can subscribe
// to `leaderboard.contributed` without reaching into this service.
declare module "../../lib/event-bus" {
  interface EventMap {
    "leaderboard.contributed": {
      organizationId: string;
      endUserId: string;
      metricKey: string;
      value: number;
      applied: number;
    };
  }
}
import type { RewardEntry } from "../../lib/rewards";
import {
  cardinality,
  leaderboardKey,
  purge,
  rangeWithScores,
  rankOf,
  scoreOf,
  topWithScores,
  trimTop,
  zAddWithPolicy,
  type ZRangeEntry,
} from "../../lib/redis-zset";
import {
  leaderboardConfigs,
  leaderboardEntries,
  leaderboardRewardClaims,
  leaderboardSnapshots,
  type LeaderboardRewardTier,
  type LeaderboardSnapshotRow,
} from "../../schema/leaderboard";
import { getActivityPhases, isWritablePhase } from "../activity/gate";
import {
  LeaderboardAliasConflict,
  LeaderboardConfigNotFound,
  LeaderboardInvalidInput,
} from "./errors";
import { cycleIsDue, cycleKeyFor, previousCycleKey } from "./time";
import type {
  AggregationMode,
  ConfigStatus,
  ContributeInput,
  CycleMode,
  FanoutResult,
  LeaderboardConfig,
  LeaderboardRanking,
  ScopeMode,
  TopResult,
} from "./types";
import type { CreateConfigInput, UpdateConfigInput } from "./validators";
import { logger } from "../../lib/logger";

type LeaderboardDeps = Pick<AppDeps, "db" | "redis" | "events">;

/**
 * Structural shape of `mailService.sendUnicast`. We intentionally keep
 * it structural instead of importing the concrete MailService type so
 * leaderboard can be constructed without importing the mail module at
 * module-eval time.
 */
type MailLike = {
  sendUnicast: (
    organizationId: string,
    endUserId: string,
    input: {
      title: string;
      content: string;
      rewards: RewardEntry[];
      originSource: string;
      originSourceId: string;
      senderAdminId?: string | null;
      expiresAt?: string | null;
    },
  ) => Promise<unknown>;
};

type MailGetter = () => MailLike | null;

function resolveScopeKeys(
  orgId: string,
  scope: ScopeMode,
  ctx: ContributeInput["scopeContext"],
): string[] {
  switch (scope) {
    case "global":
      return [orgId];
    case "guild":
      return ctx?.guildId ? [ctx.guildId] : [];
    case "team":
      return ctx?.teamId ? [ctx.teamId] : [];
    case "friend":
      return ctx?.friendOwnerIds ?? [];
  }
}

export function createLeaderboardService(
  d: LeaderboardDeps,
  mailGetter: MailGetter = () => null,
) {
  const { db, redis, events } = d;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<LeaderboardConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(leaderboardConfigs.organizationId, organizationId),
          eq(leaderboardConfigs.id, key),
        )
      : and(
          eq(leaderboardConfigs.organizationId, organizationId),
          eq(leaderboardConfigs.alias, key),
        );
    const rows = await db
      .select()
      .from(leaderboardConfigs)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new LeaderboardConfigNotFound(key);
    return row;
  }

  /**
   * Upsert a single entry row with aggregation-aware SQL. Returns the
   * row's new score. Uses EXCLUDED to reference the pending insert.
   */
  async function upsertEntry(
    config: LeaderboardConfig,
    cycleKey: string,
    scopeKey: string,
    endUserId: string,
    value: number,
    displaySnapshot: Record<string, unknown> | null,
    source: string | null,
    now: Date,
  ): Promise<number> {
    const aggregation = config.aggregation as AggregationMode;

    // Base VALUES — the "sum" aggregation needs the raw delta; "max" and
    // "latest" need the candidate value to compare against.
    const [row] = await db
      .insert(leaderboardEntries)
      .values({
        configId: config.id,
        organizationId: config.organizationId,
        cycleKey,
        scopeKey,
        endUserId,
        score: value,
        tieAt: now,
        displaySnapshot,
        source,
      })
      .onConflictDoUpdate({
        target: [
          leaderboardEntries.configId,
          leaderboardEntries.cycleKey,
          leaderboardEntries.scopeKey,
          leaderboardEntries.endUserId,
        ],
        set: {
          score:
            aggregation === "sum"
              ? sql`${leaderboardEntries.score} + EXCLUDED.score`
              : aggregation === "max"
                ? sql`GREATEST(${leaderboardEntries.score}, EXCLUDED.score)`
                : sql`EXCLUDED.score`,
          // Only bump tieAt when the score actually changes and the
          // config's tieBreaker calls for it. For "earliest" we keep
          // the existing tieAt; for "latest" we always overwrite.
          tieAt:
            config.tieBreaker === "latest"
              ? sql`EXCLUDED.tie_at`
              : sql`${leaderboardEntries.tieAt}`,
          displaySnapshot: sql`COALESCE(EXCLUDED.display_snapshot, ${leaderboardEntries.displaySnapshot})`,
          source: sql`COALESCE(EXCLUDED.source, ${leaderboardEntries.source})`,
        },
      })
      .returning({ score: leaderboardEntries.score });

    return row?.score ?? value;
  }

  async function zsetUpdate(
    config: LeaderboardConfig,
    cycleKey: string,
    scopeKey: string,
    endUserId: string,
    value: number,
  ): Promise<number | null> {
    try {
      const key = leaderboardKey({
        organizationId: config.organizationId,
        configId: config.id,
        cycleKey,
        scopeKey,
      });
      const newScore = await zAddWithPolicy(
        redis,
        key,
        endUserId,
        value,
        config.aggregation as AggregationMode,
      );
      // Trim aggressively so a hot metric doesn't keep an unbounded set.
      if (newScore !== null) {
        const size = await cardinality(redis, key);
        if (size > config.maxEntries) {
          await trimTop(redis, key, config.maxEntries);
        }
      }
      return newScore;
    } catch (err) {
      // Redis is best-effort; if it fails, PG still holds the truth.
      logger.warn("[leaderboard] redis update failed:", err);
      return null;
    }
  }

  function deriveScope(
    config: LeaderboardConfig,
    organizationId: string,
    ctx: ContributeInput["scopeContext"],
  ): string[] {
    return resolveScopeKeys(organizationId, config.scope as ScopeMode, ctx);
  }

  function isWithinWindow(
    config: LeaderboardConfig,
    now: Date,
  ): boolean {
    if (config.startAt && config.startAt.getTime() > now.getTime())
      return false;
    if (config.endAt && config.endAt.getTime() <= now.getTime())
      return false;
    return true;
  }

  return {
    // ─── CRUD ────────────────────────────────────────────────────

    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<LeaderboardConfig> {
      try {
        const [row] = await db
          .insert(leaderboardConfigs)
          .values({
            organizationId,
            alias: input.alias,
            name: input.name,
            description: input.description ?? null,
            metricKey: input.metricKey,
            cycle: input.cycle,
            weekStartsOn: input.weekStartsOn ?? 1,
            timezone: input.timezone ?? "UTC",
            scope: input.scope ?? "global",
            aggregation: input.aggregation ?? "sum",
            maxEntries: input.maxEntries ?? 1000,
            tieBreaker: input.tieBreaker ?? "earliest",
            rewardTiers: (input.rewardTiers ??
              []) as LeaderboardRewardTier[],
            startAt: input.startAt ? new Date(input.startAt) : null,
            endAt: input.endAt ? new Date(input.endAt) : null,
            status: input.status ?? "active",
            activityId: input.activityId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new LeaderboardAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateConfig(
      organizationId: string,
      idOrAlias: string,
      patch: UpdateConfigInput,
    ): Promise<LeaderboardConfig> {
      const existing = await loadConfigByKey(organizationId, idOrAlias);
      const values: Partial<typeof leaderboardConfigs.$inferInsert> = {};
      if (patch.alias !== undefined) values.alias = patch.alias;
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.metricKey !== undefined) values.metricKey = patch.metricKey;
      if (patch.weekStartsOn !== undefined)
        values.weekStartsOn = patch.weekStartsOn;
      if (patch.timezone !== undefined) values.timezone = patch.timezone;
      if (patch.aggregation !== undefined) values.aggregation = patch.aggregation;
      if (patch.maxEntries !== undefined) values.maxEntries = patch.maxEntries;
      if (patch.tieBreaker !== undefined) values.tieBreaker = patch.tieBreaker;
      if (patch.rewardTiers !== undefined)
        values.rewardTiers = patch.rewardTiers as LeaderboardRewardTier[];
      if (patch.startAt !== undefined)
        values.startAt = patch.startAt ? new Date(patch.startAt) : null;
      if (patch.endAt !== undefined)
        values.endAt = patch.endAt ? new Date(patch.endAt) : null;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.activityId !== undefined) values.activityId = patch.activityId;
      if (patch.metadata !== undefined) values.metadata = patch.metadata;

      if (Object.keys(values).length === 0) return existing;

      try {
        const [row] = await db
          .update(leaderboardConfigs)
          .set(values)
          .where(
            and(
              eq(leaderboardConfigs.id, existing.id),
              eq(leaderboardConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new LeaderboardConfigNotFound(idOrAlias);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new LeaderboardAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(leaderboardConfigs)
        .where(
          and(
            eq(leaderboardConfigs.id, id),
            eq(leaderboardConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: leaderboardConfigs.id });
      if (deleted.length === 0) throw new LeaderboardConfigNotFound(id);
    },

    async listConfigs(
      organizationId: string,
      filter: PageParams & { metricKey?: string; status?: ConfigStatus } = {},
    ): Promise<Page<LeaderboardConfig>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(leaderboardConfigs.organizationId, organizationId)];
      if (filter.metricKey)
        conds.push(eq(leaderboardConfigs.metricKey, filter.metricKey));
      if (filter.status)
        conds.push(eq(leaderboardConfigs.status, filter.status));
      const seek = cursorWhere(filter.cursor, leaderboardConfigs.createdAt, leaderboardConfigs.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(leaderboardConfigs.name, pat), ilike(leaderboardConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(leaderboardConfigs)
        .where(and(...conds))
        .orderBy(desc(leaderboardConfigs.createdAt), desc(leaderboardConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getConfig(
      organizationId: string,
      idOrAlias: string,
    ): Promise<LeaderboardConfig> {
      return loadConfigByKey(organizationId, idOrAlias);
    },

    // ─── Contribute (the fan-out API) ────────────────────────────

    /**
     * Report a `metricKey` contribution. The service finds every matching
     * active config and writes to all of them in a single call. Callers
     * should not loop — one call per user action is the intended usage.
     */
    async contribute(input: ContributeInput): Promise<FanoutResult> {
      if (!Number.isFinite(input.value)) {
        throw new LeaderboardInvalidInput("value must be finite");
      }
      const now = input.now ?? new Date();

      // Find candidate configs.
      const conds = [
        eq(leaderboardConfigs.organizationId, input.organizationId),
        eq(leaderboardConfigs.metricKey, input.metricKey),
        eq(leaderboardConfigs.status, "active"),
      ];
      const configs = await db
        .select()
        .from(leaderboardConfigs)
        .where(and(...conds));

      // Batch-resolve activity phases for the configs that bind one.
      // Silent skip below for non-writable phases — contribute is
      // event-driven, throwing would surface as 4xx to upstream.
      const boundActivityIds = [
        ...new Set(
          configs.map((c) => c.activityId).filter((x): x is string => !!x),
        ),
      ];
      const activityPhaseMap = await getActivityPhases(
        db,
        boundActivityIds,
        now,
      );

      const details: FanoutResult["details"] = [];
      let applied = 0;

      for (const config of configs) {
        // Activity filter: config.activityId null → always; otherwise
        // only when the contribute call carries a matching activity.
        if (config.activityId) {
          if (config.activityId !== input.activityContext?.activityId) {
            continue;
          }
          // ...and the activity must be in its writable phase. Silent skip.
          if (!isWritablePhase(activityPhaseMap.get(config.activityId))) {
            continue;
          }
        }

        if (!isWithinWindow(config, now)) {
          details.push({
            configId: config.id,
            alias: config.alias,
            scopeKey: "",
            cycleKey: "",
            newScore: null,
            skipped: "time_window",
          });
          continue;
        }

        const scopeKeys = deriveScope(
          config,
          input.organizationId,
          input.scopeContext,
        );
        if (scopeKeys.length === 0) {
          details.push({
            configId: config.id,
            alias: config.alias,
            scopeKey: "",
            cycleKey: "",
            newScore: null,
            skipped: "no_scope_key",
          });
          continue;
        }

        const cycleKey = cycleKeyFor(
          now,
          config.cycle as CycleMode,
          config.timezone,
          config.weekStartsOn,
        );

        for (const scopeKey of scopeKeys) {
          // Best-effort idempotency: Redis SETNX with a TTL slightly
          // longer than the cycle horizon. Safe to skip on Redis
          // outage — the durable PG row is the final authority.
          if (input.idempotencyKey) {
            const ok = await redisSetNx(
              redis,
              `lb-idem:${config.id}:${cycleKey}:${scopeKey}:${input.endUserId}:${input.idempotencyKey}`,
              86_400 * 7,
            );
            if (!ok) {
              details.push({
                configId: config.id,
                alias: config.alias,
                scopeKey,
                cycleKey,
                newScore: null,
                skipped: "idempotent",
              });
              continue;
            }
          }

          const pgScore = await upsertEntry(
            config,
            cycleKey,
            scopeKey,
            input.endUserId,
            input.value,
            input.displaySnapshot ?? null,
            input.source ?? null,
            now,
          );
          // Redis doesn't need to win — but when it does, prefer the
          // Redis score (it's what reads return).
          const redisScore = await zsetUpdate(
            config,
            cycleKey,
            scopeKey,
            input.endUserId,
            input.value,
          );

          applied++;
          details.push({
            configId: config.id,
            alias: config.alias,
            scopeKey,
            cycleKey,
            newScore: redisScore ?? pgScore,
          });
        }
      }

      // Fire an event for any listeners (future: activity modules that
      // want to react to score updates without tight coupling).
      await events.emit("leaderboard.contributed", {
        organizationId: input.organizationId,
        endUserId: input.endUserId,
        metricKey: input.metricKey,
        value: input.value,
        applied,
      });

      return { applied, details };
    },

    // ─── Read ────────────────────────────────────────────────────

    async getTop(params: {
      organizationId: string;
      configKey: string;
      cycleKey?: string;
      scopeKey?: string;
      limit?: number;
      endUserId?: string;
      now?: Date;
    }): Promise<TopResult> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      const now = params.now ?? new Date();
      const cycleKey =
        params.cycleKey ??
        cycleKeyFor(
          now,
          config.cycle as CycleMode,
          config.timezone,
          config.weekStartsOn,
        );
      const scopeKey = resolveReadScope(
        config,
        params.organizationId,
        params.scopeKey,
      );
      const limit = Math.max(
        1,
        Math.min(params.limit ?? 100, config.maxEntries),
      );
      const rankings = await readTop(
        config,
        cycleKey,
        scopeKey,
        limit,
        params.organizationId,
        redis,
        db,
      );

      let self: TopResult["self"];
      if (params.endUserId) {
        self = await readSelf(
          config,
          cycleKey,
          scopeKey,
          params.endUserId,
          redis,
          db,
        );
      }

      return {
        configId: config.id,
        alias: config.alias,
        cycleKey,
        scopeKey,
        rankings,
        self,
      };
    },

    async getNeighbors(params: {
      organizationId: string;
      configKey: string;
      endUserId: string;
      cycleKey?: string;
      scopeKey?: string;
      window?: number;
      now?: Date;
    }): Promise<TopResult> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      const now = params.now ?? new Date();
      const cycleKey =
        params.cycleKey ??
        cycleKeyFor(
          now,
          config.cycle as CycleMode,
          config.timezone,
          config.weekStartsOn,
        );
      const scopeKey = resolveReadScope(
        config,
        params.organizationId,
        params.scopeKey,
      );
      const window = Math.max(1, Math.min(params.window ?? 5, 50));

      const key = leaderboardKey({
        organizationId: params.organizationId,
        configId: config.id,
        cycleKey,
        scopeKey,
      });
      const selfRank = await rankOf(redis, key, params.endUserId);
      if (selfRank === null) {
        // Fallback: no entry in Redis; return empty with null self.
        return {
          configId: config.id,
          alias: config.alias,
          cycleKey,
          scopeKey,
          rankings: [],
          self: { rank: null, score: null },
        };
      }
      const start = Math.max(0, selfRank - window);
      const stop = selfRank + window;
      const entries = await rangeWithScores(redis, key, start, stop);
      const selfScore = await scoreOf(redis, key, params.endUserId);

      return {
        configId: config.id,
        alias: config.alias,
        cycleKey,
        scopeKey,
        rankings: entries.map((e, i) => ({
          rank: start + i + 1,
          endUserId: e.member,
          score: e.score,
        })),
        self: { rank: selfRank + 1, score: selfScore },
      };
    },

    async listSnapshots(params: {
      organizationId: string;
      configKey: string;
      limit?: number;
    }) {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
      return db
        .select()
        .from(leaderboardSnapshots)
        .where(
          and(
            eq(leaderboardSnapshots.configId, config.id),
            eq(leaderboardSnapshots.organizationId, params.organizationId),
          ),
        )
        .orderBy(desc(leaderboardSnapshots.settledAt))
        .limit(limit);
    },

    // ─── Settlement (cron) ───────────────────────────────────────

    /**
     * Close every ripe (config, cycleKey, scopeKey) triple as of `now`.
     * Safe to call repeatedly — snapshot/claim unique keys enforce
     * exactly-once delivery.
     */
    async settleDue(params: { now?: Date } = {}): Promise<{
      settled: number;
      errors: number;
    }> {
      const now = params.now ?? new Date();
      const activeConfigs = await db
        .select()
        .from(leaderboardConfigs)
        .where(eq(leaderboardConfigs.status, "active"));

      let settled = 0;
      let errors = 0;

      for (const config of activeConfigs) {
        if (config.cycle === "all_time") continue; // never settles

        const prevKey = previousCycleKey(
          now,
          config.cycle as CycleMode,
          config.timezone,
          config.weekStartsOn,
        );
        if (!prevKey) continue;
        // Defensive: only proceed if current key has moved past prevKey.
        if (
          !cycleIsDue(
            now,
            prevKey,
            config.cycle as CycleMode,
            config.timezone,
            config.weekStartsOn,
          )
        ) {
          continue;
        }

        // Enumerate scopeKeys with entries in this prev cycle that have
        // not yet been snapshotted. We source the list from PG (the
        // durable mirror) rather than Redis (which may have been purged).
        const scopesWithData = await db
          .selectDistinct({ scopeKey: leaderboardEntries.scopeKey })
          .from(leaderboardEntries)
          .where(
            and(
              eq(leaderboardEntries.configId, config.id),
              eq(leaderboardEntries.cycleKey, prevKey),
            ),
          );

        if (scopesWithData.length === 0) continue;

        const alreadySnapped = await db
          .select({ scopeKey: leaderboardSnapshots.scopeKey })
          .from(leaderboardSnapshots)
          .where(
            and(
              eq(leaderboardSnapshots.configId, config.id),
              eq(leaderboardSnapshots.cycleKey, prevKey),
              inArray(
                leaderboardSnapshots.scopeKey,
                scopesWithData.map((s) => s.scopeKey),
              ),
            ),
          );
        const snappedSet = new Set(alreadySnapped.map((s) => s.scopeKey));

        for (const { scopeKey } of scopesWithData) {
          if (snappedSet.has(scopeKey)) continue;
          try {
            await this.settleBucket({
              config,
              cycleKey: prevKey,
              scopeKey,
              now,
            });
            settled++;
          } catch (err) {
            errors++;
            logger.error(
              `[leaderboard] settle failed config=${config.id} cycle=${prevKey} scope=${scopeKey}:`,
              err,
            );
          }
        }
      }

      return { settled, errors };
    },

    /**
     * Settle a single (config, cycleKey, scopeKey) tuple. Idempotent
     * via the snapshots unique index and the reward-claims unique key.
     */
    async settleBucket(params: {
      config: LeaderboardConfig;
      cycleKey: string;
      scopeKey: string;
      now?: Date;
    }): Promise<void> {
      const { config, cycleKey, scopeKey } = params;
      const now = params.now ?? new Date();
      const key = leaderboardKey({
        organizationId: config.organizationId,
        configId: config.id,
        cycleKey,
        scopeKey,
      });

      // Prefer Redis for the final standings (it has live tie-breaking
      // by lex order on member id). Fall back to PG when Redis is empty
      // or errored — PG has tieAt for explicit tie-breaking.
      let entries: ZRangeEntry[] = [];
      try {
        entries = await topWithScores(redis, key, config.maxEntries);
      } catch (err) {
        logger.warn("[leaderboard] settle read redis failed:", err);
      }

      if (entries.length === 0) {
        const pgRows = await db
          .select({
            endUserId: leaderboardEntries.endUserId,
            score: leaderboardEntries.score,
            tieAt: leaderboardEntries.tieAt,
          })
          .from(leaderboardEntries)
          .where(
            and(
              eq(leaderboardEntries.configId, config.id),
              eq(leaderboardEntries.cycleKey, cycleKey),
              eq(leaderboardEntries.scopeKey, scopeKey),
            ),
          )
          .orderBy(
            desc(leaderboardEntries.score),
            config.tieBreaker === "latest"
              ? desc(leaderboardEntries.tieAt)
              : leaderboardEntries.tieAt,
          )
          .limit(config.maxEntries);
        entries = pgRows.map((r) => ({
          member: r.endUserId,
          score: r.score,
        }));
      }

      if (entries.length === 0) return;

      // Fetch display snapshots from PG in one round-trip.
      const ids = entries.map((e) => e.member);
      const displays = await db
        .select({
          endUserId: leaderboardEntries.endUserId,
          displaySnapshot: leaderboardEntries.displaySnapshot,
        })
        .from(leaderboardEntries)
        .where(
          and(
            eq(leaderboardEntries.configId, config.id),
            eq(leaderboardEntries.cycleKey, cycleKey),
            eq(leaderboardEntries.scopeKey, scopeKey),
            inArray(leaderboardEntries.endUserId, ids),
          ),
        );
      const displayMap = new Map<string, Record<string, unknown> | null>();
      for (const d of displays) {
        displayMap.set(
          d.endUserId,
          (d.displaySnapshot ?? null) as Record<string, unknown> | null,
        );
      }

      const rankings: LeaderboardSnapshotRow[] = entries.map((e, i) => ({
        rank: i + 1,
        endUserId: e.member,
        score: e.score,
        displaySnapshot: displayMap.get(e.member) ?? null,
      }));

      // Persist snapshot (unique index is the final idempotency gate).
      let snapshotId: string;
      try {
        const [row] = await db
          .insert(leaderboardSnapshots)
          .values({
            configId: config.id,
            organizationId: config.organizationId,
            cycleKey,
            scopeKey,
            rankings,
            rewardPlan: config.rewardTiers as LeaderboardRewardTier[],
            settledAt: now,
          })
          .returning({ id: leaderboardSnapshots.id });
        snapshotId = row!.id;
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Someone beat us to it — nothing more to do.
          return;
        }
        throw err;
      }

      // Dispatch rank-tier rewards.
      const tiers = (config.rewardTiers ?? []) as LeaderboardRewardTier[];
      if (tiers.length > 0) {
        await dispatchTierRewards({
          db,
          mailGetter,
          config,
          cycleKey,
          scopeKey,
          snapshotId,
          rankings,
          tiers,
        });
      }

      // Release Redis memory for this closed bucket. Safe because the
      // snapshot has been durably written.
      try {
        await purge(redis, key);
      } catch (err) {
        logger.warn("[leaderboard] redis purge failed:", err);
      }
    },
  };
}

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;

// ─── Internals ────────────────────────────────────────────────────

function resolveReadScope(
  config: LeaderboardConfig,
  orgId: string,
  provided: string | undefined,
): string {
  if (provided) return provided;
  if (config.scope === "global") return orgId;
  throw new LeaderboardInvalidInput(
    `scopeKey is required for scope=${config.scope}`,
  );
}

async function readTop(
  config: LeaderboardConfig,
  cycleKey: string,
  scopeKey: string,
  limit: number,
  _organizationId: string,
  redis: AppDeps["redis"],
  db: AppDeps["db"],
): Promise<LeaderboardRanking[]> {
  const key = leaderboardKey({
    organizationId: config.organizationId,
    configId: config.id,
    cycleKey,
    scopeKey,
  });
  try {
    const entries = await topWithScores(redis, key, limit);
    if (entries.length > 0) {
      const ids = entries.map((e) => e.member);
      const displays = await db
        .select({
          endUserId: leaderboardEntries.endUserId,
          displaySnapshot: leaderboardEntries.displaySnapshot,
        })
        .from(leaderboardEntries)
        .where(
          and(
            eq(leaderboardEntries.configId, config.id),
            eq(leaderboardEntries.cycleKey, cycleKey),
            eq(leaderboardEntries.scopeKey, scopeKey),
            inArray(leaderboardEntries.endUserId, ids),
          ),
        );
      const map = new Map<string, Record<string, unknown> | null>();
      for (const d of displays) {
        map.set(
          d.endUserId,
          (d.displaySnapshot ?? null) as Record<string, unknown> | null,
        );
      }
      return entries.map((e, i) => ({
        rank: i + 1,
        endUserId: e.member,
        score: e.score,
        displaySnapshot: map.get(e.member) ?? null,
      }));
    }
  } catch (err) {
    logger.warn("[leaderboard] top read redis failed, falling back:", err);
  }

  const rows = await db
    .select()
    .from(leaderboardEntries)
    .where(
      and(
        eq(leaderboardEntries.configId, config.id),
        eq(leaderboardEntries.cycleKey, cycleKey),
        eq(leaderboardEntries.scopeKey, scopeKey),
      ),
    )
    .orderBy(
      desc(leaderboardEntries.score),
      config.tieBreaker === "latest"
        ? desc(leaderboardEntries.tieAt)
        : leaderboardEntries.tieAt,
    )
    .limit(limit);
  return rows.map((r, i) => ({
    rank: i + 1,
    endUserId: r.endUserId,
    score: r.score,
    displaySnapshot: (r.displaySnapshot ?? null) as
      | Record<string, unknown>
      | null,
  }));
}

async function readSelf(
  config: LeaderboardConfig,
  cycleKey: string,
  scopeKey: string,
  endUserId: string,
  redis: AppDeps["redis"],
  db: AppDeps["db"],
): Promise<{ rank: number | null; score: number | null }> {
  const key = leaderboardKey({
    organizationId: config.organizationId,
    configId: config.id,
    cycleKey,
    scopeKey,
  });
  try {
    const r = await rankOf(redis, key, endUserId);
    const s = await scoreOf(redis, key, endUserId);
    if (r !== null || s !== null) {
      return { rank: r === null ? null : r + 1, score: s };
    }
  } catch (err) {
    logger.warn("[leaderboard] self read redis failed:", err);
  }
  // Fallback: expensive but correct — count higher-scoring entries.
  const rows = await db
    .select({ score: leaderboardEntries.score })
    .from(leaderboardEntries)
    .where(
      and(
        eq(leaderboardEntries.configId, config.id),
        eq(leaderboardEntries.cycleKey, cycleKey),
        eq(leaderboardEntries.scopeKey, scopeKey),
        eq(leaderboardEntries.endUserId, endUserId),
      ),
    )
    .limit(1);
  if (!rows[0]) return { rank: null, score: null };
  const self = rows[0];
  const higher = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(leaderboardEntries)
    .where(
      and(
        eq(leaderboardEntries.configId, config.id),
        eq(leaderboardEntries.cycleKey, cycleKey),
        eq(leaderboardEntries.scopeKey, scopeKey),
        sql`${leaderboardEntries.score} > ${self.score}`,
      ),
    );
  const rank = (higher[0]?.cnt ?? 0) + 1;
  return { rank, score: self.score };
}

async function dispatchTierRewards(params: {
  db: AppDeps["db"];
  mailGetter: MailGetter;
  config: LeaderboardConfig;
  cycleKey: string;
  scopeKey: string;
  snapshotId: string;
  rankings: LeaderboardSnapshotRow[];
  tiers: LeaderboardRewardTier[];
}): Promise<void> {
  const { db, mailGetter, config, cycleKey, scopeKey, snapshotId, rankings, tiers } =
    params;
  const mail = mailGetter();
  for (const row of rankings) {
    const tier = tiers.find((t) => row.rank >= t.from && row.rank <= t.to);
    if (!tier || tier.rewards.length === 0) continue;

    // Insert the dedup claim first — the unique index is our
    // exactly-once guarantee across cron retries.
    try {
      await db.insert(leaderboardRewardClaims).values({
        configId: config.id,
        organizationId: config.organizationId,
        cycleKey,
        scopeKey,
        endUserId: row.endUserId,
        rank: row.rank,
        rewards: tier.rewards,
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue; // already paid
      throw err;
    }

    if (!mail) continue; // no mail wired — the claim row is still correct

    try {
      await mail.sendUnicast(config.organizationId, row.endUserId, {
        title: `Leaderboard: ${config.name}`,
        content: `You placed #${row.rank} for cycle ${cycleKey}. Rewards inside.`,
        rewards: tier.rewards as RewardEntry[],
        originSource: "leaderboard_reward",
        originSourceId: `${snapshotId}:${row.rank}:${row.endUserId}`,
      });
    } catch (err) {
      // Mail failure does not roll back the claim row — operators can
      // re-dispatch from the claim table if needed. Log loudly.
      logger.error(
        `[leaderboard] mail dispatch failed config=${config.id} user=${row.endUserId}:`,
        err,
      );
    }
  }
}

async function redisSetNx(
  redis: AppDeps["redis"],
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  try {
    // Upstash returns "OK" on success, null when the key existed.
    const r = await redis.set(key, "1", { nx: true, ex: ttlSeconds });
    return r === "OK";
  } catch {
    return true; // on Redis failure, allow the write — PG remains authoritative
  }
}

