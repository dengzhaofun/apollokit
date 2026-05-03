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
 * Lottery pools — top-level lottery/gacha activity configurations.
 *
 * A pool defines one drawing activity (e.g. "Lucky Wheel", "Hero Summon").
 * Each pool can be toggled on/off, time-windowed, and carries a per-pull
 * cost configuration. Multiple pools can coexist per organization.
 *
 * `cost_per_pull` is an empty array for item-triggered pools (chests):
 * the item "use" action handles the cost deduction, so the lottery
 * service only executes the random selection and prize granting.
 *
 * Pools support two selection modes depending on whether they have tiers:
 *   - No tiers: flat weighted random across all prizes (spin wheel)
 *   - With tiers: two-level selection (tier by weight → prize within tier)
 */
export const lotteryPools = pgTable(
  "lottery_pools",
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
    costPerPull: jsonb("cost_per_pull").$type<RewardEntry[]>().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    startAt: timestamp("start_at"),
    endAt: timestamp("end_at"),
    globalPullLimit: integer("global_pull_limit"),
    globalPullCount: integer("global_pull_count").default(0).notNull(),
    /**
     * Soft link to an `activity_configs.id` for activity-scoped gachas
     * (e.g. limited pool that only runs during Spring Festival). NULL
     * means a permanent lottery pool.
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
    index("lottery_pools_tenant_idx").on(table.tenantId),
    uniqueIndex("lottery_pools_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("lottery_pools_activity_idx").on(table.activityId),
  ],
);

/**
 * Lottery tiers — prize rarity groupings (e.g. SSR/SR/R/N).
 *
 * Tiers are OPTIONAL. When a pool has tiers, the selection algorithm
 * first picks a tier by base_weight, then picks a prize within that
 * tier. Pity rules also target tiers (guarantee a specific tier after
 * N pulls without it).
 *
 * When a pool has NO tiers, all prizes have tierId = null and are
 * selected directly by their individual weights (flat mode).
 */
export const lotteryTiers = pgTable(
  "lottery_tiers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => lotteryPools.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    alias: text("alias"),
    baseWeight: integer("base_weight").notNull(),
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
    index("lottery_tiers_pool_idx").on(table.poolId),
    index("lottery_tiers_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Lottery prizes — individual prize entries within a pool.
 *
 * `tier_id` is NULLABLE:
 *   - null → flat mode (spin wheel): prize selected directly by weight
 *   - set  → tiered mode (gacha): prize selected within its tier
 *
 * `reward_items` is the jsonb array of ItemEntry granted on win.
 * An empty array means "nothing" (e.g. "Better luck next time").
 *
 * Stock management:
 *   - `global_stock_limit = null` → unlimited
 *   - `global_stock_limit = N`   → only N copies available across all users
 *   - `global_stock_used` is atomically incremented on claim
 *   - `fallback_prize_id` is used when stock depletes (re-roll to fallback)
 *
 * Rate-up: when `is_rate_up = true`, `rate_up_weight` is added on top of
 * the base `weight` during selection. This models "featured" items.
 */
export const lotteryPrizes = pgTable(
  "lottery_prizes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tierId: uuid("tier_id").references(() => lotteryTiers.id, {
      onDelete: "cascade",
    }),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => lotteryPools.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    weight: integer("weight").default(100).notNull(),
    isRateUp: boolean("is_rate_up").default(false).notNull(),
    rateUpWeight: integer("rate_up_weight").default(0).notNull(),
    globalStockLimit: integer("global_stock_limit"),
    globalStockUsed: integer("global_stock_used").default(0).notNull(),
    fallbackPrizeId: uuid("fallback_prize_id"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("lottery_prizes_tier_idx").on(table.tierId),
    index("lottery_prizes_pool_idx").on(table.poolId),
    index("lottery_prizes_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Lottery pity rules — guarantee mechanics per pool per tier.
 *
 * Only applicable to pools with tiers (gacha mode). Each rule
 * guarantees a specific tier after N pulls without that tier.
 *
 * Hard pity: after `hard_pity_threshold` pulls without the
 * guarantee tier, force it on the next pull.
 *
 * Soft pity: starting at `soft_pity_start_at`, add
 * `soft_pity_weight_increment` to the tier's effective weight
 * per additional pull. (e.g. Genshin: base SSR weight 6,
 * add 60 per pull after pull 74 → pull 90 is near-guaranteed.)
 */
export const lotteryPityRules = pgTable(
  "lottery_pity_rules",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => lotteryPools.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    guaranteeTierId: uuid("guarantee_tier_id")
      .notNull()
      .references(() => lotteryTiers.id, { onDelete: "cascade" }),
    hardPityThreshold: integer("hard_pity_threshold").notNull(),
    softPityStartAt: integer("soft_pity_start_at"),
    softPityWeightIncrement: integer("soft_pity_weight_increment"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("lottery_pity_rules_pool_idx").on(table.poolId),
    uniqueIndex("lottery_pity_rules_pool_tier_uidx").on(
      table.poolId,
      table.guaranteeTierId,
    ),
  ],
);

/**
 * Lottery user states — per-user pity counters for each pool.
 *
 * Composite PK on (pool_id, end_user_id). Tracks total pull count
 * and a JSON map of pity counters keyed by pity rule id.
 *
 * `version` provides optimistic concurrency control. Multi-pull
 * reads the version once, computes all selections in memory, then
 * writes back the final state with a version guard.
 */
export const lotteryUserStates = pgTable(
  "lottery_user_states",
  {
    poolId: uuid("pool_id")
      .notNull()
      .references(() => lotteryPools.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    totalPullCount: integer("total_pull_count").default(0).notNull(),
    pityCounters: jsonb("pity_counters")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.poolId, table.endUserId],
      name: "lottery_user_states_pk",
    }),
    index("lottery_user_states_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
  ],
);

/**
 * Lottery pull logs — detailed audit trail for every pull.
 *
 * Each row records one prize won. For multi-pull (e.g. 10x), all
 * rows share the same `batch_id` with sequential `batch_index`.
 * Single pulls use batch_index = 0.
 *
 * `tier_id` / `tier_name` are null for flat-mode pools (no tiers).
 * `pity_triggered` / `pity_rule_id` record whether the pull was
 * forced by a pity guarantee.
 *
 * `cost_items` is the per-pull cost snapshot. For item-triggered
 * pools (costPerPull=[]) this is an empty array.
 */
export const lotteryPullLogs = pgTable(
  "lottery_pull_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    poolId: uuid("pool_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    batchId: text("batch_id").notNull(),
    batchIndex: integer("batch_index").default(0).notNull(),
    prizeId: uuid("prize_id").notNull(),
    tierId: uuid("tier_id"),
    tierName: text("tier_name"),
    prizeName: text("prize_name").notNull(),
    rewardItems: jsonb("reward_items").$type<RewardEntry[]>().notNull(),
    pityTriggered: boolean("pity_triggered").default(false).notNull(),
    pityRuleId: uuid("pity_rule_id"),
    pityCountersBefore: jsonb("pity_counters_before").$type<
      Record<string, number>
    >(),
    costItems: jsonb("cost_items").$type<RewardEntry[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lottery_pull_logs_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
    index("lottery_pull_logs_pool_user_idx").on(
      table.poolId,
      table.endUserId,
    ),
    index("lottery_pull_logs_batch_idx").on(table.batchId),
    index("lottery_pull_logs_created_idx").on(table.createdAt),
  ],
);
