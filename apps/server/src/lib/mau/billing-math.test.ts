import { describe, expect, test } from "vitest";

import { computeOverage } from "./billing-math";

describe("computeOverage", () => {
  test("under quota → zero overage", () => {
    expect(computeOverage(50, 100, 100)).toEqual({
      overage: 0,
      overageUnitsPer1k: 0,
      projectedOverageCents: 0,
    });
  });

  test("at quota → zero overage", () => {
    expect(computeOverage(100, 100, 100)).toEqual({
      overage: 0,
      overageUnitsPer1k: 0,
      projectedOverageCents: 0,
    });
  });

  test("1 over quota → 1k chunk billed (industry rounding)", () => {
    expect(computeOverage(101, 100, 50)).toEqual({
      overage: 1,
      overageUnitsPer1k: 1,
      projectedOverageCents: 50,
    });
  });

  test("1000 over quota → still 1 chunk", () => {
    expect(computeOverage(1100, 100, 50)).toEqual({
      overage: 1000,
      overageUnitsPer1k: 1,
      projectedOverageCents: 50,
    });
  });

  test("1001 over quota → 2 chunks", () => {
    expect(computeOverage(1101, 100, 50)).toEqual({
      overage: 1001,
      overageUnitsPer1k: 2,
      projectedOverageCents: 100,
    });
  });

  test("price * units multiplies cleanly with no fp drift", () => {
    const r = computeOverage(50_500, 100, 33);
    expect(r.overage).toBe(50_400);
    expect(r.overageUnitsPer1k).toBe(51);
    expect(r.projectedOverageCents).toBe(51 * 33);
  });

  test("zero quota = everyone counts as overage", () => {
    expect(computeOverage(5, 0, 100)).toEqual({
      overage: 5,
      overageUnitsPer1k: 1,
      projectedOverageCents: 100,
    });
  });
});
