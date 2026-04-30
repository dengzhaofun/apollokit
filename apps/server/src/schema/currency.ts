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

/**
 * Currency definitions — the org-scoped catalog of spendable currencies.
 *
 * A currency is a pure numeric resource (gold, gems, event points …) and is
 * intentionally separated from `item_definitions`: it has no stack / instance
 * / category semantics, it has a dedicated wallet + ledger pair, and it is a
 * first-class reward type (`RewardEntry.type = "currency"`).
 *
 * `alias` is a human-friendly identifier ("gem", "gold") unique per org.
 *
 * `activityId` / `activityNodeId` are soft links to `activity_configs.id`:
 * when the currency is activity-scoped (e.g. a limited-time event point),
 * the activity service's cleanup path archives it per the activity's
 * `cleanup_rule`. NULL = permanent catalog entry.
 */
export const currencies = pgTable(
  "currencies",
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
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
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
    index("currencies_org_idx").on(table.organizationId),
    uniqueIndex("currencies_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("currencies_activity_idx").on(table.activityId),
  ],
);

/**
 * Currency wallets — per-user balance rows.
 *
 * Exactly one row per `(organizationId, endUserId, currencyId)`. The unique
 * index below is what enables `INSERT ... ON CONFLICT DO UPDATE` for atomic
 * grants in a single statement.
 *
 * `version` is an optimistic-concurrency counter mirroring the pattern used
 * by `item_inventories`. It is bumped on every mutation; callers needing
 * compare-and-set semantics can include it in the `WHERE`.
 *
 * `balance` is stored as `integer` (signed) but the service layer never
 * allows a deduction to push it below zero — deducts use a conditional
 * UPDATE (`WHERE balance >= amount`) that returns zero rows on failure.
 */
export const currencyWallets = pgTable(
  "currency_wallets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id, { onDelete: "cascade" }),
    balance: integer("balance").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("currency_wallets_org_user_cur_uidx").on(
      table.organizationId,
      table.endUserId,
      table.currencyId,
    ),
    index("currency_wallets_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Currency ledger — immutable audit trail for every balance change.
 *
 * Mirrors `item_grant_logs` in shape so operator tooling (admin ledger view,
 * CSV export, reconciliation) can share a single mental model. One row per
 * grant or deduct call, `delta` is signed (+grant / -deduct), `source` +
 * `sourceId` together form an idempotency key for consuming modules that
 * want it (exchange, shop purchase, …).
 *
 * `balanceBefore` / `balanceAfter` are best-effort snapshots computed from
 * the read that preceded the write — they may be stale under concurrent
 * writes but are good enough for operator inspection.
 */
export const currencyLedger = pgTable(
  "currency_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    currencyId: uuid("currency_id").notNull(),
    delta: integer("delta").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    balanceBefore: integer("balance_before"),
    balanceAfter: integer("balance_after"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("currency_ledger_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("currency_ledger_source_idx").on(table.source, table.sourceId),
    index("currency_ledger_currency_idx").on(table.currencyId),
  ],
);
