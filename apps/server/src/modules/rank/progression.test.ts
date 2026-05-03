/**
 * Pure unit tests for rank/progression.ts — no DB, no network.
 */
import { describe, expect, test } from "vitest";

import { applyDelta, type ApplyDeltaInput } from "./progression";
import type { RankPlayerState, RankTier } from "./types";

function tier(partial: Partial<RankTier> & Pick<RankTier, "id" | "order">): RankTier {
  return {
    id: partial.id,
    tierConfigId: "cfg",
    alias: partial.alias ?? `t${partial.order}`,
    name: partial.name ?? `Tier ${partial.order}`,
    order: partial.order,
    minRankScore: partial.minRankScore ?? partial.order * 1000,
    maxRankScore: partial.maxRankScore ?? (partial.order + 1) * 1000 - 1,
    subtierCount: partial.subtierCount ?? 3,
    starsPerSubtier: partial.starsPerSubtier ?? 5,
    protectionRules: partial.protectionRules ?? {},
    metadata: partial.metadata ?? null,
  } as RankTier;
}

function state(partial: Partial<RankPlayerState>): RankPlayerState {
  return {
    id: partial.id ?? "st",
    tenantId: partial.tenantId ?? "org",
    seasonId: partial.seasonId ?? "s1",
    endUserId: partial.endUserId ?? "u",
    tierId: partial.tierId ?? null,
    subtier: partial.subtier ?? 0,
    stars: partial.stars ?? 0,
    rankScore: partial.rankScore ?? 0,
    mmr: partial.mmr ?? 1000,
    mmrDeviation: partial.mmrDeviation ?? 350,
    mmrVolatility: partial.mmrVolatility ?? 0.06,
    winStreak: partial.winStreak ?? 0,
    lossStreak: partial.lossStreak ?? 0,
    protectionUses: (partial.protectionUses ?? {}) as Record<string, number>,
    matchesPlayed: partial.matchesPlayed ?? 0,
    wins: partial.wins ?? 0,
    losses: partial.losses ?? 0,
    lastMatchAt: partial.lastMatchAt ?? null,
    createdAt: partial.createdAt ?? new Date(),
    updatedAt: partial.updatedAt ?? new Date(),
  } as RankPlayerState;
}

function baseInput(overrides: Partial<ApplyDeltaInput>): ApplyDeltaInput {
  return {
    state: state({}),
    tiers: [tier({ id: "t0", order: 0 }), tier({ id: "t1", order: 1 }), tier({ id: "t2", order: 2 })],
    mmrBefore: 1000,
    mmrAfter: 1016,
    win: true,
    placement: 1,
    ...overrides,
  } as ApplyDeltaInput;
}

describe("progression: winning increases stars", () => {
  test("+1 star when winning within same subtier", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 1, stars: 2 }),
      }),
    );
    expect(out.tierId).toBe("t0");
    expect(out.subtier).toBe(1);
    expect(out.stars).toBe(3);
    expect(out.starsDelta).toBe(1);
    expect(out.promoted).toBe(false);
    expect(out.demoted).toBe(false);
  });

  test("cross-subtier: 4/5 stars win → next subtier, 0 stars", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 0, stars: 4 }),
      }),
    );
    expect(out.tierId).toBe("t0");
    expect(out.subtier).toBe(1);
    expect(out.stars).toBe(0);
    expect(out.promoted).toBe(false);
  });

  test("cross-tier promotion: top subtier max stars win → next tier 0/0", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 2, stars: 4 }),
      }),
    );
    expect(out.tierId).toBe("t1");
    expect(out.subtier).toBe(0);
    expect(out.stars).toBe(0);
    expect(out.promoted).toBe(true);
  });

  test("top-tier cap: max stars win → stays at top, stars capped", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t2", subtier: 2, stars: 4 }),
      }),
    );
    expect(out.tierId).toBe("t2");
    expect(out.subtier).toBe(2);
    expect(out.stars).toBe(5); // capped at starsPerSubtier
    expect(out.promoted).toBe(false);
  });
});

describe("progression: losing decreases stars", () => {
  test("-1 star within same subtier", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t1", subtier: 1, stars: 3 }),
        mmrAfter: 984,
        win: false,
      }),
    );
    expect(out.tierId).toBe("t1");
    expect(out.subtier).toBe(1);
    expect(out.stars).toBe(2);
    expect(out.demoted).toBe(false);
  });

  test("cross-subtier demotion: 0 stars lose → lower subtier, 4 stars", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t1", subtier: 1, stars: 0 }),
        mmrAfter: 984,
        win: false,
      }),
    );
    expect(out.subtier).toBe(0);
    expect(out.stars).toBe(4);
    expect(out.demoted).toBe(false);
  });

  test("cross-tier demotion: lowest subtier 0 stars lose without shield → previous tier", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t1", subtier: 0, stars: 0 }),
        mmrAfter: 984,
        win: false,
      }),
    );
    expect(out.tierId).toBe("t0");
    expect(out.subtier).toBe(2); // subtierCount-1 of t0
    expect(out.stars).toBe(4); // starsPerSubtier-1
    expect(out.demoted).toBe(true);
  });

  test("bottom-tier floor: can't go below order=0 / subtier=0 / stars=0", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 0, stars: 0 }),
        mmrAfter: 984,
        win: false,
      }),
    );
    expect(out.tierId).toBe("t0");
    expect(out.subtier).toBe(0);
    expect(out.stars).toBe(0);
    expect(out.demoted).toBe(false);
  });
});

describe("progression: protection shields", () => {
  test("demotionShield prevents tier drop and decrements", () => {
    const tiers = [
      tier({ id: "t0", order: 0 }),
      tier({
        id: "t1",
        order: 1,
        protectionRules: { demotionShieldMatches: 3 },
      }),
    ];
    const out = applyDelta({
      state: state({
        tierId: "t1",
        subtier: 0,
        stars: 0,
        protectionUses: { demotionShield: 2 } as Record<string, number>,
      }),
      tiers,
      mmrBefore: 1000,
      mmrAfter: 984,
      win: false,
      placement: 2,
    });
    expect(out.tierId).toBe("t1");
    expect(out.demoted).toBe(false);
    expect(out.protectionApplied).toEqual({ type: "demotionShield", remaining: 1 });
    expect(out.protectionUses.demotionShield).toBe(1);
  });

  test("bigDropShield kicks in after demotionShield exhausted", () => {
    const tiers = [tier({ id: "t0", order: 0 }), tier({ id: "t1", order: 1 })];
    const out = applyDelta({
      state: state({
        tierId: "t1",
        subtier: 0,
        stars: 0,
        protectionUses: { demotionShield: 0, bigDropShield: 1 } as Record<string, number>,
      }),
      tiers,
      mmrBefore: 1000,
      mmrAfter: 984,
      win: false,
      placement: 2,
    });
    expect(out.tierId).toBe("t1");
    expect(out.demoted).toBe(false);
    expect(out.protectionApplied?.type).toBe("bigDropShield");
    expect(out.protectionUses.bigDropShield).toBe(0);
  });

  test("promotion refills demotionShield per new tier's rule", () => {
    const tiers = [
      tier({ id: "t0", order: 0 }),
      tier({
        id: "t1",
        order: 1,
        protectionRules: { demotionShieldMatches: 2 },
      }),
    ];
    const out = applyDelta({
      state: state({ tierId: "t0", subtier: 2, stars: 4, protectionUses: {} as Record<string, number> }),
      tiers,
      mmrBefore: 1000,
      mmrAfter: 1016,
      win: true,
      placement: 1,
    });
    expect(out.tierId).toBe("t1");
    expect(out.promoted).toBe(true);
    expect(out.protectionUses.demotionShield).toBe(2);
  });
});

describe("progression: win streak bonus", () => {
  test("winStreak+1 >= threshold adds +1 star (so total +2)", () => {
    const tiers = [
      tier({
        id: "t0",
        order: 0,
        protectionRules: { winStreakBonusFrom: 3 },
      }),
    ];
    const out = applyDelta({
      state: state({ tierId: "t0", subtier: 0, stars: 0, winStreak: 2 }),
      tiers,
      mmrBefore: 1000,
      mmrAfter: 1016,
      win: true,
      placement: 1,
    });
    expect(out.starsDelta).toBe(2);
    expect(out.stars).toBe(2);
    expect(out.winStreak).toBe(3);
  });

  test("losing resets win streak", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 1, stars: 2, winStreak: 5 }),
        mmrAfter: 984,
        win: false,
      }),
    );
    expect(out.winStreak).toBe(0);
    expect(out.lossStreak).toBe(1);
  });
});

describe("progression: rankScore tracks MMR delta", () => {
  test("rankScore increments by round(mmrAfter - mmrBefore)", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 0, stars: 0, rankScore: 100 }),
        mmrBefore: 1000,
        mmrAfter: 1015.6,
      }),
    );
    expect(out.rankScore).toBe(116);
  });

  test("rankScore decreases on loss", () => {
    const out = applyDelta(
      baseInput({
        state: state({ tierId: "t0", subtier: 1, stars: 2, rankScore: 200 }),
        mmrBefore: 1000,
        mmrAfter: 983.4,
        win: false,
      }),
    );
    expect(out.rankScore).toBe(183);
  });
});
