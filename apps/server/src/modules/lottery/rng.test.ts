/**
 * Pure unit tests for lottery RNG functions.
 *
 * No database, no IO — all deterministic via injected rng floats.
 * Covers: weighted selection, tier weight computation, pity mechanics,
 * and the full selectPrize algorithm.
 */
import { describe, expect, test } from "vitest";

import type { LotteryPityRule, LotteryPrize, LotteryTier } from "./types";
import {
  weightedSelect,
  computeTierWeights,
  computePrizeWeights,
  checkHardPity,
  updatePityCounters,
  selectPrize,
  type WeightedItem,
} from "./rng";

// ─── Helpers ──────────────────────────────────────────────────

function makeTier(overrides: Partial<LotteryTier> & { id: string }): LotteryTier {
  return {
    poolId: "pool-1",
    tenantId: "org-1",
    name: overrides.id,
    alias: null,
    baseWeight: 100,
    color: null,
    icon: null,
    sortOrder: "a0",
    isActive: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrize(overrides: Partial<LotteryPrize> & { id: string }): LotteryPrize {
  return {
    tierId: null,
    poolId: "pool-1",
    tenantId: "org-1",
    name: overrides.id,
    description: null,
    rewardItems: [],
    weight: 100,
    isRateUp: false,
    rateUpWeight: 0,
    globalStockLimit: null,
    globalStockUsed: 0,
    fallbackPrizeId: null,
    sortOrder: "a0",
    isActive: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRule(
  overrides: Partial<LotteryPityRule> & { id: string; guaranteeTierId: string },
): LotteryPityRule {
  return {
    poolId: "pool-1",
    tenantId: "org-1",
    hardPityThreshold: 90,
    softPityStartAt: null,
    softPityWeightIncrement: null,
    isActive: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── weightedSelect ───────────────────────────────────────────

describe("weightedSelect", () => {
  test("returns null for empty list", () => {
    expect(weightedSelect([], 0.5)).toBeNull();
  });

  test("returns null when total weight is 0", () => {
    const items: WeightedItem[] = [{ id: "a", effectiveWeight: 0 }];
    expect(weightedSelect(items, 0.5)).toBeNull();
  });

  test("single item always selected", () => {
    const items: WeightedItem[] = [{ id: "a", effectiveWeight: 100 }];
    expect(weightedSelect(items, 0)).toBe("a");
    expect(weightedSelect(items, 0.5)).toBe("a");
    expect(weightedSelect(items, 0.999)).toBe("a");
  });

  test("selects based on cumulative weight", () => {
    const items: WeightedItem[] = [
      { id: "a", effectiveWeight: 30 },
      { id: "b", effectiveWeight: 70 },
    ];
    // Total = 100, roll = 0.0 * 100 = 0 → a (0 < 30)
    expect(weightedSelect(items, 0.0)).toBe("a");
    // roll = 0.29 * 100 = 29 → a (29 < 30)
    expect(weightedSelect(items, 0.29)).toBe("a");
    // roll = 0.30 * 100 = 30 → b (30 >= 30, 30 < 100)
    expect(weightedSelect(items, 0.30)).toBe("b");
    // roll = 0.99 * 100 = 99 → b (99 < 100)
    expect(weightedSelect(items, 0.99)).toBe("b");
  });

  test("handles floating point edge case (returns last item)", () => {
    const items: WeightedItem[] = [
      { id: "a", effectiveWeight: 50 },
      { id: "b", effectiveWeight: 50 },
    ];
    // When randomFloat = 1.0 (edge), cumulative never exceeds → last item
    expect(weightedSelect(items, 1.0)).toBe("b");
  });
});

// ─── computeTierWeights ───────────────────────────────────────

describe("computeTierWeights", () => {
  test("returns base weights with no pity rules", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 6 }),
      makeTier({ id: "sr", baseWeight: 51 }),
      makeTier({ id: "r", baseWeight: 943 }),
    ];
    const result = computeTierWeights(tiers, [], {});
    expect(result).toEqual([
      { id: "ssr", effectiveWeight: 6 },
      { id: "sr", effectiveWeight: 51 },
      { id: "r", effectiveWeight: 943 },
    ]);
  });

  test("filters out inactive tiers", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 6 }),
      makeTier({ id: "sr", baseWeight: 51, isActive: false }),
    ];
    const result = computeTierWeights(tiers, [], {});
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ssr");
  });

  test("applies soft pity boost", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 6 }),
      makeTier({ id: "r", baseWeight: 943 }),
    ];
    const rules = [
      makeRule({
        id: "rule-1",
        guaranteeTierId: "ssr",
        hardPityThreshold: 90,
        softPityStartAt: 74,
        softPityWeightIncrement: 60,
      }),
    ];
    // At pull 80: 80 - 74 + 1 = 7 pulls over soft pity start
    const counters = { "rule-1": 80 };
    const result = computeTierWeights(tiers, rules, counters);
    const ssrWeight = result.find((r) => r.id === "ssr")!.effectiveWeight;
    expect(ssrWeight).toBe(6 + 60 * 7); // 6 + 420 = 426
  });

  test("no boost before soft pity threshold", () => {
    const tiers = [makeTier({ id: "ssr", baseWeight: 6 })];
    const rules = [
      makeRule({
        id: "rule-1",
        guaranteeTierId: "ssr",
        softPityStartAt: 74,
        softPityWeightIncrement: 60,
      }),
    ];
    const counters = { "rule-1": 73 };
    const result = computeTierWeights(tiers, rules, counters);
    expect(result[0]!.effectiveWeight).toBe(6);
  });
});

// ─── computePrizeWeights ──────────────────────────────────────

describe("computePrizeWeights", () => {
  test("filters inactive prizes", () => {
    const prizes = [
      makePrize({ id: "p1", weight: 100 }),
      makePrize({ id: "p2", weight: 200, isActive: false }),
    ];
    const result = computePrizeWeights(prizes);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p1");
  });

  test("excludes stock-depleted prizes", () => {
    const prizes = [
      makePrize({ id: "p1", weight: 100, globalStockLimit: 5, globalStockUsed: 5 }),
      makePrize({ id: "p2", weight: 100, globalStockLimit: 5, globalStockUsed: 3 }),
      makePrize({ id: "p3", weight: 100 }), // unlimited
    ];
    const result = computePrizeWeights(prizes);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["p2", "p3"]);
  });

  test("adds rate-up weight", () => {
    const prizes = [
      makePrize({ id: "p1", weight: 50, isRateUp: true, rateUpWeight: 50 }),
      makePrize({ id: "p2", weight: 50 }),
    ];
    const result = computePrizeWeights(prizes);
    expect(result.find((r) => r.id === "p1")!.effectiveWeight).toBe(100);
    expect(result.find((r) => r.id === "p2")!.effectiveWeight).toBe(50);
  });

  test("respects excludeIds", () => {
    const prizes = [
      makePrize({ id: "p1", weight: 100 }),
      makePrize({ id: "p2", weight: 100 }),
    ];
    const result = computePrizeWeights(prizes, new Set(["p1"]));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p2");
  });
});

// ─── checkHardPity ────────────────────────────────────────────

describe("checkHardPity", () => {
  test("returns null when no rules active", () => {
    expect(checkHardPity([], {})).toBeNull();
  });

  test("returns null when counter below threshold", () => {
    const rules = [
      makeRule({ id: "r1", guaranteeTierId: "ssr", hardPityThreshold: 90 }),
    ];
    expect(checkHardPity(rules, { r1: 88 })).toBeNull();
  });

  test("triggers at threshold - 1", () => {
    const rules = [
      makeRule({ id: "r1", guaranteeTierId: "ssr", hardPityThreshold: 90 }),
    ];
    // counter = 89 means we've done 89 pulls without SSR, next (this) is #90
    expect(checkHardPity(rules, { r1: 89 })).toBe("ssr");
  });

  test("triggers when counter exceeds threshold", () => {
    const rules = [
      makeRule({ id: "r1", guaranteeTierId: "ssr", hardPityThreshold: 90 }),
    ];
    expect(checkHardPity(rules, { r1: 100 })).toBe("ssr");
  });

  test("skips inactive rules", () => {
    const rules = [
      makeRule({
        id: "r1",
        guaranteeTierId: "ssr",
        hardPityThreshold: 10,
        isActive: false,
      }),
    ];
    expect(checkHardPity(rules, { r1: 100 })).toBeNull();
  });
});

// ─── updatePityCounters ──────────────────────────────────────

describe("updatePityCounters", () => {
  test("resets counter for won tier, increments others", () => {
    const rules = [
      makeRule({ id: "r-ssr", guaranteeTierId: "ssr" }),
      makeRule({ id: "r-sr", guaranteeTierId: "sr" }),
    ];
    const counters = { "r-ssr": 50, "r-sr": 8 };
    const result = updatePityCounters(rules, counters, "ssr");
    expect(result["r-ssr"]).toBe(0); // won SSR → reset
    expect(result["r-sr"]).toBe(9); // didn't win SR → increment
  });

  test("increments all when wonTierId is null (flat mode)", () => {
    const rules = [
      makeRule({ id: "r-ssr", guaranteeTierId: "ssr" }),
    ];
    const result = updatePityCounters(rules, { "r-ssr": 5 }, null);
    expect(result["r-ssr"]).toBe(6);
  });

  test("initializes missing counters from 0", () => {
    const rules = [
      makeRule({ id: "r-ssr", guaranteeTierId: "ssr" }),
    ];
    const result = updatePityCounters(rules, {}, "sr");
    expect(result["r-ssr"]).toBe(1);
  });

  test("skips inactive rules", () => {
    const rules = [
      makeRule({ id: "r1", guaranteeTierId: "ssr", isActive: false }),
      makeRule({ id: "r2", guaranteeTierId: "sr" }),
    ];
    const result = updatePityCounters(rules, { r1: 5, r2: 3 }, "sr");
    expect(result["r1"]).toBeUndefined();
    expect(result["r2"]).toBe(0);
  });
});

// ─── selectPrize (integration of all above) ──────────────────

describe("selectPrize", () => {
  test("flat mode — selects from all prizes directly", () => {
    const prizes = [
      makePrize({ id: "p1", weight: 100 }),
      makePrize({ id: "p2", weight: 100 }),
    ];
    // rng returns 0.0 → first prize
    const result = selectPrize({
      tiers: [],
      prizes,
      pityRules: [],
      pityCounters: {},
      rng: () => 0.0,
    });
    expect(result).not.toBeNull();
    expect(result!.tierId).toBeNull();
    expect(result!.tierName).toBeNull();
    expect(result!.prizeId).toBe("p1");
    expect(result!.pityTriggered).toBe(false);
  });

  test("flat mode — returns null when no prizes available", () => {
    const result = selectPrize({
      tiers: [],
      prizes: [],
      pityRules: [],
      pityCounters: {},
    });
    expect(result).toBeNull();
  });

  test("tiered mode — selects tier then prize", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 10, name: "SSR" }),
      makeTier({ id: "r", baseWeight: 990, name: "R" }),
    ];
    const prizes = [
      makePrize({ id: "p-ssr", tierId: "ssr", weight: 100 }),
      makePrize({ id: "p-r", tierId: "r", weight: 100 }),
    ];

    // First rng call for tier selection: 0.005 → SSR (weight 10 / 1000)
    // Second rng call for prize selection within SSR: 0.5
    let callCount = 0;
    const rng = () => {
      callCount++;
      return callCount === 1 ? 0.005 : 0.5;
    };

    const result = selectPrize({
      tiers,
      prizes,
      pityRules: [],
      pityCounters: {},
      rng,
    });
    expect(result).not.toBeNull();
    expect(result!.tierId).toBe("ssr");
    expect(result!.tierName).toBe("SSR");
    expect(result!.prizeId).toBe("p-ssr");
  });

  test("hard pity forces tier selection", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 6, name: "SSR" }),
      makeTier({ id: "r", baseWeight: 994, name: "R" }),
    ];
    const prizes = [
      makePrize({ id: "p-ssr", tierId: "ssr", weight: 100 }),
      makePrize({ id: "p-r", tierId: "r", weight: 100 }),
    ];
    const rules = [
      makeRule({ id: "rule-1", guaranteeTierId: "ssr", hardPityThreshold: 90 }),
    ];

    // Counter = 89 → hard pity triggers, forcing SSR
    // rng only called once (for prize within forced tier)
    const result = selectPrize({
      tiers,
      prizes,
      pityRules: rules,
      pityCounters: { "rule-1": 89 },
      rng: () => 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.tierId).toBe("ssr");
    expect(result!.pityTriggered).toBe(true);
    expect(result!.pityRuleId).toBe("rule-1");
  });

  test("soft pity boosts weight but doesn't force", () => {
    const tiers = [
      makeTier({ id: "ssr", baseWeight: 6, name: "SSR" }),
      makeTier({ id: "r", baseWeight: 994, name: "R" }),
    ];
    const prizes = [
      makePrize({ id: "p-ssr", tierId: "ssr", weight: 100 }),
      makePrize({ id: "p-r", tierId: "r", weight: 100 }),
    ];
    const rules = [
      makeRule({
        id: "rule-1",
        guaranteeTierId: "ssr",
        hardPityThreshold: 90,
        softPityStartAt: 74,
        softPityWeightIncrement: 600,
      }),
    ];

    // Counter = 80: 80 - 74 + 1 = 7 pulls over soft start
    // SSR effective weight = 6 + 600*7 = 4206
    // R weight = 994
    // Total = 5200
    // SSR probability = 4206/5200 ≈ 0.809
    // With rng=0.5, roll = 0.5 * 5200 = 2600 → SSR wins (cumulative 4206 > 2600)
    let callCount = 0;
    const result = selectPrize({
      tiers,
      prizes,
      pityRules: rules,
      pityCounters: { "rule-1": 80 },
      rng: () => {
        callCount++;
        return 0.5;
      },
    });
    expect(result).not.toBeNull();
    expect(result!.tierId).toBe("ssr");
    expect(result!.pityTriggered).toBe(false); // soft pity doesn't set this flag
  });

  test("statistical distribution matches weights (10k pulls)", () => {
    const prizes = [
      makePrize({ id: "common", weight: 900 }),
      makePrize({ id: "rare", weight: 100 }),
    ];

    const counts: Record<string, number> = { common: 0, rare: 0 };
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const result = selectPrize({
        tiers: [],
        prizes,
        pityRules: [],
        pityCounters: {},
        // Use actual random for statistical test
      });
      counts[result!.prizeId]++;
    }

    // Expected: common ≈ 90%, rare ≈ 10%
    // With 10k samples, allow 3% tolerance
    const commonPct = counts["common"]! / N;
    const rarePct = counts["rare"]! / N;
    expect(commonPct).toBeGreaterThan(0.87);
    expect(commonPct).toBeLessThan(0.93);
    expect(rarePct).toBeGreaterThan(0.07);
    expect(rarePct).toBeLessThan(0.13);
  });
});
