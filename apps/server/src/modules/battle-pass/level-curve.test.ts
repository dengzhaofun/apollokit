/**
 * 经验曲线纯函数测试 —— 无 DB 依赖。
 */
import { describe, expect, test } from "vitest";

import {
  computeLevelFromXp,
  cumulativeXpAtLevel,
  xpToNextLevel,
} from "./level-curve";

describe("level-curve / uniform", () => {
  const curve = { type: "uniform" as const, xpPerLevel: 1000 };
  const maxLevel = 10;

  test("0 xp → level 0", () => {
    expect(computeLevelFromXp(0, curve, maxLevel)).toBe(0);
  });

  test("xp just below first threshold → level 0", () => {
    expect(computeLevelFromXp(999, curve, maxLevel)).toBe(0);
  });

  test("xp hits exact first threshold → level 1", () => {
    expect(computeLevelFromXp(1000, curve, maxLevel)).toBe(1);
  });

  test("xp in middle of a level → returns floor", () => {
    expect(computeLevelFromXp(2500, curve, maxLevel)).toBe(2);
  });

  test("xp above maxLevel is capped", () => {
    expect(computeLevelFromXp(999_999, curve, maxLevel)).toBe(maxLevel);
  });

  test("cumulativeXpAtLevel scales linearly", () => {
    expect(cumulativeXpAtLevel(0, curve)).toBe(0);
    expect(cumulativeXpAtLevel(5, curve)).toBe(5000);
    expect(cumulativeXpAtLevel(10, curve)).toBe(10_000);
  });

  test("xpToNextLevel is the delta to the next threshold", () => {
    expect(xpToNextLevel(0, 0, curve, maxLevel)).toBe(1000);
    expect(xpToNextLevel(700, 0, curve, maxLevel)).toBe(300);
    expect(xpToNextLevel(1000, 1, curve, maxLevel)).toBe(1000);
  });

  test("at max level, xpToNextLevel is null", () => {
    expect(xpToNextLevel(10_000, 10, curve, maxLevel)).toBeNull();
  });
});

describe("level-curve / arithmetic", () => {
  // base=1000, step=500 →
  //   L1 needs 1000, L2 needs 1000+1500=2500, L3 needs 2500+2000=4500 ...
  //   Formula: N*base + step*N*(N-1)/2
  //   L1 = 1*1000 + 500*0 = 1000
  //   L2 = 2*1000 + 500*1 = 2500
  //   L3 = 3*1000 + 500*3 = 4500
  const curve = { type: "arithmetic" as const, base: 1000, step: 500 };
  const maxLevel = 5;

  test("cumulative thresholds match formula", () => {
    expect(cumulativeXpAtLevel(0, curve)).toBe(0);
    expect(cumulativeXpAtLevel(1, curve)).toBe(1000);
    expect(cumulativeXpAtLevel(2, curve)).toBe(2500);
    expect(cumulativeXpAtLevel(3, curve)).toBe(4500);
  });

  test("computeLevelFromXp lands on right level", () => {
    expect(computeLevelFromXp(0, curve, maxLevel)).toBe(0);
    expect(computeLevelFromXp(999, curve, maxLevel)).toBe(0);
    expect(computeLevelFromXp(1000, curve, maxLevel)).toBe(1);
    expect(computeLevelFromXp(2499, curve, maxLevel)).toBe(1);
    expect(computeLevelFromXp(2500, curve, maxLevel)).toBe(2);
    expect(computeLevelFromXp(4500, curve, maxLevel)).toBe(3);
  });
});

describe("level-curve / custom", () => {
  // thresholds[i] = accumulated XP needed to reach level i+1.
  //   L1 = 500, L2 = 1500, L3 = 4000, L4 = 8000, L5 = 20000
  const curve = {
    type: "custom" as const,
    thresholds: [500, 1500, 4000, 8000, 20_000],
  };
  const maxLevel = 5;

  test("below first threshold → level 0", () => {
    expect(computeLevelFromXp(0, curve, maxLevel)).toBe(0);
    expect(computeLevelFromXp(499, curve, maxLevel)).toBe(0);
  });

  test("across the bumpy thresholds", () => {
    expect(computeLevelFromXp(500, curve, maxLevel)).toBe(1);
    expect(computeLevelFromXp(1499, curve, maxLevel)).toBe(1);
    expect(computeLevelFromXp(1500, curve, maxLevel)).toBe(2);
    expect(computeLevelFromXp(4000, curve, maxLevel)).toBe(3);
    expect(computeLevelFromXp(7999, curve, maxLevel)).toBe(3);
    expect(computeLevelFromXp(8000, curve, maxLevel)).toBe(4);
    expect(computeLevelFromXp(19_999, curve, maxLevel)).toBe(4);
    expect(computeLevelFromXp(20_000, curve, maxLevel)).toBe(5);
    expect(computeLevelFromXp(100_000_000, curve, maxLevel)).toBe(5);
  });

  test("xpToNextLevel uses custom thresholds", () => {
    expect(xpToNextLevel(0, 0, curve, maxLevel)).toBe(500);
    expect(xpToNextLevel(500, 1, curve, maxLevel)).toBe(1000);
    expect(xpToNextLevel(1500, 2, curve, maxLevel)).toBe(2500);
  });
});
