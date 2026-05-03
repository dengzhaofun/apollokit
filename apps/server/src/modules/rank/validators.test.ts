/**
 * Pure unit tests for rank/validators.ts — Zod only, no DB.
 */
import { describe, expect, test } from "vitest";

import {
  AdjustPlayerSchema,
  CreateSeasonSchema,
  CreateTierConfigSchema,
  SettleMatchBodySchema,
} from "./validators";

function baseTiers() {
  return [
    { alias: "bronze", name: "青铜", order: 0, minRankScore: 0, maxRankScore: 999, subtierCount: 3, starsPerSubtier: 5 },
    { alias: "silver", name: "白银", order: 1, minRankScore: 1000, maxRankScore: 1999, subtierCount: 3, starsPerSubtier: 5 },
    { alias: "gold", name: "黄金", order: 2, minRankScore: 2000, maxRankScore: null, subtierCount: 3, starsPerSubtier: 5 },
  ];
}

describe("CreateTierConfigSchema", () => {
  test("accepts a valid 3-tier config with Elo params", () => {
    const r = CreateTierConfigSchema.safeParse({
      alias: "classic_5v5",
      name: "经典 5v5",
      ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
      tiers: baseTiers(),
    });
    expect(r.success).toBe(true);
  });

  test("rejects duplicate tier order", () => {
    const tiers = baseTiers();
    tiers[1]!.order = 0;
    const r = CreateTierConfigSchema.safeParse({
      alias: "x",
      name: "x",
      ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
      tiers,
    });
    expect(r.success).toBe(false);
  });

  test("rejects overlapping rank-score ranges", () => {
    const tiers = baseTiers();
    tiers[0]!.maxRankScore = 1500; // overlaps with silver [1000, 1999]
    const r = CreateTierConfigSchema.safeParse({
      alias: "x",
      name: "x",
      ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
      tiers,
    });
    expect(r.success).toBe(false);
  });

  test("rejects null maxRankScore on a non-top tier", () => {
    const tiers = baseTiers();
    tiers[0]!.maxRankScore = null;
    const r = CreateTierConfigSchema.safeParse({
      alias: "x",
      name: "x",
      ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
      tiers,
    });
    expect(r.success).toBe(false);
  });

  test("rejects empty tiers array", () => {
    const r = CreateTierConfigSchema.safeParse({
      alias: "x",
      name: "x",
      ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
      tiers: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("CreateSeasonSchema", () => {
  test("rejects endAt <= startAt", () => {
    const r = CreateSeasonSchema.safeParse({
      alias: "s1",
      name: "Season 1",
      tierConfigId: "00000000-0000-4000-8000-000000000001",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  test("accepts valid date range", () => {
    const r = CreateSeasonSchema.safeParse({
      alias: "s1",
      name: "Season 1",
      tierConfigId: "00000000-0000-4000-8000-000000000001",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-04-01T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
});

describe("SettleMatchBodySchema", () => {
  test("requires tierConfigAlias or seasonId", () => {
    const r = SettleMatchBodySchema.safeParse({
      externalMatchId: "m1",
      participants: [
        { endUserId: "a", matchTeamId: "A", placement: 1, win: true },
        { endUserId: "b", matchTeamId: "B", placement: 2, win: false },
      ],
    });
    expect(r.success).toBe(false);
  });

  test("accepts with tierConfigAlias", () => {
    const r = SettleMatchBodySchema.safeParse({
      tierConfigAlias: "classic_5v5",
      externalMatchId: "m1",
      participants: [
        { endUserId: "a", matchTeamId: "A", placement: 1, win: true },
        { endUserId: "b", matchTeamId: "B", placement: 2, win: false },
      ],
    });
    expect(r.success).toBe(true);
  });

  test("rejects single-team participants (teams < 2)", () => {
    const r = SettleMatchBodySchema.safeParse({
      tierConfigAlias: "x",
      externalMatchId: "m1",
      participants: [
        { endUserId: "a", matchTeamId: "A", placement: 1, win: true },
        { endUserId: "b", matchTeamId: "A", placement: 2, win: false },
      ],
    });
    expect(r.success).toBe(false);
  });

  test("rejects duplicate endUserIds", () => {
    const r = SettleMatchBodySchema.safeParse({
      tierConfigAlias: "x",
      externalMatchId: "m1",
      participants: [
        { endUserId: "a", matchTeamId: "A", placement: 1, win: true },
        { endUserId: "a", matchTeamId: "B", placement: 2, win: false },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("AdjustPlayerSchema", () => {
  test("requires at least one adjustable field", () => {
    const r = AdjustPlayerSchema.safeParse({
      seasonId: "00000000-0000-4000-8000-000000000001",
      reason: "manual audit",
    });
    expect(r.success).toBe(false);
  });

  test("accepts partial patch with reason", () => {
    const r = AdjustPlayerSchema.safeParse({
      seasonId: "00000000-0000-4000-8000-000000000001",
      rankScore: 2000,
      reason: "restoring after exploit",
    });
    expect(r.success).toBe(true);
  });
});
