import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Check-in configurations owned by an organization (tenant).
 *
 * One org can own N configs. Each config optionally has a human-readable
 * `alias` that is unique within the org (partial unique index — NULL aliases
 * are allowed and don't conflict).
 *
 * `reset_mode` drives the cycle semantics:
 *   - 'none'  → never resets; current_cycle_days == total_days
 *   - 'week'  → resets each natural week (start day configurable)
 *   - 'month' → resets each natural month
 *
 * `target` (nullable) is the goal for "completion" per cycle:
 *   - null → no target, just track days (infinite check-in)
 *   - set  → `isCompleted = current_cycle_days >= target` (computed on read)
 */
export const checkInConfigs = pgTable(
  "check_in_configs",
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
    resetMode: text("reset_mode").notNull(),
    weekStartsOn: smallint("week_starts_on").default(1).notNull(),
    target: integer("target"),
    timezone: text("timezone").default("UTC").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("check_in_configs_organization_id_idx").on(table.organizationId),
    uniqueIndex("check_in_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Per-user aggregate state for a check-in config.
 *
 * One row per (config_id, end_user_id). This table is BOTH the source of
 * truth for streak / total counts AND the concurrency gate that prevents
 * double check-in on the same natural day — there is no separate event log
 * (that will live in a future unified behavior-log system).
 *
 * `end_user_id` is the SaaS customer's business user id — text, unknown
 * format, and intentionally NOT a foreign key. It must never be confused
 * with Better Auth's `user.id` which is the SaaS admin.
 */
export const checkInUserStates = pgTable(
  "check_in_user_states",
  {
    configId: uuid("config_id")
      .notNull()
      .references(() => checkInConfigs.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    totalDays: integer("total_days").default(0).notNull(),
    currentStreak: integer("current_streak").default(0).notNull(),
    longestStreak: integer("longest_streak").default(0).notNull(),
    currentCycleKey: text("current_cycle_key"),
    currentCycleDays: integer("current_cycle_days").default(0).notNull(),
    lastCheckInDate: date("last_check_in_date"),
    firstCheckInAt: timestamp("first_check_in_at"),
    lastCheckInAt: timestamp("last_check_in_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.configId, table.endUserId],
      name: "check_in_user_states_pk",
    }),
    index("check_in_user_states_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("check_in_user_states_config_date_idx").on(
      table.configId,
      table.lastCheckInDate,
    ),
  ],
);

/**
 * Check-in rewards — per-day reward configuration for a check-in config.
 *
 * `day_number` (1-based) maps to the day in the current streak/cycle.
 * For example, day_number=1 is the first day of consecutive check-in.
 *
 * `reward_items` is a jsonb array of `{definitionId: string, quantity: number}`
 * referencing item_definitions. When a user checks in and their
 * currentCycleDays matches a day_number, the corresponding rewards are
 * granted via itemService.grantItems().
 *
 * If no reward row exists for a given day, no reward is granted (silent).
 */
export const checkInRewards = pgTable(
  "check_in_rewards",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => checkInConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    dayNumber: integer("day_number").notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("check_in_rewards_config_day_uidx").on(
      table.configId,
      table.dayNumber,
    ),
    index("check_in_rewards_config_idx").on(table.configId),
  ],
);
