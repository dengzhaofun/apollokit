import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Reward tier within a leaderboard cycle settlement.
 *
 * `from` / `to` are 1-indexed inclusive ranks. A tier with
 * `{ from: 2, to: 10 }` grants the same rewards to ranks 2–10. Tiers
 * must not overlap within a config; this is enforced by validators,
 * not the schema.
 */
export type LeaderboardRewardTier = {
  from: number;
  to: number;
  rewards: RewardEntry[];
};

/**
 * A single row persisted in a snapshot's `rankings` jsonb array.
 * Frozen at settlement time so user display name / avatar changes do
 * not retroactively alter the historical board.
 */
export type LeaderboardSnapshotRow = {
  rank: number;
  endUserId: string;
  score: number;
  displaySnapshot?: Record<string, unknown> | null;
};

/**
 * Leaderboard configurations owned by an organization.
 *
 * A config is the "template" for a single ranking stream. The stream's
 * instance is keyed by (cycleKey, scopeKey):
 *   - `cycleKey` — "2026-04-17" / "2026-W16" / "2026-04" / "all"
 *   - `scopeKey` — organizationId (global) | guildId | teamId | friend owner
 *
 * Multiple configs can subscribe to the same `metricKey` so that a single
 * `contribute(metricKey=X, value=Y)` call fans out to daily + weekly +
 * total + activity-specific boards in one shot. The subscription logic
 * is in `modules/leaderboard/service.ts → contribute()`.
 *
 * `activityId` is nullable to keep this schema independent of the
 * `activity_configs` table (which will land in a later migration). Once
 * activity lands, a follow-up migration adds an FK constraint; until
 * then it's a free-form uuid used only for equality filtering.
 */
export const leaderboardConfigs = pgTable(
  "leaderboard_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    metricKey: text("metric_key").notNull(),
    cycle: text("cycle").notNull(), // "daily" | "weekly" | "monthly" | "all_time"
    weekStartsOn: smallint("week_starts_on").default(1).notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    scope: text("scope").notNull().default("global"), // "global"|"guild"|"team"|"friend"
    aggregation: text("aggregation").notNull().default("sum"), // "sum"|"max"|"latest"
    maxEntries: integer("max_entries").default(1000).notNull(),
    tieBreaker: text("tie_breaker").notNull().default("earliest"), // "earliest"|"latest"
    rewardTiers: jsonb("reward_tiers")
      .$type<LeaderboardRewardTier[]>()
      .default([])
      .notNull(),
    startAt: timestamp("start_at"),
    endAt: timestamp("end_at"),
    status: text("status").notNull().default("active"), // "draft"|"active"|"paused"|"archived"
    activityId: uuid("activity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("leaderboard_configs_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("leaderboard_configs_org_metric_status_idx").on(
      table.organizationId,
      table.metricKey,
      table.status,
    ),
    index("leaderboard_configs_activity_idx").on(table.activityId),
  ],
);

/**
 * Per-user entry in a leaderboard cycle.
 *
 * This table is the durable backing store for every (config, cycleKey,
 * scopeKey, endUserId) tuple. The live ranking is read from Redis
 * (ZSET keyed by the same tuple); this table is the cold fallback when
 * Redis is unavailable, the source for admin exports, and the input
 * for cycle settlement.
 *
 * `tieAt` is captured so that ties can be broken by "earliest reached"
 * or "latest reached" at read time, depending on `config.tieBreaker`.
 * The Redis ZSET score is pure; tie-breaking runs here in PG during
 * settlement.
 *
 * `displaySnapshot` stores the user's rendering info (name / avatar)
 * as of the last write so the client can render a leaderboard without
 * a second round-trip to a user service.
 */
export const leaderboardEntries = pgTable(
  "leaderboard_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => leaderboardConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    cycleKey: text("cycle_key").notNull(),
    scopeKey: text("scope_key").notNull(),
    endUserId: text("end_user_id").notNull(),
    score: doublePrecision("score").default(0).notNull(),
    tieAt: timestamp("tie_at").defaultNow().notNull(),
    displaySnapshot: jsonb("display_snapshot"),
    source: text("source"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("leaderboard_entries_uidx").on(
      table.configId,
      table.cycleKey,
      table.scopeKey,
      table.endUserId,
    ),
    index("leaderboard_entries_rank_idx").on(
      table.configId,
      table.cycleKey,
      table.scopeKey,
      table.score,
    ),
  ],
);

/**
 * Immutable archive of a ranking at the moment the cycle closed.
 *
 * Written by the `settleDue` cron path exactly once per
 * (config, cycleKey, scopeKey). The unique index is the guardrail
 * against double-settlement on overlapping cron ticks.
 *
 * `rewardPlan` is frozen alongside the rankings so that if the admin
 * later edits `leaderboard_configs.reward_tiers`, historical payouts
 * still trace back to what was promised at settlement time.
 */
export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => leaderboardConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    cycleKey: text("cycle_key").notNull(),
    scopeKey: text("scope_key").notNull(),
    rankings: jsonb("rankings")
      .$type<LeaderboardSnapshotRow[]>()
      .notNull(),
    rewardPlan: jsonb("reward_plan")
      .$type<LeaderboardRewardTier[]>()
      .default([])
      .notNull(),
    settledAt: timestamp("settled_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("leaderboard_snapshots_uidx").on(
      table.configId,
      table.cycleKey,
      table.scopeKey,
    ),
    index("leaderboard_snapshots_org_settled_idx").on(
      table.organizationId,
      table.settledAt,
    ),
  ],
);

/**
 * Deduplication log for rank-tier rewards.
 *
 * One row per (config, cycleKey, scopeKey, endUserId). Inserting fails
 * with unique-violation if the user has already been paid for this
 * cycle, which is what makes `settleDue` idempotent — re-running it
 * after a partial-failure retry never double-pays.
 */
export const leaderboardRewardClaims = pgTable(
  "leaderboard_reward_claims",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => leaderboardConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    cycleKey: text("cycle_key").notNull(),
    scopeKey: text("scope_key").notNull(),
    endUserId: text("end_user_id").notNull(),
    rank: integer("rank").notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("leaderboard_reward_claims_uidx").on(
      table.configId,
      table.cycleKey,
      table.scopeKey,
      table.endUserId,
    ),
  ],
);
