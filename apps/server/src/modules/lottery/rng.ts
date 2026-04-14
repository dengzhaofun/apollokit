/**
 * Pure functions for weighted random selection and pity mechanics.
 *
 * No IO, no DB — these are deterministic given a random float.
 * Isolated for unit testing and statistical verification.
 */

import type { LotteryPityRule, LotteryPrize, LotteryTier } from "./types";

/**
 * Generate a cryptographically secure random float in [0, 1).
 * Uses crypto.getRandomValues (available in Workers and Node 19+).
 */
export function cryptoRandomFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 0x100000000;
}

export type WeightedItem = { id: string; effectiveWeight: number };

/**
 * Pick one item from a weighted list using a pre-generated random float.
 * Returns the selected item's id, or null if items is empty.
 */
export function weightedSelect(
  items: WeightedItem[],
  randomFloat: number,
): string | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, i) => sum + i.effectiveWeight, 0);
  if (totalWeight <= 0) return null;

  const roll = randomFloat * totalWeight;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.effectiveWeight;
    if (roll < cumulative) return item.id;
  }
  // Floating-point edge case — return last item
  return items[items.length - 1]!.id;
}

/**
 * Compute effective weights for tiers, applying soft pity boosts.
 */
export function computeTierWeights(
  tiers: LotteryTier[],
  pityRules: LotteryPityRule[],
  pityCounters: Record<string, number>,
): WeightedItem[] {
  return tiers
    .filter((t) => t.isActive)
    .map((tier) => {
      let effectiveWeight = tier.baseWeight;

      // Apply soft pity boost for rules targeting this tier
      for (const rule of pityRules) {
        if (!rule.isActive) continue;
        if (rule.guaranteeTierId !== tier.id) continue;

        const counter = pityCounters[rule.id] ?? 0;
        if (
          rule.softPityStartAt != null &&
          rule.softPityWeightIncrement != null &&
          counter >= rule.softPityStartAt
        ) {
          const pullsOver = counter - rule.softPityStartAt + 1;
          effectiveWeight += rule.softPityWeightIncrement * pullsOver;
        }
      }

      return { id: tier.id, effectiveWeight };
    });
}

/**
 * Compute effective weights for prizes (within a tier or flat mode).
 * Filters out inactive prizes and stock-depleted prizes.
 */
export function computePrizeWeights(
  prizes: LotteryPrize[],
  excludeIds?: Set<string>,
): WeightedItem[] {
  return prizes
    .filter((p) => {
      if (!p.isActive) return false;
      if (excludeIds?.has(p.id)) return false;
      // Exclude stock-depleted prizes (check is advisory — actual claim
      // is atomic in DB. This just avoids repeatedly selecting depleted
      // prizes during the in-memory selection loop.)
      if (
        p.globalStockLimit != null &&
        p.globalStockUsed >= p.globalStockLimit
      ) {
        return false;
      }
      return true;
    })
    .map((p) => ({
      id: p.id,
      effectiveWeight: p.weight + (p.isRateUp ? p.rateUpWeight : 0),
    }));
}

/**
 * Check if any hard pity threshold is reached and return the forced tier id.
 * Returns null if no hard pity triggers.
 */
export function checkHardPity(
  pityRules: LotteryPityRule[],
  pityCounters: Record<string, number>,
): string | null {
  for (const rule of pityRules) {
    if (!rule.isActive) continue;
    const counter = pityCounters[rule.id] ?? 0;
    // At threshold - 1, the NEXT pull (this one) is the guaranteed pull
    if (counter >= rule.hardPityThreshold - 1) {
      return rule.guaranteeTierId;
    }
  }
  return null;
}

/**
 * Update pity counters after a pull that resulted in the given tier.
 * - Rules targeting the won tier (or a lower-priority tier): reset to 0
 * - All other rules: increment by 1
 *
 * For flat-mode pools (no tiers), wonTierId is null and all counters increment.
 */
export function updatePityCounters(
  pityRules: LotteryPityRule[],
  currentCounters: Record<string, number>,
  wonTierId: string | null,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const rule of pityRules) {
    if (!rule.isActive) continue;
    const current = currentCounters[rule.id] ?? 0;
    if (wonTierId != null && rule.guaranteeTierId === wonTierId) {
      // Won the guaranteed tier — reset this counter
      next[rule.id] = 0;
    } else {
      next[rule.id] = current + 1;
    }
  }
  return next;
}

export type SelectionResult = {
  tierId: string | null;
  tierName: string | null;
  prizeId: string;
  pityTriggered: boolean;
  pityRuleId: string | null;
};

/**
 * Run the full selection algorithm for a single pull.
 *
 * Flat mode (no tiers): direct weighted selection from all prizes.
 * Tiered mode: tier selection (with pity) → prize selection within tier.
 *
 * Returns the selection result (no side effects, no DB).
 * Caller must handle stock claiming and fallback logic.
 */
export function selectPrize(params: {
  tiers: LotteryTier[];
  prizes: LotteryPrize[];
  pityRules: LotteryPityRule[];
  pityCounters: Record<string, number>;
  excludePrizeIds?: Set<string>;
  rng?: () => number;
}): SelectionResult | null {
  const {
    tiers,
    prizes,
    pityRules,
    pityCounters,
    excludePrizeIds,
    rng = cryptoRandomFloat,
  } = params;

  const activeTiers = tiers.filter((t) => t.isActive);
  const isFlatMode = activeTiers.length === 0;

  if (isFlatMode) {
    // Flat mode — direct weighted selection
    const weightedPrizes = computePrizeWeights(prizes, excludePrizeIds);
    const prizeId = weightedSelect(weightedPrizes, rng());
    if (!prizeId) return null;

    return {
      tierId: null,
      tierName: null,
      prizeId,
      pityTriggered: false,
      pityRuleId: null,
    };
  }

  // Tiered mode — check pity, select tier, then select prize within tier
  let selectedTierId: string | null = null;
  let pityTriggered = false;
  let triggeredPityRuleId: string | null = null;

  // Step 1: Check hard pity
  const forcedTierId = checkHardPity(pityRules, pityCounters);
  if (forcedTierId) {
    selectedTierId = forcedTierId;
    pityTriggered = true;
    // Find which rule triggered
    for (const rule of pityRules) {
      if (
        rule.isActive &&
        rule.guaranteeTierId === forcedTierId &&
        (pityCounters[rule.id] ?? 0) >= rule.hardPityThreshold - 1
      ) {
        triggeredPityRuleId = rule.id;
        break;
      }
    }
  }

  // Step 2: Weighted tier selection (with soft pity boost)
  if (!selectedTierId) {
    const tierWeights = computeTierWeights(activeTiers, pityRules, pityCounters);
    selectedTierId = weightedSelect(tierWeights, rng());
    if (!selectedTierId) return null;
  }

  const selectedTier = activeTiers.find((t) => t.id === selectedTierId);
  if (!selectedTier) return null;

  // Step 3: Select prize within tier
  const tierPrizes = prizes.filter((p) => p.tierId === selectedTierId);
  const weightedPrizes = computePrizeWeights(tierPrizes, excludePrizeIds);
  const prizeId = weightedSelect(weightedPrizes, rng());
  if (!prizeId) return null;

  return {
    tierId: selectedTierId,
    tierName: selectedTier.name,
    prizeId,
    pityTriggered,
    pityRuleId: triggeredPityRuleId,
  };
}
