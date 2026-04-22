/**
 * 经验曲线计算 —— 纯函数，方便单元测试。
 *
 * 支持三种曲线：
 *   - uniform:    每级固定 xpPerLevel（原神式）
 *   - custom:     thresholds[i] = 第 i+1 级累计所需经验
 *   - arithmetic: level N 阈值 = base + step * (N-1)
 *
 * 等级范围 [0, maxLevel]。0 级表示还没升过第一级。达到某级的阈值
 * 就视为"到了这一级"（不需要到下一级阈值）。
 */

import type { BattlePassLevelCurve } from "../../schema/battle-pass";

/**
 * 累计到达 level N 所需的经验总量。
 * level=0 → 0；level=1 → 首级阈值；level=maxLevel → 满级阈值。
 */
export function cumulativeXpAtLevel(
  level: number,
  curve: BattlePassLevelCurve,
): number {
  if (level <= 0) return 0;
  switch (curve.type) {
    case "uniform":
      return level * curve.xpPerLevel;
    case "custom":
      // thresholds[i] 对应 level i+1 的累计需求
      if (level - 1 >= curve.thresholds.length) {
        return curve.thresholds[curve.thresholds.length - 1] ?? 0;
      }
      return curve.thresholds[level - 1] ?? 0;
    case "arithmetic":
      // 等差数列前 N 项和：N*base + step*(0+1+...+N-1) = N*base + step*N*(N-1)/2
      return level * curve.base + (curve.step * level * (level - 1)) / 2;
  }
}

/**
 * 根据累计经验算当前等级（封顶到 maxLevel）。
 *
 * 设 maxLevel=50，xp=0 → level=0；xp 刚好够到第 N 级阈值 → level=N。
 * 超过 maxLevel 的经验溢出忽略（不升级）。
 */
export function computeLevelFromXp(
  xp: number,
  curve: BattlePassLevelCurve,
  maxLevel: number,
): number {
  if (xp <= 0 || maxLevel <= 0) return 0;

  // uniform / arithmetic 可以直接公式解，但为了统一（custom 必须走
  // 二分/线性），这里统一用 "逐级比较累计阈值" 的方式。等级不大
  // （通常 50-100），性能不敏感。
  let level = 0;
  for (let n = 1; n <= maxLevel; n++) {
    const threshold = cumulativeXpAtLevel(n, curve);
    if (xp >= threshold) {
      level = n;
    } else {
      break;
    }
  }
  return level;
}

/**
 * 到下一级还差多少经验。满级返回 null。
 */
export function xpToNextLevel(
  currentXp: number,
  currentLevel: number,
  curve: BattlePassLevelCurve,
  maxLevel: number,
): number | null {
  if (currentLevel >= maxLevel) return null;
  const nextThreshold = cumulativeXpAtLevel(currentLevel + 1, curve);
  return Math.max(0, nextThreshold - currentXp);
}
