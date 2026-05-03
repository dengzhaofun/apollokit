import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
 * Shop categories — hierarchical product grouping.
 *
 * Self-referencing tree via `parentId`. `level` is denormalized for
 * cheap "top-level only" queries and validator depth checks; service
 * layer keeps it consistent on write (parent.level + 1). Recursive
 * descendant queries use `WITH RECURSIVE` on `parentId`.
 *
 * On parent delete we use `SET NULL` to keep the subtree intact
 * (nodes become top-level). Deleting a category never cascades into
 * products — products reference categories with `SET NULL`.
 */
export const shopCategories = pgTable(
  "shop_categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => shopCategories.id, {
      onDelete: "set null",
    }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    icon: text("icon"),
    level: integer("level").default(0).notNull(),
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
    index("shop_categories_tenant_idx").on(table.tenantId),
    index("shop_categories_parent_idx").on(table.parentId),
    uniqueIndex("shop_categories_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Shop tags — tenant-defined tag dictionary.
 *
 * Replaces a fixed hot/new/sale enum with full flexibility. Tenants
 * can seed whatever tags they want (hot / new / sale / featured /
 * season / event, …) and each product is M2M linked via
 * `shop_product_tags`. `color` carries a hex value for badge rendering.
 */
export const shopTags = pgTable(
  "shop_tags",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
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
    index("shop_tags_tenant_idx").on(table.tenantId),
    uniqueIndex("shop_tags_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Shop products — master product table.
 *
 * Two orthogonal discriminators:
 *
 *   1. `productType` (regular | growth_pack)
 *       - regular: purchase immediately grants `rewardItems`
 *       - growth_pack: purchase records entitlement only; rewards
 *         are granted via `shop_growth_stages` + `shop_growth_stage_claims`
 *
 *   2. `timeWindowType` (none | absolute | relative | cyclic) — mutually
 *      exclusive availability modes. Only the matching column group may
 *      be non-null; validator enforces this at the API boundary:
 *
 *      none      → no time gating
 *      absolute  → availableFrom / availableTo clock range, shared by all users
 *      relative  → eligibilityAnchor + eligibilityWindowSeconds,
 *                  evaluated per user (anchor=user_created | first_purchase)
 *      cyclic    → refreshCycle + refreshLimit, per-user count resets daily/
 *                  weekly/monthly
 *
 * `userLimit`, `globalLimit`, `globalCount` are limit counters that apply
 * independently of the time window. They mirror the semantics used in
 * `exchange_options` — incremented atomically via conditional upsert.
 */
export const shopProducts = pgTable(
  "shop_products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => shopCategories.id, {
      onDelete: "set null",
    }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    coverImage: text("cover_image"),
    galleryImages: jsonb("gallery_images").$type<string[]>(),
    productType: text("product_type").default("regular").notNull(),
    costItems: jsonb("cost_items").$type<RewardEntry[]>().notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),

    // Time window discriminator and its columns (mutually exclusive groups).
    timeWindowType: text("time_window_type").default("none").notNull(),
    availableFrom: timestamp("available_from"),
    availableTo: timestamp("available_to"),
    eligibilityAnchor: text("eligibility_anchor"),
    eligibilityWindowSeconds: integer("eligibility_window_seconds"),
    refreshCycle: text("refresh_cycle"),
    refreshLimit: integer("refresh_limit"),

    // Global and per-user purchase limits (independent of the time window).
    userLimit: integer("user_limit"),
    globalLimit: integer("global_limit"),
    globalCount: integer("global_count").default(0).notNull(),

    sortOrder: fractionalSortKey("sort_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Soft link to an `activity_configs.id` when this product belongs
     * to an activity's `exchange` node. NULL = permanent shop product.
     * When an activity archives, the activity service flips `isActive`
     * off for its products per the activity's `cleanupRule`.
     */
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
    index("shop_products_tenant_idx").on(table.tenantId),
    index("shop_products_tenant_category_idx").on(
      table.tenantId,
      table.categoryId,
    ),
    index("shop_products_tenant_type_idx").on(
      table.tenantId,
      table.productType,
    ),
    index("shop_products_tenant_window_active_idx").on(
      table.tenantId,
      table.timeWindowType,
      table.isActive,
    ),
    index("shop_products_absolute_window_idx")
      .on(
        table.tenantId,
        table.isActive,
        table.availableFrom,
        table.availableTo,
      )
      .where(sql`${table.timeWindowType} = 'absolute'`),
    uniqueIndex("shop_products_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("shop_products_activity_idx").on(table.activityId),
  ],
);

/**
 * Shop product ↔ tag M2M join.
 *
 * Both sides cascade-delete. A reverse index on `tagId` supports
 * the "products with tag X" query.
 */
export const shopProductTags = pgTable(
  "shop_product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => shopProducts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => shopTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.tagId],
      name: "shop_product_tags_pk",
    }),
    index("shop_product_tags_tag_idx").on(table.tagId),
  ],
);

/**
 * Shop growth stages — multi-stage reward ladder for `productType=growth_pack`.
 *
 * Each stage defines a claim condition (`triggerType` + `triggerConfig`)
 * and the rewards granted when claimed. Stages are ordered by `stageIndex`
 * (unique within a product) — the UI presents them as an ordered ladder
 * but each stage is claimed independently once its trigger is met. There
 * is no "must-claim-stage-N-before-N+1" constraint at the schema level;
 * business policy lives in the service layer if needed.
 *
 * triggerType semantics:
 *   - accumulated_cost    : user's lifetime spend on this product
 *                           (summed from item_grant_logs via
 *                            source='shop.purchase' + source_id=productId)
 *   - accumulated_payment : user's lifetime grants of a specific currency
 *                           definition (triggerConfig.itemDefinitionId)
 *   - custom_metric       : reserved for future behavior-log integration
 *   - manual              : admin-triggered only, no auto-evaluation
 *
 * `triggerConfig` is a free-form jsonb payload whose shape depends on
 * `triggerType`; validator enforces per-type schemas at the API boundary.
 */
export const shopGrowthStages = pgTable(
  "shop_growth_stages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    productId: uuid("product_id")
      .notNull()
      .references(() => shopProducts.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    stageIndex: integer("stage_index").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config"),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("shop_growth_stages_product_idx").on(table.productId),
    index("shop_growth_stages_tenant_idx").on(table.tenantId),
    uniqueIndex("shop_growth_stages_product_index_uidx").on(
      table.productId,
      table.stageIndex,
    ),
  ],
);

/**
 * Shop user purchase states — per-user counters for each product.
 *
 * Mirrors the `exchange_user_states` pattern with extra columns for the
 * richer time-window semantics:
 *
 *   totalCount      — lifetime purchases, bounded by product.userLimit
 *   cycleCount      — purchases in the current cycle
 *                     (cyclic time-window products only)
 *   cycleResetAt    — next cycle boundary; when `now >= cycleResetAt`
 *                     the purchase path resets cycleCount and rolls this
 *                     forward. null for non-cyclic products.
 *   firstPurchaseAt — timestamp of the first successful purchase;
 *                     used as the anchor when
 *                     `timeWindowType='relative'` + `eligibilityAnchor='first_purchase'`.
 *
 * `version` is incremented on every write and included in WHERE clauses
 * for optimistic concurrency control.
 */
export const shopUserPurchaseStates = pgTable(
  "shop_user_purchase_states",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => shopProducts.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    totalCount: integer("total_count").default(0).notNull(),
    cycleCount: integer("cycle_count").default(0).notNull(),
    cycleResetAt: timestamp("cycle_reset_at"),
    firstPurchaseAt: timestamp("first_purchase_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.endUserId],
      name: "shop_user_purchase_states_pk",
    }),
    index("shop_user_purchase_states_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
  ],
);

/**
 * Shop growth stage claims — per-user idempotent claim record.
 *
 * Composite PK on (stageId, endUserId) ensures a stage can only be
 * claimed once per user. Insertion uses `ON CONFLICT DO NOTHING` —
 * zero rows affected means "already claimed" and we raise
 * `AlreadyClaimed`. `productId` is denormalized to let us ask
 * "how many stages has user X claimed for product Y" cheaply.
 */
export const shopGrowthStageClaims = pgTable(
  "shop_growth_stage_claims",
  {
    stageId: uuid("stage_id")
      .notNull()
      .references(() => shopGrowthStages.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    productId: uuid("product_id").notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.stageId, table.endUserId],
      name: "shop_growth_stage_claims_pk",
    }),
    index("shop_growth_stage_claims_tenant_user_product_idx").on(
      table.tenantId,
      table.endUserId,
      table.productId,
    ),
  ],
);
