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
 * Exchange configs — top-level exchange activities.
 *
 * An exchange config groups related exchange options under a single
 * activity (e.g. "Spring Festival Exchange", "Daily Shop"). Each
 * config can be toggled on/off and carries its own alias for API
 * lookup.
 */
export const exchangeConfigs = pgTable(
  "exchange_configs",
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
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("exchange_configs_tenant_idx").on(table.tenantId),
    uniqueIndex("exchange_configs_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Exchange options — individual exchange choices within an activity.
 *
 * Each option defines a "cost → reward" resource swap. Players pick
 * an option to execute. `cost_items` and `reward_items` are jsonb
 * arrays of `{definitionId: string, quantity: number}`.
 *
 * Limits:
 *   - `user_limit`: max times a single user can execute this option.
 *     null = unlimited.
 *   - `global_limit`: max total executions across all users.
 *     null = unlimited.
 *   - `global_count`: current global execution count, atomically
 *     incremented via conditional UPDATE.
 */
export const exchangeOptions = pgTable(
  "exchange_options",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configId: uuid("config_id")
      .notNull()
      .references(() => exchangeConfigs.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    costItems: jsonb("cost_items").$type<RewardEntry[]>().notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    userLimit: integer("user_limit"),
    globalLimit: integer("global_limit"),
    globalCount: integer("global_count").default(0).notNull(),
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
    index("exchange_options_config_idx").on(table.configId),
    index("exchange_options_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Exchange user states — per-user execution count for each option.
 *
 * Composite PK on (option_id, end_user_id). Used to enforce
 * `user_limit` via atomic upsert with a conditional WHERE clause.
 */
export const exchangeUserStates = pgTable(
  "exchange_user_states",
  {
    optionId: uuid("option_id")
      .notNull()
      .references(() => exchangeOptions.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    count: integer("count").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.optionId, table.endUserId],
      name: "exchange_user_states_pk",
    }),
  ],
);
