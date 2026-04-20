/**
 * Pure unit tests for rank/rating.ts — no DB, no network.
 * Run with `pnpm --filter=server test src/modules/rank/rating.test.ts`.
 */
import { describe, expect, test } from "vitest";

import { createEloStrategy, type RatingInput } from "./rating";

function makeInput(overrides: Partial<RatingInput> & Pick<RatingInput, "endUserId" | "teamId" | "placement" | "win">): RatingInput {
  return {
    mmrBefore: 1000,
    mmrDeviation: 350,
    mmrVolatility: 0.06,
    performanceScore: null,
    ...overrides,
  };
}

describe("elo: two-player 1v1", () => {
  const elo = createEloStrategy();

  test("equal ratings: winner +K/2, loser -K/2", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "A", teamId: "a", placement: 1, win: true }),
        makeInput({ endUserId: "B", teamId: "b", placement: 2, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const a = out.find((r) => r.endUserId === "A")!;
    const b = out.find((r) => r.endUserId === "B")!;
    expect(a.mmrAfter).toBeCloseTo(1016, 5);
    expect(b.mmrAfter).toBeCloseTo(984, 5);
    // 对称性
    expect(a.mmrAfter - 1000).toBeCloseTo(-(b.mmrAfter - 1000), 5);
  });

  test("huge rating gap: upset gives big delta, expected win gives tiny delta", () => {
    const outUpset = createEloStrategy().compute({
      participants: [
        makeInput({ endUserId: "Low", teamId: "l", placement: 1, win: true, mmrBefore: 800 }),
        makeInput({ endUserId: "High", teamId: "h", placement: 2, win: false, mmrBefore: 1600 }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const lowDelta = outUpset.find((r) => r.endUserId === "Low")!.mmrAfter - 800;
    expect(lowDelta).toBeGreaterThan(25); // 低分赢高分：接近 K

    const outExpected = createEloStrategy().compute({
      participants: [
        makeInput({ endUserId: "HighWin", teamId: "h", placement: 1, win: true, mmrBefore: 1600 }),
        makeInput({ endUserId: "LowLose", teamId: "l", placement: 2, win: false, mmrBefore: 800 }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const highDelta = outExpected.find((r) => r.endUserId === "HighWin")!.mmrAfter - 1600;
    expect(highDelta).toBeGreaterThan(0);
    expect(highDelta).toBeLessThan(5); // 高分赢低分：delta 很小
  });

  test("draw (both win=false): each side gets 0 delta when ratings equal", () => {
    const out = createEloStrategy().compute({
      participants: [
        makeInput({ endUserId: "A", teamId: "a", placement: 1, win: false }),
        makeInput({ endUserId: "B", teamId: "b", placement: 1, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const a = out.find((r) => r.endUserId === "A")!;
    const b = out.find((r) => r.endUserId === "B")!;
    expect(a.mmrAfter).toBeCloseTo(1000, 5);
    expect(b.mmrAfter).toBeCloseTo(1000, 5);
  });
});

describe("elo: team 3v3", () => {
  const elo = createEloStrategy();

  test("average-team-elo: all winners get same delta when teammates equal", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "A1", teamId: "A", placement: 1, win: true }),
        makeInput({ endUserId: "A2", teamId: "A", placement: 1, win: true }),
        makeInput({ endUserId: "A3", teamId: "A", placement: 1, win: true }),
        makeInput({ endUserId: "B1", teamId: "B", placement: 2, win: false }),
        makeInput({ endUserId: "B2", teamId: "B", placement: 2, win: false }),
        makeInput({ endUserId: "B3", teamId: "B", placement: 2, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const aDeltas = ["A1", "A2", "A3"].map(
      (id) => out.find((r) => r.endUserId === id)!.mmrAfter - 1000,
    );
    const bDeltas = ["B1", "B2", "B3"].map(
      (id) => out.find((r) => r.endUserId === id)!.mmrAfter - 1000,
    );
    expect(new Set(aDeltas).size).toBe(1); // 同队共用 delta
    expect(new Set(bDeltas).size).toBe(1);
    expect(aDeltas[0]).toBeCloseTo(-bDeltas[0]!, 5); // 对称性
    expect(aDeltas[0]!).toBeGreaterThan(0);
  });

  test("zero-sum: total delta across all players is 0 (equal ratings)", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "A1", teamId: "A", placement: 1, win: true }),
        makeInput({ endUserId: "A2", teamId: "A", placement: 1, win: true }),
        makeInput({ endUserId: "B1", teamId: "B", placement: 2, win: false }),
        makeInput({ endUserId: "B2", teamId: "B", placement: 2, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const totalDelta = out.reduce((s, r) => s + (r.mmrAfter - 1000), 0);
    expect(totalDelta).toBeCloseTo(0, 5);
  });
});

describe("elo: multi-team FFA", () => {
  const elo = createEloStrategy();

  test("4-team FFA: top team gets most, bottom gets least", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "1st", teamId: "T1", placement: 1, win: true }),
        makeInput({ endUserId: "2nd", teamId: "T2", placement: 2, win: false }),
        makeInput({ endUserId: "3rd", teamId: "T3", placement: 3, win: false }),
        makeInput({ endUserId: "4th", teamId: "T4", placement: 4, win: false }),
      ],
      teamCount: 4,
      params: { strategy: "elo", baseK: 32 },
    });
    const d1 = out.find((r) => r.endUserId === "1st")!.mmrAfter - 1000;
    const d4 = out.find((r) => r.endUserId === "4th")!.mmrAfter - 1000;
    expect(d1).toBeGreaterThan(0);
    expect(d4).toBeLessThan(0);
    expect(d1).toBeGreaterThan(d4);
  });

  test("sum of deltas ≈ 0 (balanced ratings)", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "1st", teamId: "T1", placement: 1, win: true }),
        makeInput({ endUserId: "2nd", teamId: "T2", placement: 2, win: false }),
        makeInput({ endUserId: "3rd", teamId: "T3", placement: 3, win: false }),
        makeInput({ endUserId: "4th", teamId: "T4", placement: 4, win: false }),
      ],
      teamCount: 4,
      params: { strategy: "elo", baseK: 32 },
    });
    const total = out.reduce((s, r) => s + (r.mmrAfter - 1000), 0);
    expect(total).toBeCloseTo(0, 3);
  });
});

describe("elo: performance score modulates delta", () => {
  test("high performanceScore adds bonus on top of win delta", () => {
    const elo = createEloStrategy();
    const baseline = elo.compute({
      participants: [
        makeInput({ endUserId: "A", teamId: "a", placement: 1, win: true }),
        makeInput({ endUserId: "B", teamId: "b", placement: 2, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });

    const withPerf = elo.compute({
      participants: [
        makeInput({
          endUserId: "A",
          teamId: "a",
          placement: 1,
          win: true,
          performanceScore: 1,
        }),
        makeInput({
          endUserId: "B",
          teamId: "b",
          placement: 2,
          win: false,
          performanceScore: 0,
        }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32, perfWeight: 0.5 },
    });

    const aBase = baseline.find((r) => r.endUserId === "A")!.mmrAfter - 1000;
    const aPerf = withPerf.find((r) => r.endUserId === "A")!.mmrAfter - 1000;
    expect(aPerf).toBeGreaterThan(aBase);
    // delta 被裁剪到 [-K, +K]
    expect(aPerf).toBeLessThanOrEqual(32);
  });
});

describe("elo: defensive behavior", () => {
  const elo = createEloStrategy();

  test("single participant / single team: returns mmr unchanged", () => {
    const out = elo.compute({
      participants: [
        makeInput({ endUserId: "Solo", teamId: "a", placement: 1, win: true }),
      ],
      teamCount: 1,
      params: { strategy: "elo", baseK: 32 },
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.mmrAfter).toBe(1000);
  });

  test("mmr deviation / volatility pass through unchanged", () => {
    const out = elo.compute({
      participants: [
        makeInput({
          endUserId: "A",
          teamId: "a",
          placement: 1,
          win: true,
          mmrDeviation: 180,
          mmrVolatility: 0.04,
        }),
        makeInput({ endUserId: "B", teamId: "b", placement: 2, win: false }),
      ],
      teamCount: 2,
      params: { strategy: "elo", baseK: 32 },
    });
    const a = out.find((r) => r.endUserId === "A")!;
    expect(a.mmrDeviationAfter).toBe(180);
    expect(a.mmrVolatilityAfter).toBe(0.04);
  });
});
