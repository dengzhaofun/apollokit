/**
 * 天梯模块域类型。
 *
 * 主要是 Drizzle `$inferSelect` 的门面 + 结算 / 段位推进相关的纯数据
 * 结构。schema 里的 jsonb 字段（ratingParams / protectionRules /
 * protectionUses 等）在 DB 层是 `Record<string, unknown>`，本文件给
 * 出业务语义化的结构化子类型（`EloRatingParams` /
 * `TierProtectionRules` / `PlayerProtectionUses`）供 service /
 * progression / rating 共用。
 */

import type {
  rankMatches,
  rankMatchParticipants,
  rankPlayerStates,
  rankSeasons,
  rankSeasonSnapshots,
  rankTierConfigs,
  rankTiers,
} from "../../schema/rank";

export type RankTierConfig = typeof rankTierConfigs.$inferSelect;
export type RankTier = typeof rankTiers.$inferSelect;
export type RankSeason = typeof rankSeasons.$inferSelect;
export type RankPlayerState = typeof rankPlayerStates.$inferSelect;
export type RankMatch = typeof rankMatches.$inferSelect;
export type RankMatchParticipant = typeof rankMatchParticipants.$inferSelect;
export type RankSeasonSnapshot = typeof rankSeasonSnapshots.$inferSelect;

export const SEASON_STATUSES = ["upcoming", "active", "finished"] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const RATING_STRATEGIES = ["elo", "glicko2"] as const;
export type RatingStrategyName = (typeof RATING_STRATEGIES)[number];

export const TEAM_MODES = ["avgTeamElo"] as const;
export type TeamMode = (typeof TEAM_MODES)[number];

/** 结构化的 rating_params jsonb —— Elo 版 */
export type EloRatingParams = {
  strategy: "elo";
  baseK: number;
  teamMode: TeamMode;
  /** 0..1，performance_score 对 delta 的额外影响权重；默认 0 = 忽略 */
  perfWeight?: number;
  /** 新玩家首次结算时的初始 MMR；默认 1000 */
  initialMmr?: number;
};

/** 未来扩展 Glicko-2 用；首版不消费 */
export type Glicko2RatingParams = {
  strategy: "glicko2";
  tau: number;
  initialMmr?: number;
  initialDeviation?: number;
  initialVolatility?: number;
};

export type RatingParams = EloRatingParams | Glicko2RatingParams;

/** rank_tiers.protection_rules 的结构化 view */
export type TierProtectionRules = {
  /** 新入段补发的连输保护卡张数 */
  demotionShieldMatches?: number;
  /** 该大段可用的"兜底防整段跌落"卡张数 */
  bigDropShields?: number;
  /** 连胜 >= N 时额外 +1 星（0 或未填 → 关闭）*/
  winStreakBonusFrom?: number;
};

/** rank_player_states.protection_uses 的结构化 view */
export type PlayerProtectionUses = {
  demotionShield?: number;
  bigDropShield?: number;
};

/** progression.applyDelta 里对保护卡触发的记录 */
export type ProtectionApplied = {
  type: "demotionShield" | "bigDropShield";
  remaining: number;
};

/** 玩家段位的前端视图：state + 当前 tier 装饰 */
export type PlayerRankView = {
  seasonId: string;
  endUserId: string;
  rankScore: number;
  mmr: number;
  subtier: number;
  stars: number;
  winStreak: number;
  lossStreak: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  protectionUses: PlayerProtectionUses;
  lastMatchAt: Date | null;
  tier: {
    id: string;
    alias: string;
    name: string;
    order: number;
    subtierCount: number;
    starsPerSubtier: number;
  } | null;
};

/** settleMatch 返回每位玩家的 delta 汇总 */
export type ParticipantDelta = {
  endUserId: string;
  teamId: string;
  win: boolean;
  mmrBefore: number;
  mmrAfter: number;
  rankScoreBefore: number;
  rankScoreAfter: number;
  starsDelta: number;
  subtierBefore: number;
  subtierAfter: number;
  starsBefore: number;
  starsAfter: number;
  tierBeforeId: string | null;
  tierAfterId: string | null;
  promoted: boolean;
  demoted: boolean;
  protectionApplied: ProtectionApplied | null;
};
