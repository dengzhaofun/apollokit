import { sql } from "drizzle-orm";
import {
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

import { organization } from "./auth";
import { currencies } from "./currency";

/**
 * Storage-box configs — admin-authored templates that describe a "box"
 * an end user can deposit currencies into.
 *
 *   type = 'demand' — 活期，随存随取。
 *   type = 'fixed'  — 定期，锁仓 lockupDays 天后才能取。
 *
 * Interest is simple (non-compounding): rate is expressed in basis
 * points over `interestPeriodDays`, projected lazily at read / write
 * time — no cron required. See modules/storage-box/interest.ts.
 *
 * `acceptedCurrencyIds` is stored as a jsonb string[] rather than a
 * Postgres array or a join table, matching the convention used by
 * `mail.target_user_ids`. Integrity (each id exists AND is a currency
 * in the same org) is enforced in the service layer, not the DB.
 */
export const storageBoxConfigs = pgTable(
  "storage_box_configs",
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
    icon: text("icon"),
    type: text("type").notNull(),
    lockupDays: integer("lockup_days"),
    interestRateBps: integer("interest_rate_bps").default(0).notNull(),
    interestPeriodDays: integer("interest_period_days").default(365).notNull(),
    acceptedCurrencyIds: jsonb("accepted_currency_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    minDeposit: integer("min_deposit"),
    maxDeposit: integer("max_deposit"),
    allowEarlyWithdraw: boolean("allow_early_withdraw")
      .default(false)
      .notNull(),
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
    index("storage_box_configs_org_idx").on(table.organizationId),
    uniqueIndex("storage_box_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Storage-box deposits — per-user balances.
 *
 * Row cardinality mirrors the config's type:
 *
 *   demand : one active row per (org, user, box, currency) — deposits
 *            merge into the same row. Enabled by the partial unique
 *            index below. `isSingleton = true`.
 *
 *   fixed  : one row per term deposit. A user can hold many concurrent
 *            fixed deposits in the same box. `isSingleton = false`.
 *            `maturesAt` is set on insert.
 *
 * Interest is computed from `principal`, the box config's
 * interestRateBps / interestPeriodDays, and (now - lastAccrualAt).
 * Whenever the row is mutated we flush the projected interest into
 * `accruedInterest` and bump `lastAccrualAt` to `now`.
 *
 * `version` is an optimistic concurrency counter, same pattern as
 * item_inventories.
 */
export const storageBoxDeposits = pgTable(
  "storage_box_deposits",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    boxConfigId: uuid("box_config_id")
      .notNull()
      .references(() => storageBoxConfigs.id, { onDelete: "cascade" }),
    currencyDefinitionId: uuid("currency_definition_id")
      .notNull()
      .references(() => currencies.id, { onDelete: "cascade" }),
    principal: integer("principal").default(0).notNull(),
    accruedInterest: integer("accrued_interest").default(0).notNull(),
    status: text("status").default("active").notNull(),
    isSingleton: boolean("is_singleton").default(false).notNull(),
    depositedAt: timestamp("deposited_at").defaultNow().notNull(),
    lastAccrualAt: timestamp("last_accrual_at").defaultNow().notNull(),
    maturesAt: timestamp("matures_at"),
    withdrawnAt: timestamp("withdrawn_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("storage_box_deposits_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("storage_box_deposits_box_idx").on(table.boxConfigId),
    // Partial unique index: for demand deposits, one active row per
    // (org, user, box, currency). Enables ON CONFLICT DO UPDATE upsert.
    uniqueIndex("storage_box_deposits_demand_uidx")
      .on(
        table.organizationId,
        table.endUserId,
        table.boxConfigId,
        table.currencyDefinitionId,
      )
      .where(sql`${table.isSingleton} = true AND ${table.status} = 'active'`),
  ],
);

/**
 * Storage-box logs — audit trail for deposit / withdraw / interest
 * events. Currency movement is ALSO recorded in item_grant_logs (via
 * itemService.grantItems / deductItems); this table adds the storage-
 * box-specific context (which deposit row, how much principal vs.
 * interest).
 */
export const storageBoxLogs = pgTable(
  "storage_box_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    depositId: uuid("deposit_id").notNull(),
    boxConfigId: uuid("box_config_id").notNull(),
    currencyDefinitionId: uuid("currency_definition_id").notNull(),
    action: text("action").notNull(),
    principalDelta: integer("principal_delta").default(0).notNull(),
    interestDelta: integer("interest_delta").default(0).notNull(),
    principalAfter: integer("principal_after"),
    interestAfter: integer("interest_after"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("storage_box_logs_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("storage_box_logs_deposit_idx").on(table.depositId),
  ],
);
