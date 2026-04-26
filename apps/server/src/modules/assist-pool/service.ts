/**
 * Assist-pool service — protocol-agnostic business logic.
 *
 * Models the 拼多多 "砍一刀 / 助力" pattern as a generic pool primitive:
 * an initiator opens a pool with a target amount; assisters contribute
 * per a configurable `contributionPolicy`; when `remaining` hits the
 * completion gate the pool settles exactly once and the initiator
 * receives the configured `rewards`.
 *
 * Must not import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Only the `AppDeps` type is allowed. See `apps/server/CLAUDE.md`.
 *
 * ---------------------------------------------------------------------
 * Concurrency — neon-http has no transactions
 * ---------------------------------------------------------------------
 *
 * Two race-critical write paths:
 *
 * 1. `contribute`: multiple assisters racing to push `remaining` to 0.
 *    Pattern: optimistic UPDATE with `version = $v AND status =
 *    'in_progress' AND expires_at > now()`. Losers (stale version, or
 *    newly-completed/expired) receive 0 rows from RETURNING and retry
 *    once after re-read (bounded). Overshooting is prevented by
 *    clamping `amount` to the current `remaining` in the service call,
 *    and the SQL predicate `status = 'in_progress'` prevents double-
 *    settlement once someone has flipped the row to 'completed'.
 *
 * 2. `settle`: concurrent `contribute` callers that both observed the
 *    completion-inducing write all try to insert the rewards ledger.
 *    Pattern: `INSERT INTO assist_pool_rewards_ledger (instance_id, …)
 *    VALUES (…) ON CONFLICT (instance_id) DO NOTHING RETURNING *`.
 *    Exactly one caller wins (UNIQUE on `instance_id`) and performs the
 *    real reward grant; everyone else gets 0 rows and skips the grant.
 *
 * Both paths are single SQL statements that return the authoritative
 * post-state — no SELECT … FOR UPDATE, no transactions.
 */

import { and, count, desc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { grantRewards, type RewardEntry } from "../../lib/rewards";
import {
  type AssistContributionPolicy,
  assistPoolConfigs,
  assistPoolContributions,
  assistPoolInstances,
  assistPoolRewardsLedger,
} from "../../schema/assist-pool";
import type { CurrencyService } from "../currency/service";
import type { ItemService } from "../item/service";
import {
  applyContribution,
  computeContribution,
  isComplete,
  workLeft,
  type Rng,
} from "./distribution";
import {
  AssistPoolAliasConflict,
  AssistPoolAlreadyCompleted,
  AssistPoolAssisterLimitReached,
  AssistPoolConfigInactive,
  AssistPoolConfigNotFound,
  AssistPoolInitiatorLimitReached,
  AssistPoolInstanceExpired,
  AssistPoolInstanceNotFound,
  AssistPoolInvalidInput,
  AssistPoolSelfAssistForbidden,
} from "./errors";
import { computeExpiresAt, isExpired } from "./time";
import type {
  AssistPoolConfig,
  AssistPoolContribution,
  AssistPoolInstance,
  AssistPoolMode,
  AssistPoolRewardLedger,
  AssistPoolStatus,
  ContributeResult,
} from "./types";
import type { CreateConfigInput, UpdateConfigInput } from "./validators";

// Extend the event-bus type map for assist-pool domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "assist_pool.instance_created": {
      organizationId: string;
      configId: string;
      instanceId: string;
      endUserId: string;
      targetAmount: number;
      expiresAt: string;
    };
    "assist_pool.contributed": {
      organizationId: string;
      configId: string;
      instanceId: string;
      endUserId: string;
      initiatorEndUserId: string;
      amount: number;
      remaining: number;
    };
    "assist_pool.completed": {
      organizationId: string;
      configId: string;
      instanceId: string;
      endUserId: string;
      rewards: RewardEntry[];
    };
    "assist_pool.expired": {
      organizationId: string;
      configId: string;
      instanceId: string;
      endUserId: string;
      reason: "timeout" | "force";
    };
  }
}

type AssistPoolDeps = Pick<AppDeps, "db" | "events">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

const CONTRIBUTE_MAX_RETRIES = 3;

function validateContributionPolicy(
  policy: AssistContributionPolicy,
  targetAmount: number,
) {
  switch (policy.kind) {
    case "fixed":
      if (policy.amount <= 0) {
        throw new AssistPoolInvalidInput("fixed policy: amount must be > 0");
      }
      break;
    case "uniform":
      if (policy.min <= 0 || policy.max < policy.min) {
        throw new AssistPoolInvalidInput(
          "uniform policy: require 0 < min <= max",
        );
      }
      break;
    case "decaying":
      if (policy.base <= 0 || policy.tailFloor <= 0) {
        throw new AssistPoolInvalidInput(
          "decaying policy: base and tailFloor must be > 0",
        );
      }
      if (policy.tailRatio < 0 || policy.tailRatio > 1) {
        throw new AssistPoolInvalidInput(
          "decaying policy: tailRatio must be in [0, 1]",
        );
      }
      break;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    throw new AssistPoolInvalidInput("targetAmount must be a positive integer");
  }
}

export type AssistPoolServiceOptions = {
  itemSvc?: ItemService;
  currencySvc?: CurrencyService;
  /** Inject for deterministic tests; defaults to `Math.random`. */
  rng?: Rng;
};

export function createAssistPoolService(
  d: AssistPoolDeps,
  opts: AssistPoolServiceOptions = {},
) {
  const { db, events } = d;
  const rng: Rng = opts.rng ?? Math.random;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<AssistPoolConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(assistPoolConfigs.organizationId, organizationId),
          eq(assistPoolConfigs.id, key),
        )
      : and(
          eq(assistPoolConfigs.organizationId, organizationId),
          eq(assistPoolConfigs.alias, key),
        );
    const rows = await db
      .select()
      .from(assistPoolConfigs)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new AssistPoolConfigNotFound(key);
    return row;
  }

  async function loadInstance(
    organizationId: string,
    instanceId: string,
  ): Promise<AssistPoolInstance> {
    const rows = await db
      .select()
      .from(assistPoolInstances)
      .where(
        and(
          eq(assistPoolInstances.id, instanceId),
          eq(assistPoolInstances.organizationId, organizationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new AssistPoolInstanceNotFound(instanceId);
    return row;
  }

  async function countAssisterContributions(
    instanceId: string,
    assisterEndUserId: string,
  ): Promise<number> {
    const rows = await db
      .select({ n: count() })
      .from(assistPoolContributions)
      .where(
        and(
          eq(assistPoolContributions.instanceId, instanceId),
          eq(assistPoolContributions.assisterEndUserId, assisterEndUserId),
        ),
      );
    return rows[0]?.n ?? 0;
  }

  async function countActiveInstancesForInitiator(
    configId: string,
    initiatorEndUserId: string,
  ): Promise<number> {
    const rows = await db
      .select({ n: count() })
      .from(assistPoolInstances)
      .where(
        and(
          eq(assistPoolInstances.configId, configId),
          eq(assistPoolInstances.initiatorEndUserId, initiatorEndUserId),
          eq(assistPoolInstances.status, "in_progress"),
        ),
      );
    return rows[0]?.n ?? 0;
  }

  async function settle(
    config: AssistPoolConfig,
    instance: AssistPoolInstance,
    now: Date,
  ): Promise<AssistPoolRewardLedger | null> {
    // Atomic ledger insert — UNIQUE(instance_id) elects exactly one
    // caller to do the real grant. Every other racer gets 0 rows back.
    const rewards: RewardEntry[] = config.rewards ?? [];
    const [ledgerRow] = await db
      .insert(assistPoolRewardsLedger)
      .values({
        organizationId: instance.organizationId,
        instanceId: instance.id,
        initiatorEndUserId: instance.initiatorEndUserId,
        rewards,
        grantedAt: now,
      })
      .onConflictDoNothing({ target: assistPoolRewardsLedger.instanceId })
      .returning();

    if (!ledgerRow) return null;

    // Stamp the instance's reward_granted_at — purely informational for
    // the admin UI, so failure is best-effort. The ledger row above is
    // the authoritative record.
    await db
      .update(assistPoolInstances)
      .set({ rewardGrantedAt: now })
      .where(eq(assistPoolInstances.id, instance.id));

    if (rewards.length > 0 && opts.itemSvc && opts.currencySvc) {
      await grantRewards(
        { itemSvc: opts.itemSvc, currencySvc: opts.currencySvc },
        instance.organizationId,
        instance.initiatorEndUserId,
        rewards,
        "assist_pool_reward",
        instance.id,
      );
    }

    await events.emit("assist_pool.completed", {
      organizationId: instance.organizationId,
      configId: instance.configId,
      instanceId: instance.id,
      endUserId: instance.initiatorEndUserId,
      rewards,
    });

    return ledgerRow;
  }

  return {
    // ─── Config CRUD ────────────────────────────────────────────
    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<AssistPoolConfig> {
      const policy = input.contributionPolicy;
      const target = input.targetAmount;
      validateContributionPolicy(policy, target);

      try {
        const [row] = await db
          .insert(assistPoolConfigs)
          .values({
            organizationId,
            alias: input.alias ?? null,
            name: input.name,
            description: input.description ?? null,
            mode: input.mode ?? "decrement",
            targetAmount: target,
            contributionPolicy: policy,
            perAssisterLimit: input.perAssisterLimit ?? 1,
            initiatorCanAssist: input.initiatorCanAssist ?? false,
            expiresInSeconds: input.expiresInSeconds ?? 86400,
            maxInstancesPerInitiator: input.maxInstancesPerInitiator ?? null,
            rewards: input.rewards ?? [],
            isActive: input.isActive ?? true,
            activityId: input.activityId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new AssistPoolAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateConfig(
      organizationId: string,
      id: string,
      patch: UpdateConfigInput,
    ): Promise<AssistPoolConfig> {
      const existing = await loadConfigByKey(organizationId, id);

      const updateValues: Partial<typeof assistPoolConfigs.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.perAssisterLimit !== undefined)
        updateValues.perAssisterLimit = patch.perAssisterLimit;
      if (patch.initiatorCanAssist !== undefined)
        updateValues.initiatorCanAssist = patch.initiatorCanAssist;
      if (patch.maxInstancesPerInitiator !== undefined)
        updateValues.maxInstancesPerInitiator = patch.maxInstancesPerInitiator;
      if (patch.rewards !== undefined) updateValues.rewards = patch.rewards;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.activityId !== undefined)
        updateValues.activityId = patch.activityId;
      if (patch.activityNodeId !== undefined)
        updateValues.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(assistPoolConfigs)
          .set(updateValues)
          .where(
            and(
              eq(assistPoolConfigs.id, existing.id),
              eq(assistPoolConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new AssistPoolConfigNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new AssistPoolAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(assistPoolConfigs)
        .where(
          and(
            eq(assistPoolConfigs.id, id),
            eq(assistPoolConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: assistPoolConfigs.id });
      if (deleted.length === 0) throw new AssistPoolConfigNotFound(id);
    },

    async listConfigs(
      organizationId: string,
      filter: PageParams & { includeActivity?: boolean; activityId?: string } = {},
    ): Promise<Page<AssistPoolConfig>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(assistPoolConfigs.organizationId, organizationId)];
      if (filter.activityId) {
        conds.push(eq(assistPoolConfigs.activityId, filter.activityId));
      } else if (!filter.includeActivity) {
        conds.push(sql`${assistPoolConfigs.activityId} IS NULL`);
      }
      const seek = cursorWhere(filter.cursor, assistPoolConfigs.createdAt, assistPoolConfigs.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(assistPoolConfigs.name, pat), ilike(assistPoolConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(assistPoolConfigs)
        .where(and(...conds))
        .orderBy(desc(assistPoolConfigs.createdAt), desc(assistPoolConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getConfig(
      organizationId: string,
      key: string,
    ): Promise<AssistPoolConfig> {
      return loadConfigByKey(organizationId, key);
    },

    // ─── Instance lifecycle ─────────────────────────────────────
    async initiateInstance(params: {
      organizationId: string;
      configKey: string;
      initiatorEndUserId: string;
      now?: Date;
    }): Promise<AssistPoolInstance> {
      const config = await loadConfigByKey(
        params.organizationId,
        params.configKey,
      );
      if (!config.isActive) {
        throw new AssistPoolConfigInactive(params.configKey);
      }

      if (config.maxInstancesPerInitiator !== null) {
        const existing = await countActiveInstancesForInitiator(
          config.id,
          params.initiatorEndUserId,
        );
        if (existing >= config.maxInstancesPerInitiator) {
          throw new AssistPoolInitiatorLimitReached(
            config.maxInstancesPerInitiator,
          );
        }
      }

      const now = params.now ?? new Date();
      const expiresAt = computeExpiresAt(now, config.expiresInSeconds);
      const initialRemaining =
        (config.mode as AssistPoolMode) === "decrement"
          ? config.targetAmount
          : 0;

      const [row] = await db
        .insert(assistPoolInstances)
        .values({
          organizationId: params.organizationId,
          configId: config.id,
          initiatorEndUserId: params.initiatorEndUserId,
          status: "in_progress",
          remaining: initialRemaining,
          targetAmount: config.targetAmount,
          contributionCount: 0,
          expiresAt,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");

      await events.emit("assist_pool.instance_created", {
        organizationId: row.organizationId,
        configId: row.configId,
        instanceId: row.id,
        endUserId: row.initiatorEndUserId,
        targetAmount: row.targetAmount,
        expiresAt: row.expiresAt.toISOString(),
      });

      return row;
    },

    /**
     * Push progress on an instance. The heavy lifting is in the atomic
     * `UPDATE ... WHERE version = ? AND status = 'in_progress' AND
     * expires_at > now() RETURNING *`. If we come back with zero rows
     * we re-read and classify: expired / completed / lost the race
     * (retry once).
     */
    async contribute(params: {
      organizationId: string;
      instanceId: string;
      assisterEndUserId: string;
      now?: Date;
    }): Promise<ContributeResult> {
      const now = params.now ?? new Date();

      for (let attempt = 0; attempt <= CONTRIBUTE_MAX_RETRIES; attempt++) {
        const instance = await loadInstance(
          params.organizationId,
          params.instanceId,
        );

        if (instance.status === "expired" || isExpired(instance.expiresAt, now)) {
          if (instance.status === "in_progress") {
            // Row still says in_progress but wall-clock says expired —
            // mark it now so admin queries and cron agree.
            await db
              .update(assistPoolInstances)
              .set({ status: "expired" })
              .where(
                and(
                  eq(assistPoolInstances.id, instance.id),
                  eq(assistPoolInstances.status, "in_progress"),
                ),
              );
          }
          throw new AssistPoolInstanceExpired(instance.id);
        }
        if (instance.status === "completed") {
          throw new AssistPoolAlreadyCompleted(instance.id);
        }

        const config = await db
          .select()
          .from(assistPoolConfigs)
          .where(eq(assistPoolConfigs.id, instance.configId))
          .limit(1);
        const cfg = config[0];
        if (!cfg) throw new AssistPoolConfigNotFound(instance.configId);
        if (!cfg.isActive) throw new AssistPoolConfigInactive(cfg.id);

        // Self-assist guard
        if (
          !cfg.initiatorCanAssist &&
          instance.initiatorEndUserId === params.assisterEndUserId
        ) {
          throw new AssistPoolSelfAssistForbidden();
        }

        // Per-assister rate limit
        const prior = await countAssisterContributions(
          instance.id,
          params.assisterEndUserId,
        );
        if (prior >= cfg.perAssisterLimit) {
          throw new AssistPoolAssisterLimitReached(cfg.perAssisterLimit);
        }

        // Compute contribution against the unified "work left" view.
        const mode = cfg.mode as AssistPoolMode;
        const left = workLeft(mode, instance.remaining, cfg.targetAmount);
        if (left <= 0) {
          // Instance already at completion boundary — let the next
          // attempt observe status='completed'. This branch is a
          // safety belt, normally status would already be 'completed'.
          throw new AssistPoolAlreadyCompleted(instance.id);
        }

        const amount = computeContribution(
          cfg.contributionPolicy,
          left,
          cfg.targetAmount,
          rng,
        );
        if (amount <= 0) {
          throw new AssistPoolInvalidInput(
            "contribution policy returned non-positive amount",
          );
        }

        const nextRemaining = applyContribution(
          mode,
          instance.remaining,
          amount,
        );
        const willComplete = isComplete(mode, nextRemaining, cfg.targetAmount);

        // Atomic optimistic update. Predicate fails ⇒ 0 rows ⇒ retry.
        const [updated] = await db
          .update(assistPoolInstances)
          .set({
            remaining: nextRemaining,
            status: willComplete ? "completed" : "in_progress",
            contributionCount: sql`${assistPoolInstances.contributionCount} + 1`,
            completedAt: willComplete ? now : null,
            version: sql`${assistPoolInstances.version} + 1`,
          })
          .where(
            and(
              eq(assistPoolInstances.id, instance.id),
              eq(assistPoolInstances.version, instance.version),
              eq(assistPoolInstances.status, "in_progress"),
              sql`${assistPoolInstances.expiresAt} > ${now}`,
            ),
          )
          .returning();

        if (!updated) {
          // Lost the race — someone else advanced version, completed,
          // or expired the instance between our read and our update.
          // Re-read and retry (classification happens at loop top).
          continue;
        }

        const [contribution] = await db
          .insert(assistPoolContributions)
          .values({
            organizationId: updated.organizationId,
            instanceId: updated.id,
            assisterEndUserId: params.assisterEndUserId,
            amount,
            remainingAfter: updated.remaining,
          })
          .returning();
        if (!contribution) throw new Error("contribution insert returned no row");

        await events.emit("assist_pool.contributed", {
          organizationId: updated.organizationId,
          configId: updated.configId,
          instanceId: updated.id,
          endUserId: params.assisterEndUserId,
          initiatorEndUserId: updated.initiatorEndUserId,
          amount,
          remaining: updated.remaining,
        });

        let ledger: AssistPoolRewardLedger | null = null;
        if (willComplete) {
          ledger = await settle(cfg, updated, now);
        }

        return {
          instance: updated,
          contribution,
          completed: willComplete,
          rewards: ledger,
        };
      }

      throw new AssistPoolInvalidInput(
        `contribute failed after ${CONTRIBUTE_MAX_RETRIES} retries`,
      );
    },

    async getInstance(
      organizationId: string,
      instanceId: string,
    ): Promise<AssistPoolInstance> {
      return loadInstance(organizationId, instanceId);
    },

    async listContributions(
      organizationId: string,
      instanceId: string,
    ): Promise<AssistPoolContribution[]> {
      // Load instance to verify org scope before exposing contributions.
      await loadInstance(organizationId, instanceId);
      return db
        .select()
        .from(assistPoolContributions)
        .where(eq(assistPoolContributions.instanceId, instanceId))
        .orderBy(desc(assistPoolContributions.createdAt));
    },

    async listInstances(params: {
      organizationId: string;
      configKey?: string;
      initiatorEndUserId?: string;
      status?: AssistPoolStatus;
      limit?: number;
    }): Promise<AssistPoolInstance[]> {
      const conds = [eq(assistPoolInstances.organizationId, params.organizationId)];
      if (params.configKey) {
        const cfg = await loadConfigByKey(
          params.organizationId,
          params.configKey,
        );
        conds.push(eq(assistPoolInstances.configId, cfg.id));
      }
      if (params.initiatorEndUserId) {
        conds.push(
          eq(assistPoolInstances.initiatorEndUserId, params.initiatorEndUserId),
        );
      }
      if (params.status) {
        conds.push(eq(assistPoolInstances.status, params.status));
      }
      return db
        .select()
        .from(assistPoolInstances)
        .where(and(...conds))
        .orderBy(desc(assistPoolInstances.createdAt))
        .limit(params.limit ?? 50);
    },

    /**
     * Admin-triggered force expire. Idempotent — already-expired or
     * already-completed instances return the current row unchanged.
     */
    async forceExpireInstance(
      organizationId: string,
      instanceId: string,
      now?: Date,
    ): Promise<AssistPoolInstance> {
      const ts = now ?? new Date();
      const [row] = await db
        .update(assistPoolInstances)
        .set({ status: "expired", expiresAt: ts })
        .where(
          and(
            eq(assistPoolInstances.id, instanceId),
            eq(assistPoolInstances.organizationId, organizationId),
            eq(assistPoolInstances.status, "in_progress"),
          ),
        )
        .returning();
      if (row) {
        await events.emit("assist_pool.expired", {
          organizationId: row.organizationId,
          configId: row.configId,
          instanceId: row.id,
          endUserId: row.initiatorEndUserId,
          reason: "force",
        });
        return row;
      }
      // No-op: already completed/expired — return the existing row.
      return loadInstance(organizationId, instanceId);
    },

    /**
     * Cron entry — sweep instances whose expires_at has passed and
     * mark them expired. One UPDATE ... RETURNING so every flip is
     * visible to subsequent reads.
     */
    async expireOverdue(params?: { now?: Date }): Promise<number> {
      const now = params?.now ?? new Date();
      const rows = await db
        .update(assistPoolInstances)
        .set({ status: "expired" })
        .where(
          and(
            eq(assistPoolInstances.status, "in_progress"),
            lte(assistPoolInstances.expiresAt, now),
          ),
        )
        .returning();

      for (const row of rows) {
        await events.emit("assist_pool.expired", {
          organizationId: row.organizationId,
          configId: row.configId,
          instanceId: row.id,
          endUserId: row.initiatorEndUserId,
          reason: "timeout",
        });
      }
      return rows.length;
    },
  };
}

export type AssistPoolService = ReturnType<typeof createAssistPoolService>;

/** Detect Postgres unique_violation (SQLSTATE 23505) across driver quirks. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
