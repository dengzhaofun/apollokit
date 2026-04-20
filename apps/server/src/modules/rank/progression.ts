/**
 * 段位推进纯函数（升/降段 + 星数 + 保护卡结算）。
 *
 * 显分（rankScore）推导：首版直接 `rankScoreDelta = round(mmrAfter -
 * mmrBefore)`，显分跟 MMR delta 同步，玩家感知直观。后续如果要做
 * "星星驱动 + 末位保护"的复杂模型，只改这里即可，service 不动。
 *
 * 星数变化：`starsDelta = win ? +1 : -1`；若 `win && winStreak+1 >=
 * protectionRules.winStreakBonusFrom`，再 +1（封顶 +2）。
 *
 * 升降段循环：见下方 `applyStarsDelta` 的实现与注释。
 *
 * ---------------------------------------------------------------------
 * 输入要求
 * ---------------------------------------------------------------------
 *
 * `tiers` 必须按 `order` 升序预排好（service 层负责）。若 `state.tierId`
 * 在 tiers 里找不到，视作玩家初始态，放到 tiers[0] 的 0 小段 0 星。
 */

import type {
  PlayerProtectionUses,
  ProtectionApplied,
  RankPlayerState,
  RankTier,
  TierProtectionRules,
} from "./types";

export type ApplyDeltaInput = {
  state: Pick<
    RankPlayerState,
    | "tierId"
    | "subtier"
    | "stars"
    | "rankScore"
    | "mmr"
    | "winStreak"
    | "lossStreak"
    | "protectionUses"
  >;
  tiers: RankTier[];
  mmrBefore: number;
  mmrAfter: number;
  win: boolean;
  placement: number;
};

export type ApplyDeltaResult = {
  tierId: string;
  subtier: number;
  stars: number;
  rankScore: number;
  mmr: number;
  winStreak: number;
  lossStreak: number;
  protectionUses: PlayerProtectionUses;
  starsDelta: number;
  promoted: boolean;
  demoted: boolean;
  protectionApplied: ProtectionApplied | null;
  tierBeforeId: string | null;
  subtierBefore: number;
  starsBefore: number;
};

function readProtectionRules(tier: RankTier): TierProtectionRules {
  const raw = (tier.protectionRules ?? {}) as Record<string, unknown>;
  const out: TierProtectionRules = {};
  if (typeof raw.demotionShieldMatches === "number") {
    out.demotionShieldMatches = raw.demotionShieldMatches;
  }
  if (typeof raw.bigDropShields === "number") {
    out.bigDropShields = raw.bigDropShields;
  }
  if (typeof raw.winStreakBonusFrom === "number") {
    out.winStreakBonusFrom = raw.winStreakBonusFrom;
  }
  return out;
}

function findTierIndex(tiers: RankTier[], tierId: string | null): number {
  if (!tierId) return 0;
  const idx = tiers.findIndex((t) => t.id === tierId);
  return idx < 0 ? 0 : idx;
}

/**
 * 真正跑升降段循环的核心。
 *
 * 约定：tiers 已按 order 升序。算法维护 `{ tierIdx, subtier, stars }`
 * 三元组，每次循环只处理一个跨边界的事件（升一小段 / 升一大段 /
 * 降一小段 / 降一大段 / 触发保护卡），直到 stars 落在 [0,
 * starsPerSubtier) 区间为止。
 */
function applyStarsDelta(
  tiers: RankTier[],
  startTierIdx: number,
  startSubtier: number,
  startStars: number,
  starsDelta: number,
  protectionUses: PlayerProtectionUses,
): {
  tierIdx: number;
  subtier: number;
  stars: number;
  promoted: boolean;
  demoted: boolean;
  protectionApplied: ProtectionApplied | null;
  protectionUses: PlayerProtectionUses;
} {
  let tierIdx = startTierIdx;
  let subtier = startSubtier;
  let stars = startStars + starsDelta;
  let promoted = false;
  let demoted = false;
  let protectionApplied: ProtectionApplied | null = null;
  const uses: PlayerProtectionUses = { ...protectionUses };

  // 升星循环
  while (true) {
    const tier = tiers[tierIdx]!;
    if (stars < tier.starsPerSubtier) break;
    stars -= tier.starsPerSubtier;
    if (subtier + 1 < tier.subtierCount) {
      subtier += 1;
      continue;
    }
    // 跨大段升段
    if (tierIdx + 1 >= tiers.length) {
      // 顶段封顶：星数钳回满星（不溢出）
      stars = tier.starsPerSubtier;
      break;
    }
    tierIdx += 1;
    subtier = 0;
    promoted = true;
    // 发新段的 demotionShield
    const next = tiers[tierIdx]!;
    const rules = readProtectionRules(next);
    if (rules.demotionShieldMatches && rules.demotionShieldMatches > 0) {
      uses.demotionShield = rules.demotionShieldMatches;
    }
    if (rules.bigDropShields && rules.bigDropShields > 0) {
      uses.bigDropShield = rules.bigDropShields;
    }
  }

  // 扣星循环
  while (stars < 0) {
    const tier = tiers[tierIdx]!;
    if (subtier > 0) {
      subtier -= 1;
      stars += tier.starsPerSubtier;
      continue;
    }
    // 最低小段 0 星以下 → 保护卡判定
    if ((uses.demotionShield ?? 0) > 0) {
      uses.demotionShield = (uses.demotionShield ?? 0) - 1;
      stars = 0;
      protectionApplied = {
        type: "demotionShield",
        remaining: uses.demotionShield,
      };
      break;
    }
    if ((uses.bigDropShield ?? 0) > 0) {
      uses.bigDropShield = (uses.bigDropShield ?? 0) - 1;
      stars = 0;
      protectionApplied = {
        type: "bigDropShield",
        remaining: uses.bigDropShield,
      };
      break;
    }
    // 跨大段降段
    if (tierIdx === 0) {
      // 最底段封底
      stars = 0;
      break;
    }
    tierIdx -= 1;
    demoted = true;
    const prev = tiers[tierIdx]!;
    subtier = prev.subtierCount - 1;
    stars = prev.starsPerSubtier - 1;
  }

  return { tierIdx, subtier, stars, promoted, demoted, protectionApplied, protectionUses: uses };
}

/**
 * 纯函数：根据当前 state + MMR delta + 胜负计算新状态。
 *
 * 不落盘，service 层拿结果做 `INSERT ... ON CONFLICT DO UPDATE`。
 */
export function applyDelta(input: ApplyDeltaInput): ApplyDeltaResult {
  const { state, tiers, mmrBefore, mmrAfter, win } = input;
  if (tiers.length === 0) {
    throw new Error("applyDelta: tiers must not be empty");
  }

  const startIdx = findTierIndex(tiers, state.tierId);
  const currentTier = tiers[startIdx]!;
  const rules = readProtectionRules(currentTier);
  const uses: PlayerProtectionUses = {
    ...(state.protectionUses as PlayerProtectionUses),
  };

  // 连胜连败计数
  const winStreak = win ? state.winStreak + 1 : 0;
  const lossStreak = win ? 0 : state.lossStreak + 1;

  // 星星 delta：基础 ±1，胜时若连胜达到阈值再 +1（封顶 +2）
  let starsDelta = win ? 1 : -1;
  if (win && rules.winStreakBonusFrom && winStreak >= rules.winStreakBonusFrom) {
    starsDelta += 1;
  }

  // subtier 边界钳制（状态越界 → 钳回安全区间，service 允许 admin
  // 手动调参导致的暂时越界）
  const safeSubtier = Math.min(
    Math.max(state.subtier, 0),
    Math.max(0, currentTier.subtierCount - 1),
  );
  const safeStars = Math.min(
    Math.max(state.stars, 0),
    currentTier.starsPerSubtier,
  );

  const {
    tierIdx: nextIdx,
    subtier: nextSubtier,
    stars: nextStars,
    promoted,
    demoted,
    protectionApplied,
    protectionUses: nextUses,
  } = applyStarsDelta(tiers, startIdx, safeSubtier, safeStars, starsDelta, uses);

  const rankScoreDelta = Math.round(mmrAfter - mmrBefore);

  return {
    tierId: tiers[nextIdx]!.id,
    subtier: nextSubtier,
    stars: nextStars,
    rankScore: state.rankScore + rankScoreDelta,
    mmr: mmrAfter,
    winStreak,
    lossStreak,
    protectionUses: nextUses,
    starsDelta,
    promoted,
    demoted,
    protectionApplied,
    tierBeforeId: currentTier.id,
    subtierBefore: safeSubtier,
    starsBefore: safeStars,
  };
}
