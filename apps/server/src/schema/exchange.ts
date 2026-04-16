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

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("exchange_configs_org_idx").on(table.organizationId),
    uniqueIndex("exchange_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
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
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    costItems: jsonb("cost_items").$type<RewardEntry[]>().notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    userLimit: integer("user_limit"),
    globalLimit: integer("global_limit"),
    globalCount: integer("global_count").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
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
    index("exchange_options_org_idx").on(table.organizationId),
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
    organizationId: text("organization_id").notNull(),
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
