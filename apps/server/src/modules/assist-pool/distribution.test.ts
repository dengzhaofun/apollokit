/**
 * Pure-function tests for the contribution distribution. Run in plain
 * Node — no db, no deps plumbing. RNG is seeded for determinism.
 */
import { describe, expect, test } from "vitest";

import {
  applyContribution,
  computeContribution,
  createSeededRng,
  isComplete,
  workLeft,
} from "./distribution";

describe("computeContribution", () => {
  test("fixed policy returns the configured amount (clamped to remaining)", () => {
    const rng = createSeededRng(1);
    expect(
      computeContribution({ kind: "fixed", amount: 10 }, 100, 100, rng),
    ).toBe(10);
    // Clamp to remaining on the last step
    expect(computeContribution({ kind: "fixed", amount: 10 }, 3, 100, rng)).toBe(
      3,
    );
  });

  test("uniform policy stays inside [min, max]", () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 200; i++) {
      const v = computeContribution(
        { kind: "uniform", min: 5, max: 20 },
        1000,
        1000,
        rng,
      );
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  test("decaying policy throttles in the tail region", () => {
    const policy = {
      kind: "decaying" as const,
      base: 40,
      tailRatio: 0.05,
      tailFloor: 1,
    };
    const rng = createSeededRng(7);
    const target = 1000;

    // Head region: contributions are large (around base).
    const head = computeContribution(policy, 900, target, rng);
    expect(head).toBeGreaterThanOrEqual(Math.floor(policy.base / 2));

    // Tail region (remaining <= 5% of target): contributions clamped.
    const tail = computeContribution(policy, 30, target, rng);
    expect(tail).toBe(policy.tailFloor);
  });

  test("returns 0 when nothing is left", () => {
    const rng = createSeededRng(1);
    expect(
      computeContribution({ kind: "fixed", amount: 10 }, 0, 100, rng),
    ).toBe(0);
    expect(
      computeContribution({ kind: "fixed", amount: 10 }, -5, 100, rng),
    ).toBe(0);
  });

  test("never overshoots the remaining amount", () => {
    const rng = createSeededRng(99);
    for (const remaining of [1, 2, 3, 7]) {
      const v = computeContribution(
        { kind: "uniform", min: 50, max: 100 },
        remaining,
        1000,
        rng,
      );
      expect(v).toBeLessThanOrEqual(remaining);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("workLeft / applyContribution / isComplete", () => {
  test("decrement mode counts down and completes at 0", () => {
    expect(workLeft("decrement", 100, 100)).toBe(100);
    expect(workLeft("decrement", 30, 100)).toBe(30);
    expect(applyContribution("decrement", 100, 30)).toBe(70);
    expect(isComplete("decrement", 0, 100)).toBe(true);
    expect(isComplete("decrement", -5, 100)).toBe(true);
    expect(isComplete("decrement", 1, 100)).toBe(false);
  });

  test("accumulate mode counts up and completes at target", () => {
    expect(workLeft("accumulate", 0, 100)).toBe(100);
    expect(workLeft("accumulate", 70, 100)).toBe(30);
    expect(applyContribution("accumulate", 0, 30)).toBe(30);
    expect(isComplete("accumulate", 100, 100)).toBe(true);
    expect(isComplete("accumulate", 101, 100)).toBe(true);
    expect(isComplete("accumulate", 99, 100)).toBe(false);
  });
});
