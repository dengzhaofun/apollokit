import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Contribution policy — controls how much a single assist call deducts
 * from (or adds to) a pool instance.
 *
 *   - fixed(amount)
 *       Every assist contributes exactly `amount`. Reaches the target
 *       in ceil(target / amount) clicks. This models Pinduoduo's
 *       "邀 N 位好友解锁" variant where each friend = 1 unit.
 *
 *   - uniform(min, max)
 *       Each assist contributes a random integer in [min, max].
 *       Simple randomness with no adaptive slowdown.
 *
 *   - decaying(base, tailRatio, tailFloor)
 *       When `remaining > tailRatio * target` the assist contributes
 *       a uniformly random integer around `base` (base/2 .. base*1.5);
 *       when `remaining <= tailRatio * target` the contribution is
 *       clamped at `tailFloor` (the "last 0.01 元" throttle). This
 *       models the classic 砍一刀 psychology.
 *
 * The shape is stored in JSONB so we can add a new kind without a
 * schema migration. Service code dispatches via `policy.kind`.
 */
export type AssistContributionPolicy =
  | { kind: "fixed"; amount: number }
  | { kind: "uniform"; min: number; max: number }
  | {
      kind: "decaying";
      base: number;
      tailRatio: number;
      tailFloor: number;
    };

export type AssistPoolMode = "accumulate" | "decrement";

/**
 * An assist pool template — reused across many per-user instances.
 *
 * One org can own N configs; `alias` is org-unique (enforced via
 * partial unique index when non-null). `mode` picks the direction of
 * `remaining`:
 *
 *   - accumulate: `remaining` grows from 0 to `targetAmount` (+=)
 *   - decrement : `remaining` shrinks from `targetAmount` to 0 (-=)
 *
 * Both complete at the same boundary; the two modes exist so admins
 * can match their UX copy ("已集 X/Y" vs "还差 X 元到 0").
 */
export const assistPoolConfigs = pgTable(
  "assist_pool_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    mode: text("mode").notNull().default("decrement"),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    contributionPolicy: jsonb("contribution_policy")
      .$type<AssistContributionPolicy>()
      .notNull(),
    perAssisterLimit: integer("per_assister_limit").notNull().default(1),
    initiatorCanAssist: boolean("initiator_can_assist")
      .notNull()
      .default(false),
    expiresInSeconds: integer("expires_in_seconds").notNull().default(86400),
    maxInstancesPerInitiator: integer("max_instances_per_initiator"),
    rewards: jsonb("rewards")
      .$type<RewardEntry[]>()
      .notNull()
      .default([]),
    isActive: boolean("is_active").notNull().default(true),
    activityId: uuid("activity_id"),
    activityNodeId: uuid("activity_node_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("assist_pool_configs_org_idx").on(table.organizationId),
    uniqueIndex("assist_pool_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("assist_pool_configs_activity_idx").on(table.activityId),
  ],
);

/**
 * One live assist pool a user has started.
 *
 * `remaining` semantics depend on `config.mode`:
 *   - decrement → starts at `targetAmount`, drops to 0 on completion
 *   - accumulate→ starts at 0, grows to `targetAmount` on completion
 *
 * `version` backs optimistic-concurrency writes (`WHERE version = ?`).
 * See `service.ts → contribute` for the full race analysis.
 */
export const assistPoolInstances = pgTable(
  "assist_pool_instances",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    configId: uuid("config_id")
      .notNull()
      .references(() => assistPoolConfigs.id, { onDelete: "cascade" }),
    initiatorEndUserId: text("initiator_end_user_id").notNull(),
    status: text("status").notNull().default("in_progress"),
    remaining: bigint("remaining", { mode: "number" }).notNull(),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    contributionCount: integer("contribution_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    completedAt: timestamp("completed_at"),
    rewardGrantedAt: timestamp("reward_granted_at"),
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("assist_pool_instances_config_idx").on(table.configId),
    index("assist_pool_instances_initiator_idx").on(
      table.organizationId,
      table.initiatorEndUserId,
    ),
    index("assist_pool_instances_due_idx")
      .on(table.status, table.expiresAt)
      .where(sql`status = 'in_progress'`),
  ],
);

/**
 * Audit log + per-assister rate limit backing.
 *
 * Every successful `contribute` writes one row. The composite index
 * on (instance_id, assister_end_user_id) lets `perAssisterLimit`
 * counts run as a simple `COUNT(*)` without a separate aggregate
 * table. Rows are never deleted until the parent instance's config
 * is deleted (cascades).
 */
export const assistPoolContributions = pgTable(
  "assist_pool_contributions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => assistPoolInstances.id, { onDelete: "cascade" }),
    assisterEndUserId: text("assister_end_user_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    remainingAfter: bigint("remaining_after", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("assist_pool_contributions_instance_assister_idx").on(
      table.instanceId,
      table.assisterEndUserId,
    ),
    index("assist_pool_contributions_instance_created_idx").on(
      table.instanceId,
      table.createdAt,
    ),
  ],
);

/**
 * Reward payout ledger — one row per settled instance.
 *
 * `instanceId` is UNIQUE so the atomic
 *   INSERT ... ON CONFLICT (instance_id) DO NOTHING RETURNING *
 * pattern elects exactly one caller to perform the actual reward
 * grant (mail / currency / item). Every other caller that racist —
 * concurrent `contribute` calls that both observed `remaining ≤ 0`,
 * or cron retries — gets zero rows back and takes the no-op branch.
 */
export const assistPoolRewardsLedger = pgTable(
  "assist_pool_rewards_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => assistPoolInstances.id, { onDelete: "cascade" }),
    initiatorEndUserId: text("initiator_end_user_id").notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assist_pool_rewards_ledger_instance_uidx").on(
      table.instanceId,
    ),
    index("assist_pool_rewards_ledger_org_initiator_idx").on(
      table.organizationId,
      table.initiatorEndUserId,
    ),
  ],
);

export type AssistPoolConfig = typeof assistPoolConfigs.$inferSelect;
export type AssistPoolInstance = typeof assistPoolInstances.$inferSelect;
export type AssistPoolContribution =
  typeof assistPoolContributions.$inferSelect;
export type AssistPoolRewardLedger =
  typeof assistPoolRewardsLedger.$inferSelect;
