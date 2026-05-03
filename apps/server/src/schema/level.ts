import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { fractionalSortKey } from "./_fractional-sort";

import type { RewardEntry } from "../lib/rewards";
import { team } from "./auth";

/**
 * Level (关卡) module — tenant-configurable level/stage progression system.
 *
 * Hierarchy:
 *   LevelConfig  (a level pack, e.g. "Main Story", "Daily Challenge")
 *     └─ LevelStage  (optional grouping layer, e.g. "Chapter 1")
 *           └─ Level  (individual level definition)
 *
 * Per-player state:
 *   level_user_progress  — per-player per-level completion & star tracking
 *
 * Design notes:
 *
 * 1. The three-tier hierarchy (config → stage → level) is intentionally
 *    similar to collection's (album → group → entry). Stages are optional:
 *    when `hasStages=false` on the config, levels sit directly under the
 *    config with no stage grouping.
 *
 * 2. Unlock rules (`unlockRule` JSONB on stages and levels) are opaque to
 *    the schema layer. The service layer interprets them — common patterns
 *    include "clear previous level", "reach N stars in stage", or "pay
 *    currency cost". Keeping the rule as JSONB avoids schema migrations
 *    when new unlock strategies are added.
 *
 * 3. Reward delivery uses the unified `RewardEntry[]` type:
 *      - `clearRewards` → granted once on first clear (guarded by
 *        `rewardsClaimed` flag in user progress)
 *      - `starRewards` → array of { stars, rewards } thresholds; the
 *        `starRewardsClaimed` integer tracks the highest tier claimed
 *
 * 4. Star system: each level has a `maxStars` (default 3). The player's
 *    `stars` in progress tracks their best result. Star rewards are
 *    cumulative — claiming 3-star rewards also grants unclaimed 1- and
 *    2-star rewards.
 *
 * 5. `level_user_progress` is NOT pre-populated. Rows appear only when a
 *    player first interacts with a level (unlock or attempt), so table
 *    size is O(total interactions), not O(users × levels).
 *
 * 6. `bestScore` is nullable and optional — not all level types are
 *    score-based. When present, it tracks the player's personal best
 *    for leaderboard or ranking features.
 *
 * 7. No season/time-gate fields for MVP — if timed events or rotating
 *    level packs are later required, we'll add start_at / end_at with
 *    a migration.
 */

/**
 * Level configs — the top-level container for a set of levels.
 * One org owns many configs (e.g. "Main Story", "Daily Dungeon").
 *
 * `alias` is an optional human-readable key, unique per org (partial index
 * — NULL aliases don't conflict with each other).
 *
 * `hasStages` controls whether the config uses the intermediate stage
 * grouping layer. When false, levels belong directly to the config.
 */
export const levelConfigs = pgTable(
  "level_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    icon: text("icon"),
    hasStages: boolean("has_stages").default(false).notNull(),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("level_configs_tenant_idx").on(table.tenantId),
    uniqueIndex("level_configs_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Level stages — optional grouping layer within a config (e.g. chapters).
 *
 * `tenantId` is denormalized here (and on other child tables) so
 * the admin UI can filter by tenant without traversing back to the
 * config row. ON DELETE CASCADE from the config keeps it consistent.
 *
 * `unlockRule` is an opaque JSONB blob interpreted by the service layer.
 * Common patterns: "clear all levels in previous stage", "reach N total
 * stars", or unconditional (null / empty).
 */
export const levelStages = pgTable(
  "level_stages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => levelConfigs.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    unlockRule: jsonb("unlock_rule"),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("level_stages_config_sort_idx").on(table.configId, table.sortOrder),
    index("level_stages_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Levels — individual level definitions that players play through.
 *
 * `stageId` is nullable — when the parent config has `hasStages=false`,
 * levels sit directly under the config with no stage grouping. When a
 * stage is deleted, `SET NULL` keeps the level orphaned but queryable
 * (admin can reassign).
 *
 * `alias` is an optional human-readable key, unique per config (partial
 * index — NULL aliases don't conflict).
 *
 * `difficulty` is a free-form text tag ('easy' / 'normal' / 'hard' /
 * 'nightmare') used by the UI; it does not drive server behavior.
 *
 * `clearRewards` uses the canonical `RewardEntry[]` shape — same
 * validator, same renderer as check-in, exchange, and mail rewards.
 *
 * `starRewards` is an array of `{ stars: number, rewards: RewardEntry[] }`
 * objects. Typed in `types.ts`, stored as opaque JSONB here.
 */
export const levels = pgTable(
  "levels",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => levelConfigs.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => levelStages.id, {
      onDelete: "set null",
    }),
    tenantId: text("tenant_id").notNull(),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    difficulty: text("difficulty"),
    maxStars: integer("max_stars").default(3).notNull(),
    unlockRule: jsonb("unlock_rule"),
    clearRewards: jsonb("clear_rewards").$type<RewardEntry[]>(),
    starRewards: jsonb("star_rewards"),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("levels_config_stage_sort_idx").on(
      table.configId,
      table.stageId,
      table.sortOrder,
    ),
    index("levels_tenant_idx").on(table.tenantId),
    uniqueIndex("levels_config_alias_uidx")
      .on(table.configId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Per-user per-level progress — tracks completion, stars, and reward claims.
 *
 * Composite primary key on (levelId, endUserId). Only rows for players
 * who have interacted with a level exist — "not started" is the absence
 * of a row. This avoids a user × level Cartesian product in storage.
 *
 * `status` is either 'unlocked' (player can attempt but hasn't cleared)
 * or 'cleared' (player has completed the level at least once).
 *
 * `stars` tracks the player's best star rating (0 to level's maxStars).
 * `attempts` is a monotonic counter incremented on each play.
 *
 * `rewardsClaimed` gates the one-time clear reward grant.
 * `starRewardsClaimed` tracks the highest star-reward tier claimed
 * (0 = none, 1 = 1-star tier, etc.), enabling cumulative claiming.
 *
 * `endUserId` is the SaaS customer's business user id — opaque text,
 * NOT a foreign key, never named `user_id`. See apps/server/CLAUDE.md.
 *
 * `configId` is denormalized so the "list progress for all levels in
 * this config" query is a single-table scan with an index hit.
 */
export const levelUserProgress = pgTable(
  "level_user_progress",
  {
    levelId: uuid("level_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    configId: uuid("config_id").notNull(),
    status: text("status").default("unlocked").notNull(),
    stars: integer("stars").default(0).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    bestScore: integer("best_score"),
    clearedAt: timestamp("cleared_at"),
    rewardsClaimed: boolean("rewards_claimed").default(false).notNull(),
    starRewardsClaimed: integer("star_rewards_claimed").default(0).notNull(),
    source: text("source"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.levelId, table.endUserId],
      name: "level_user_progress_pk",
    }),
    index("level_user_progress_tenant_user_config_idx").on(
      table.tenantId,
      table.endUserId,
      table.configId,
    ),
  ],
);
