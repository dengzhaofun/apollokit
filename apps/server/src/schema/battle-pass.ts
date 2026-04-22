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
 * Battle Pass / 纪行赛季配置。一个赛季对应一条 activity_configs 行
 * （kind='season_pass'），纪行专属字段（等级曲线、档位矩阵、每级奖励）
 * 存在这张表里，通过 activityId 绑定。
 *
 * 没有对 activity_configs 建 FK：activity 归档清理通过 kind handler
 * 的 onArchive 自驱（清 user_progress，保留 claims/tier_grants 作历史），
 * 不依赖 CASCADE。organization 级删除则通过 org → activity CASCADE
 * 清 activity，再由 org → battle_pass_configs CASCADE 清本表。
 */
export const battlePassConfigs = pgTable(
  "battle_pass_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** activity_configs.id — 绑定的活动（时间窗口/状态机由 activity 管）。 */
    activityId: uuid("activity_id").notNull(),
    /** 租户内唯一可读 code，一般和 activity 的 code 呼应。 */
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** 最高等级。 */
    maxLevel: integer("max_level").notNull(),
    /**
     * 经验曲线辨识联合：
     *   { type:'uniform',    xpPerLevel: number }
     *   { type:'custom',     thresholds: number[] }   // 长度 = maxLevel，每级累计阈值
     *   { type:'arithmetic', base: number, step: number }
     */
    levelCurve: jsonb("level_curve").$type<BattlePassLevelCurve>().notNull(),
    /**
     * 档位配置数组：
     *   [{ code:'free', order:0, priceSku:null, displayMeta:{...} },
     *    { code:'premium', order:1, priceSku:'bp_premium_68', displayMeta:{...} }, ...]
     */
    tiers: jsonb("tiers").$type<BattlePassTierDef[]>().notNull(),
    /**
     * 每级 × 每档奖励矩阵：
     *   [{ level:1, rewards:{ free:[RewardEntry], premium:[RewardEntry], ... } }, ...]
     */
    levelRewards: jsonb("level_rewards")
      .$type<BattlePassLevelRewardDef[]>()
      .notNull(),
    /** 特殊里程碑（如 30 级宝匣）。可为空数组。 */
    bonusMilestones: jsonb("bonus_milestones")
      .$type<BattlePassBonusMilestoneDef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** 是否允许花钱跳级（首期默认 false，字段预留）。 */
    allowLevelPurchase: boolean("allow_level_purchase")
      .notNull()
      .default(false),
    levelPurchasePriceSku: text("level_purchase_price_sku"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("battle_pass_configs_organization_id_idx").on(table.organizationId),
    index("battle_pass_configs_activity_idx").on(table.activityId),
    uniqueIndex("battle_pass_configs_org_code_uidx").on(
      table.organizationId,
      table.code,
    ),
    uniqueIndex("battle_pass_configs_activity_uidx").on(table.activityId),
  ],
);

/**
 * 赛季绑定的任务。**不新建任务表** —— 只挂 task_definitions.id，任务
 * 的完成判定/进度存储/周期重置全走 task 模块；本表只记录"这个任务在
 * 本赛季给多少经验"。任务完成事件 `task.completed` 由纪行 handler
 * 订阅后查本表换成对应 xpReward。
 */
export const battlePassSeasonTasks = pgTable(
  "battle_pass_season_tasks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => battlePassConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    /**
     * task_definitions.id — 软关联（不加 FK，避免纪行模块 schema 依赖
     * task 模块 schema 顺序）。任务删除场景：task 模块删前管理端会提醒。
     */
    taskDefinitionId: uuid("task_definition_id").notNull(),
    /** 完成这个任务在本赛季给多少经验。 */
    xpReward: integer("xp_reward").notNull(),
    /** 面向玩家的分类：daily | weekly | season | event。 */
    category: text("category").notNull(),
    /** 按周解锁时使用，null 表示一直开放。 */
    weekIndex: integer("week_index"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("battle_pass_season_tasks_season_idx").on(table.seasonId),
    index("battle_pass_season_tasks_task_idx").on(table.taskDefinitionId),
    uniqueIndex("battle_pass_season_tasks_season_task_uidx").on(
      table.seasonId,
      table.taskDefinitionId,
    ),
  ],
);

/**
 * 玩家赛季进度。每个（seasonId, endUserId）一行。
 *
 * `end_user_id` 是 SaaS 客户侧的业务用户 id —— text、格式未知、**不是
 * 外键**。永远不能和 Better Auth 的 `user.id`（管理员）混用。
 *
 * `owned_tiers` 是 text[]，默认 ['free']。档位激活时通过
 * `array_append` 单条 SQL 追加。
 */
export const battlePassUserProgress = pgTable(
  "battle_pass_user_progress",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => battlePassConfigs.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    currentXp: integer("current_xp").default(0).notNull(),
    currentLevel: integer("current_level").default(0).notNull(),
    ownedTiers: text("owned_tiers")
      .array()
      .notNull()
      .default(sql`ARRAY['free']::text[]`),
    lastXpAt: timestamp("last_xp_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.seasonId, table.endUserId],
      name: "battle_pass_user_progress_pk",
    }),
    index("battle_pass_user_progress_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * 领取账本（幂等）。每个（seasonId, endUserId, level, tierCode）一行。
 * 同一组合重复 claim 时 UNIQUE 拦下，返回幂等结果。
 *
 * 赛季归档时 **保留本表** 作为历史账本（对账 + 玩家历史记录）。
 */
export const battlePassClaims = pgTable(
  "battle_pass_claims",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => battlePassConfigs.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    level: integer("level").notNull(),
    tierCode: text("tier_code").notNull(),
    /** 快照发放时的奖励内容，便于审计（配置变更不影响历史）。 */
    rewardEntries: jsonb("reward_entries").$type<RewardEntry[]>().notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("battle_pass_claims_user_level_tier_uidx").on(
      table.seasonId,
      table.endUserId,
      table.level,
      table.tierCode,
    ),
    index("battle_pass_claims_season_idx").on(table.seasonId),
    index("battle_pass_claims_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * 档位激活日志（对账用）。外部支付回调 / 运营补发 / 兑换码等激活
 * 档位的路径统一写这张表，同时 `battle_pass_user_progress.owned_tiers`
 * 通过 CTE 一并更新。
 *
 * 同一（season, endUser, tier）只能激活一次（UNIQUE 去重），回调重
 * 放安全。
 */
export const battlePassTierGrants = pgTable(
  "battle_pass_tier_grants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => battlePassConfigs.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    tierCode: text("tier_code").notNull(),
    /** 'purchase' | 'admin_grant' | 'compensation' | 'promo_code'。 */
    source: text("source").notNull(),
    externalOrderId: text("external_order_id"),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("battle_pass_tier_grants_user_tier_uidx").on(
      table.seasonId,
      table.endUserId,
      table.tierCode,
    ),
    index("battle_pass_tier_grants_season_idx").on(table.seasonId),
    index("battle_pass_tier_grants_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

// ─── JSONB payload types ─────────────────────────────────────────

/**
 * 经验曲线辨识联合。业务层 `computeLevelFromXp(xp, curve, maxLevel)`
 * 按 type 分支计算。
 */
export type BattlePassLevelCurve =
  | { type: "uniform"; xpPerLevel: number }
  | { type: "custom"; thresholds: number[] }
  | { type: "arithmetic"; base: number; step: number };

export interface BattlePassTierDef {
  /** 档位 code，如 'free' / 'premium' / 'premium_plus'。 */
  code: string;
  /** 展示排序（同时是"档位等级"，数字越大级别越高）。 */
  order: number;
  /** SKU，由客户支付系统映射。null 表示免费档。 */
  priceSku: string | null;
  /** 面向前端的展示信息（名称、颜色、图标等）。 */
  displayMeta?: Record<string, unknown>;
}

export interface BattlePassLevelRewardDef {
  level: number;
  /** Map：tierCode → 该档位在该级的奖励数组。未列出的档位视为无奖励。 */
  rewards: Record<string, RewardEntry[]>;
}

export interface BattlePassBonusMilestoneDef {
  /** 达到第几级触发。 */
  atLevel: number;
  /** 需要持有的最低档位 code（比如 'premium' 表示 premium 及以上可领）。 */
  requiresTier: string;
  rewards: RewardEntry[];
  displayName: string;
}

// ─── Row types (Drizzle $inferSelect) ────────────────────────────

export type BattlePassConfig = typeof battlePassConfigs.$inferSelect;
export type BattlePassSeasonTask = typeof battlePassSeasonTasks.$inferSelect;
export type BattlePassUserProgressRow =
  typeof battlePassUserProgress.$inferSelect;
export type BattlePassClaim = typeof battlePassClaims.$inferSelect;
export type BattlePassTierGrant = typeof battlePassTierGrants.$inferSelect;
