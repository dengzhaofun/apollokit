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
 * Item categories — organizational grouping for item definitions.
 *
 * Each org can define its own categories (e.g. "Currency", "Equipment",
 * "Consumable"). Categories carry display metadata (icon, sort order)
 * and are referenced by item definitions via an optional FK.
 */
export const itemCategories = pgTable(
  "item_categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    icon: text("icon"),
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
    index("item_categories_org_idx").on(table.organizationId),
    uniqueIndex("item_categories_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Item definitions — the master catalog of all resource types an org owns.
 *
 * Unifies "items" and "currencies" into a single table. The behavioral
 * difference is expressed through three columns:
 *
 *   stackable   stackLimit   holdLimit   Behavior
 *   ─────────   ──────────   ─────────   ─────────────────────────────
 *   true        null         null        Currency — one row, unlimited qty
 *   true        99           null        Stackable item — multi-row, ≤99 each
 *   false       —            1           Unique (hero) — one instance max
 *   false       —            3           Limited (shield) — up to 3 instances
 *
 * `category_id` is an optional FK to `item_categories`. Deleting a category
 * nulls out the reference (SET NULL) rather than cascading into definitions.
 */
export const itemDefinitions = pgTable(
  "item_definitions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => itemCategories.id, {
      onDelete: "set null",
    }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    stackable: boolean("stackable").default(true).notNull(),
    stackLimit: integer("stack_limit"),
    holdLimit: integer("hold_limit"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("item_definitions_org_idx").on(table.organizationId),
    index("item_definitions_category_idx").on(table.categoryId),
    uniqueIndex("item_definitions_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Item inventories — per-user ownership of items/currencies.
 *
 * Row cardinality depends on the item definition's stacking config:
 *
 *   - Unlimited stackable (currency): one row per (endUser, definition),
 *     quantity grows without bound. `is_singleton = true` marks these
 *     rows. The partial unique index on (org, endUser, defId) WHERE
 *     is_singleton = true enables ON CONFLICT DO UPDATE upserts.
 *
 *   - Limited stackable: multiple rows per (endUser, definition), each
 *     row's quantity ≤ stackLimit. `is_singleton = false`.
 *
 *   - Non-stackable: one row per instance, quantity fixed at 1.
 *     `is_singleton = false`. `instance_data` carries per-instance
 *     business attributes (enchantment level, skin, durability, etc).
 *
 * `is_singleton` is a dedicated flag that controls the partial unique
 * index. It keeps `instance_data` as a pure business field — no need
 * to pollute it with synthetic values just to dodge the unique constraint.
 *
 * `version` is an optimistic concurrency control counter. Every write
 * increments it and includes the previous value in the WHERE clause,
 * preventing lost-update races without transactions.
 */
export const itemInventories = pgTable(
  "item_inventories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => itemDefinitions.id, { onDelete: "cascade" }),
    quantity: integer("quantity").default(1).notNull(),
    version: integer("version").default(1).notNull(),
    isSingleton: boolean("is_singleton").default(false).notNull(),
    instanceData: jsonb("instance_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("item_inventories_user_def_idx").on(
      table.organizationId,
      table.endUserId,
      table.definitionId,
    ),
    index("item_inventories_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    // Partial unique index: for unlimited-stack items (currencies), there
    // is exactly one row per (org, user, def). is_singleton = true marks
    // the currency row, enabling ON CONFLICT DO UPDATE upserts.
    uniqueIndex("item_inventories_singleton_uidx")
      .on(table.organizationId, table.endUserId, table.definitionId)
      .where(sql`${table.isSingleton} = true`),
  ],
);

/**
 * Item grant logs — audit trail for every resource change.
 *
 * Every call to grantItems / deductItems writes one row per affected
 * definition. `delta` is positive for grants, negative for deductions.
 * `source` + `source_id` together enable idempotency checks (e.g.
 * exchange execution uses the exchange ID as source_id).
 *
 * quantity_before / quantity_after are snapshots of the user's total
 * holdings for that definition at the time of the operation — they are
 * best-effort (computed from the read that preceded the write) and may
 * be slightly stale under concurrency, but good enough for auditing.
 */
export const itemGrantLogs = pgTable(
  "item_grant_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    definitionId: uuid("definition_id").notNull(),
    delta: integer("delta").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    quantityBefore: integer("quantity_before"),
    quantityAfter: integer("quantity_after"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("item_grant_logs_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("item_grant_logs_source_idx").on(table.source, table.sourceId),
  ],
);
