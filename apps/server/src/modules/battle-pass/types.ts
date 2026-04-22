import type { RewardEntry } from "../../lib/rewards";
import type {
  BattlePassBonusMilestoneDef,
  BattlePassClaim,
  BattlePassConfig,
  BattlePassLevelCurve,
  BattlePassLevelRewardDef,
  BattlePassSeasonTask,
  BattlePassTierDef,
  BattlePassTierGrant,
  BattlePassUserProgressRow,
} from "../../schema/battle-pass";

export type {
  BattlePassBonusMilestoneDef,
  BattlePassClaim,
  BattlePassConfig,
  BattlePassLevelCurve,
  BattlePassLevelRewardDef,
  BattlePassSeasonTask,
  BattlePassTierDef,
  BattlePassTierGrant,
  BattlePassUserProgressRow,
};

export const BATTLE_PASS_CURVE_TYPES = [
  "uniform",
  "custom",
  "arithmetic",
] as const;
export type BattlePassCurveType = (typeof BATTLE_PASS_CURVE_TYPES)[number];

export const BATTLE_PASS_TASK_CATEGORIES = [
  "daily",
  "weekly",
  "season",
  "event",
] as const;
export type BattlePassTaskCategory =
  (typeof BATTLE_PASS_TASK_CATEGORIES)[number];

export const BATTLE_PASS_TIER_GRANT_SOURCES = [
  "purchase",
  "admin_grant",
  "compensation",
  "promo_code",
] as const;
export type BattlePassTierGrantSource =
  (typeof BATTLE_PASS_TIER_GRANT_SOURCES)[number];

/** Handler.executeCommand 的 command 辨识联合。 */
export type BattlePassCommand =
  | {
      type: "grant-tier";
      payload: {
        endUserId: string;
        tierCode: string;
        source: BattlePassTierGrantSource;
        externalOrderId?: string | null;
      };
    }
  | {
      type: "claim-level";
      payload: {
        endUserId: string;
        level: number;
        tierCode: string;
      };
    }
  | {
      type: "claim-all";
      payload: {
        endUserId: string;
      };
    };

/**
 * 领取操作的结果项。一次 claim-all 返回数组；claim-level 返回单元素。
 * `idempotent: true` 表示之前已领（UNIQUE 拦下），此次无实际发奖。
 */
export interface BattlePassClaimOutcome {
  level: number;
  tierCode: string;
  idempotent: boolean;
  rewardEntries: RewardEntry[];
}

export interface BattlePassClaimableEntry {
  level: number;
  tierCode: string;
  rewardEntries: RewardEntry[];
}

/**
 * 聚合视图（`getUserState` / `GET /aggregate` 的返回）。一次性把玩家
 * 打开纪行页需要的全部信息拿回来。
 */
export interface BattlePassAggregateView {
  season: {
    id: string;
    code: string;
    name: string;
    maxLevel: number;
    tiers: BattlePassTierDef[];
    levelCurve: BattlePassLevelCurve;
  };
  progress: {
    currentXp: number;
    currentLevel: number;
    xpToNextLevel: number | null;
    ownedTiers: string[];
  };
  claimable: BattlePassClaimableEntry[];
  /** 绑定到本赛季的任务定义 id（玩家端再拿去 task 模块查具体进度）。 */
  taskBindings: Array<{
    taskDefinitionId: string;
    xpReward: number;
    category: BattlePassTaskCategory;
    weekIndex: number | null;
    sortOrder: number;
  }>;
}

export interface BattlePassGrantTierOutcome {
  idempotent: boolean;
  ownedTiers: string[];
}

/** `grantXpForTask` 的结果。idempotent 意味着任务或纪行已过期/不匹配，未加经验。 */
export interface BattlePassXpGrantOutcome {
  idempotent: boolean;
  seasonId: string | null;
  xpAdded: number;
  oldLevel: number;
  newLevel: number;
  currentXp: number;
}
