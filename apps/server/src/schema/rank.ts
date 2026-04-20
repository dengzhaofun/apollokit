import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * 天梯 / 段位基座（rank）schema。
 *
 * 多套天梯：一个 organization 可以并行跑 N 套天梯（e.g. "5v5 排位" /
 * "3v3 休闲"）。每条 `rank_tier_configs` 就是一套天梯；其下挂 N 个
 * `rank_tiers`（大段：青铜/白银/…），每个大段再用 `subtierCount` +
 * `starsPerSubtier` 描述「小段 + 星」结构。赛季（`rank_seasons`）把
 * 一套天梯的一次赛程包起来，约束为**同 tier_config_id 下最多一个
 * status=active**（由 service + validators 把关；DB 未加硬约束，因为
 * active 是可变状态，partial unique index 在 status 流转时更难维护）。
 *
 * 玩家状态：`rank_player_states` 是热点表，一人一赛季一行；所有结算
 * 通过 `(seasonId, endUserId)` 唯一索引走 `INSERT ... ON CONFLICT DO
 * UPDATE`，兼容"新玩家首次结算 → 默认初始化 + 更新"。
 *
 * 结算：`rank_matches.(organizationId, externalMatchId)` 唯一索引是
 * **幂等门**，`settleMatch` 流程的第一步 `INSERT ... ON CONFLICT DO
 * NOTHING RETURNING id` 拿到空即视作重复请求直接返回。
 */

// ── 段位体系配置（父表）──────────────────────────────────────────
/**
 * 某个客户自配的一套天梯"规则"。包含：
 *   - alias（天梯标识，同 org 唯一；C 端接口用它定位天梯）
 *   - ratingParams（Elo 的 baseK / teamMode / perfWeight 等）
 *   - 下挂 rank_tiers 描述大段结构
 *
 * version 每次 editor 保存 +1，给前端乐观锁用（首版不强校验，留给未来）。
 */
export const rankTierConfigs = pgTable(
  "rank_tier_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Elo / 后续 Glicko-2 策略参数。结构约定：
     *   {
     *     strategy: "elo",
     *     baseK: 32,
     *     teamMode: "avgTeamElo",
     *     perfWeight?: 0-1,
     *     initialMmr?: 1000,
     *   }
     */
    ratingParams: jsonb("rating_params").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("rank_tier_configs_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("rank_tier_configs_org_active_idx").on(
      table.organizationId,
      table.isActive,
    ),
  ],
);

// ── 单个大段定义（青铜 / 白银 / … / 王者）────────────────────────
/**
 * 一条 = 一个大段。subtier 和 star 由 `subtierCount` /
 * `starsPerSubtier` 两个整数字段描述，不单独建表（避免一次查询撞到
 * 三张表）。
 *
 * `order` 是段位低→高的整数序列（0,1,2,…），升降段时按 order±1 找
 * 前/后段。`minRankScore` / `maxRankScore` 暂时只用于可视化与 admin
 * 手动调整时定位段位；真正的段位归属由 tier_id 直接存。
 *
 * protectionRules 是 JSONB，结构：
 *   {
 *     demotionShieldMatches?: number,  // 新入段发这么多张"连输保护卡"
 *     bigDropShields?: number,         // 兜底防整段跌落的卡数
 *     winStreakBonusFrom?: number,     // 连胜 >= N 时 +1 额外星
 *   }
 */
export const rankTiers = pgTable(
  "rank_tiers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tierConfigId: uuid("tier_config_id")
      .notNull()
      .references(() => rankTierConfigs.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    order: integer("order").notNull(),
    minRankScore: integer("min_rank_score").notNull(),
    maxRankScore: integer("max_rank_score"),
    subtierCount: smallint("subtier_count").default(1).notNull(),
    starsPerSubtier: smallint("stars_per_subtier").default(5).notNull(),
    protectionRules: jsonb("protection_rules")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("rank_tiers_config_alias_uidx").on(
      table.tierConfigId,
      table.alias,
    ),
    uniqueIndex("rank_tiers_config_order_uidx").on(
      table.tierConfigId,
      table.order,
    ),
    index("rank_tiers_config_score_idx").on(
      table.tierConfigId,
      table.minRankScore,
      table.maxRankScore,
    ),
  ],
);

// ── 赛季 ─────────────────────────────────────────────────────────
/**
 * 一套天梯的一次赛程。tier_config_id 必填，一个 config 可有多个赛季
 * 但约束"同一 config 内仅一个 status=active"——service 层 activateSeason
 * 时用 `WHERE tier_config_id=? AND status='active'` 防撞。
 *
 * inheritanceRules 结构预留（decay / softReset / keep），首版
 * finalize 时不真跑衰减逻辑。
 */
export const rankSeasons = pgTable(
  "rank_seasons",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tierConfigId: uuid("tier_config_id")
      .notNull()
      .references(() => rankTierConfigs.id, { onDelete: "restrict" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    status: text("status").notNull().default("upcoming"),
    inheritanceRules: jsonb("inheritance_rules")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("rank_seasons_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("rank_seasons_config_status_idx").on(
      table.tierConfigId,
      table.status,
    ),
    index("rank_seasons_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("rank_seasons_window_idx").on(
      table.organizationId,
      table.startAt,
      table.endAt,
    ),
  ],
);

// ── 玩家当前段位（一人一赛季一行）────────────────────────────────
/**
 * 双轨制存法：
 *   - rankScore（显分）驱动"加减星 + 上榜排序"
 *   - mmr（隐藏分）驱动匹配公平性（匹配系统本期不做，字段已留）
 *
 * 段位定位：tier_id + subtier + stars 组合。tier_id 是当前大段的
 * `rank_tiers.id`，subtier 是当前小段（0..subtierCount-1），stars 是
 * 当前小段星数（0..starsPerSubtier）。
 *
 * protectionUses 结构：
 *   { demotionShield?: number, bigDropShield?: number }
 * 当前剩余的保护卡张数。新进入大段时由 service 根据该段
 * protectionRules.demotionShieldMatches 补满。
 */
export const rankPlayerStates = pgTable(
  "rank_player_states",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => rankSeasons.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tierId: uuid("tier_id").references(() => rankTiers.id, {
      onDelete: "set null",
    }),
    subtier: smallint("subtier").default(0).notNull(),
    stars: smallint("stars").default(0).notNull(),
    rankScore: integer("rank_score").default(0).notNull(),
    mmr: doublePrecision("mmr").default(1000).notNull(),
    mmrDeviation: doublePrecision("mmr_deviation").default(350).notNull(),
    mmrVolatility: doublePrecision("mmr_volatility").default(0.06).notNull(),
    winStreak: smallint("win_streak").default(0).notNull(),
    lossStreak: smallint("loss_streak").default(0).notNull(),
    protectionUses: jsonb("protection_uses")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    matchesPlayed: integer("matches_played").default(0).notNull(),
    wins: integer("wins").default(0).notNull(),
    losses: integer("losses").default(0).notNull(),
    lastMatchAt: timestamp("last_match_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("rank_player_states_season_user_uidx").on(
      table.seasonId,
      table.endUserId,
    ),
    index("rank_player_states_org_season_idx").on(
      table.organizationId,
      table.seasonId,
    ),
    // PG 兜底榜（Redis 不可用时 / 段位内榜走这条）
    index("rank_player_states_season_score_idx").on(
      table.seasonId,
      table.rankScore,
    ),
    index("rank_player_states_season_tier_idx").on(
      table.seasonId,
      table.tierId,
      table.rankScore,
    ),
  ],
);

// ── 一局比赛（幂等门）────────────────────────────────────────────
/**
 * externalMatchId 是客户侧局号，`(organizationId, externalMatchId)`
 * 唯一索引是 `settleMatch` 的幂等门：
 *
 *   INSERT INTO rank_matches (...) VALUES (...)
 *   ON CONFLICT (organization_id, external_match_id) DO NOTHING
 *   RETURNING id;
 *
 * 拿到空 → 已存在，视作重复请求直接返回。
 *
 * rawPayload 保留整条原始请求体便于审计；metadata 存 reportedBy（header
 * 上报者 endUserId）等上下文。
 */
export const rankMatches = pgTable(
  "rank_matches",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => rankSeasons.id, { onDelete: "cascade" }),
    externalMatchId: text("external_match_id").notNull(),
    gameMode: text("game_mode"),
    totalParticipants: smallint("total_participants").notNull(),
    teamCount: smallint("team_count").notNull(),
    settledAt: timestamp("settled_at").defaultNow().notNull(),
    rawPayload: jsonb("raw_payload"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("rank_matches_org_external_uidx").on(
      table.organizationId,
      table.externalMatchId,
    ),
    index("rank_matches_season_settled_idx").on(
      table.seasonId,
      table.settledAt,
    ),
  ],
);

// ── 参赛者 delta 快照（每局每人一行）──────────────────────────────
/**
 * 结算时每位玩家的变化。外层由 rank_matches 的幂等门保证不重复，本表
 * 额外加 UNIQUE(match_id, end_user_id) 做冗余保护：即便上层有 bug 重
 * 复插入，DB 层也会硬报错而非静默重算。
 */
export const rankMatchParticipants = pgTable(
  "rank_match_participants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    matchId: uuid("match_id")
      .notNull()
      .references(() => rankMatches.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    seasonId: uuid("season_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    teamId: text("team_id").notNull(),
    placement: smallint("placement"),
    win: boolean("win").notNull(),
    performanceScore: doublePrecision("performance_score"),
    mmrBefore: doublePrecision("mmr_before").notNull(),
    mmrAfter: doublePrecision("mmr_after").notNull(),
    rankScoreBefore: integer("rank_score_before").notNull(),
    rankScoreAfter: integer("rank_score_after").notNull(),
    tierBeforeId: uuid("tier_before_id"),
    tierAfterId: uuid("tier_after_id"),
    subtierBefore: smallint("subtier_before").notNull(),
    subtierAfter: smallint("subtier_after").notNull(),
    starsBefore: smallint("stars_before").notNull(),
    starsAfter: smallint("stars_after").notNull(),
    starsDelta: smallint("stars_delta").notNull(),
    promoted: boolean("promoted").default(false).notNull(),
    demoted: boolean("demoted").default(false).notNull(),
    protectionApplied: jsonb("protection_applied"),
  },
  (table) => [
    uniqueIndex("rank_match_participants_match_user_uidx").on(
      table.matchId,
      table.endUserId,
    ),
    index("rank_match_participants_user_recent_idx").on(
      table.organizationId,
      table.seasonId,
      table.endUserId,
      table.id,
    ),
  ],
);

// ── 赛季结束快照（finalize 写入）─────────────────────────────────
/**
 * `finalizeSeason` 走一条 SQL 生成所有快照：
 *
 *   INSERT INTO rank_season_snapshots (..., final_global_rank)
 *   SELECT ..., row_number() OVER (ORDER BY rank_score DESC, mmr DESC)
 *     FROM rank_player_states WHERE season_id = $1
 *   ON CONFLICT DO NOTHING;
 *
 * UNIQUE(season_id, end_user_id) 保证 finalize 幂等：重复调只会返回
 * 0 行受影响。
 */
export const rankSeasonSnapshots = pgTable(
  "rank_season_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => rankSeasons.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    finalTierId: uuid("final_tier_id"),
    finalSubtier: smallint("final_subtier").notNull(),
    finalStars: smallint("final_stars").notNull(),
    finalRankScore: integer("final_rank_score").notNull(),
    finalMmr: doublePrecision("final_mmr").notNull(),
    finalGlobalRank: integer("final_global_rank"),
    settledAt: timestamp("settled_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("rank_season_snapshots_uidx").on(
      table.seasonId,
      table.endUserId,
    ),
    index("rank_season_snapshots_season_rank_idx").on(
      table.seasonId,
      table.finalGlobalRank,
    ),
  ],
);
