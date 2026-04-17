import { describe, expect, test } from "vitest";

import { projectInterest } from "./interest";

describe("projectInterest", () => {
  test("0 for zero principal, rate, or period", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-02-01T00:00:00Z");
    expect(projectInterest(0, 500, 365, a, b)).toBe(0);
    expect(projectInterest(100, 0, 365, a, b)).toBe(0);
    expect(projectInterest(100, 500, 0, a, b)).toBe(0);
  });

  test("0 when to is before or equal from", () => {
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2025-12-01T00:00:00Z");
    expect(projectInterest(1000, 500, 365, a, b)).toBe(0);
    expect(projectInterest(1000, 500, 365, a, a)).toBe(0);
  });

  test("one full period at a whole rate", () => {
    // 1000 @ 10% / 365d, held for exactly 365 days = 100 interest.
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2027-01-01T00:00:00Z");
    expect(projectInterest(1000, 1000, 365, from, to)).toBe(100);
  });

  test("half period ≈ half rate", () => {
    // 1000 @ 10%/year, held half a year ≈ 50 (plus leap-day fraction).
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-07-02T00:00:00Z"); // ~ 182 days
    const got = projectInterest(1000, 1000, 365, from, to);
    expect(got).toBeGreaterThanOrEqual(49);
    expect(got).toBeLessThanOrEqual(51);
  });

  test("floors down small values", () => {
    // 100 @ 1% over 365d, held 1 day → 100 * 100 / 10000 * 1/365 ≈ 0.0027
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-02T00:00:00Z");
    expect(projectInterest(100, 100, 365, from, to)).toBe(0);
  });

  test("basis points honored", () => {
    // 1000 @ 1 bp (0.01%) / 365d, held 365d → 0 (rounds down from 0.1)
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2027-01-01T00:00:00Z");
    expect(projectInterest(1000, 1, 365, from, to)).toBe(0);
    // 10000 @ 1 bp / 365d, held 365d → 1
    expect(projectInterest(10000, 1, 365, from, to)).toBe(1);
  });
});
