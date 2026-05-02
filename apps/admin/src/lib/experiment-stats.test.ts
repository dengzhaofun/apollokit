import { describe, expect, test } from "vitest"

import {
  compareProportions,
  detectSRM,
  normalCDF,
  twoSidedPValue,
  wilsonInterval,
} from "./experiment-stats"

describe("experiment-stats", () => {
  // ─── erfc / normalCDF sanity ──────────────────────────────────

  test("normalCDF matches textbook values", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 4)
    expect(normalCDF(1)).toBeCloseTo(0.8413, 4)
    expect(normalCDF(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCDF(-1.96)).toBeCloseTo(0.025, 3)
    expect(normalCDF(2.5758)).toBeCloseTo(0.995, 3)
  })

  test("two-sided p-value: z=1.96 → ~0.05", () => {
    expect(twoSidedPValue(1.96)).toBeCloseTo(0.05, 2)
    expect(twoSidedPValue(2.5758)).toBeCloseTo(0.01, 2)
    expect(twoSidedPValue(0)).toBeCloseTo(1, 4)
  })

  // ─── Wilson interval ──────────────────────────────────────────

  test("Wilson interval Wikipedia example: 5/10 → ~[0.237, 0.763]", () => {
    const w = wilsonInterval(5, 10)
    expect(w.rate).toBeCloseTo(0.5, 4)
    expect(w.lower).toBeCloseTo(0.237, 2)
    expect(w.upper).toBeCloseTo(0.763, 2)
  })

  test("Wilson interval handles 0 successes (lower bound = 0)", () => {
    const w = wilsonInterval(0, 100)
    expect(w.rate).toBe(0)
    expect(w.lower).toBe(0)
    expect(w.upper).toBeGreaterThan(0)
  })

  test("Wilson interval handles all successes (upper ≈ 1)", () => {
    const w = wilsonInterval(100, 100)
    expect(w.rate).toBe(1)
    expect(w.upper).toBeCloseTo(1, 10)
    expect(w.lower).toBeLessThan(1)
  })

  test("Wilson interval handles total=0 (NaN, no throw)", () => {
    const w = wilsonInterval(0, 0)
    expect(Number.isNaN(w.rate)).toBe(true)
    expect(Number.isNaN(w.lower)).toBe(true)
    expect(Number.isNaN(w.upper)).toBe(true)
  })

  // ─── Two-proportion z-test ────────────────────────────────────

  test("compareProportions: 12/100 vs 18/100 → not significant", () => {
    // Small sample, modest lift. Hand computation: z ≈ 1.21, p ≈ 0.226
    const r = compareProportions(12, 100, 18, 100)
    expect(r.controlRate).toBeCloseTo(0.12, 4)
    expect(r.variantRate).toBeCloseTo(0.18, 4)
    expect(r.liftPp).toBeCloseTo(6, 4)
    expect(r.pValue).not.toBeNull()
    expect(r.pValue!).toBeGreaterThan(0.1)
    expect(r.significant).toBe(false)
  })

  test("compareProportions: 1200/10000 vs 1800/10000 → strongly significant", () => {
    // Same percentages, 100× sample. p << 0.001
    const r = compareProportions(1200, 10000, 1800, 10000)
    expect(r.liftPp).toBeCloseTo(6, 4)
    expect(r.pValue).not.toBeNull()
    expect(r.pValue!).toBeLessThan(0.001)
    expect(r.significant).toBe(true)
  })

  test("compareProportions: zero/empty groups handled", () => {
    const r = compareProportions(0, 0, 5, 100)
    expect(r.pValue).toBeNull()
    expect(r.significant).toBe(false)
  })

  test("compareProportions: identical rates → p≈1, not significant", () => {
    const r = compareProportions(100, 1000, 100, 1000)
    expect(r.liftPp).toBeCloseTo(0, 4)
    expect(r.pValue).not.toBeNull()
    expect(r.pValue!).toBeGreaterThan(0.99)
    expect(r.significant).toBe(false)
  })

  // ─── SRM detection ───────────────────────────────────────────

  test("SRM: 50/50 expected, 5050/4950 observed → no mismatch", () => {
    // Tiny imbalance, p ~ 0.32 → no flag
    const r = detectSRM({ control: 5050, A: 4950 }, { control: 5000, A: 5000 })
    expect(r.mismatch).toBe(false)
    expect(r.pValue).toBeGreaterThan(0.1)
  })

  test("SRM: 50/50 expected, 5500/4500 observed → flag", () => {
    // 10% imbalance at 10000 total — chi² ≈ 100 → p ≈ 0
    const r = detectSRM({ control: 5500, A: 4500 }, { control: 5000, A: 5000 })
    expect(r.mismatch).toBe(true)
    expect(r.pValue).toBeLessThan(0.001)
  })

  test("SRM: 3-way perfectly proportional → no mismatch", () => {
    const r = detectSRM(
      { control: 5000, A: 2500, B: 2500 },
      { control: 5000, A: 2500, B: 2500 },
    )
    expect(r.mismatch).toBe(false)
    expect(r.chiSquare).toBe(0)
  })
})
