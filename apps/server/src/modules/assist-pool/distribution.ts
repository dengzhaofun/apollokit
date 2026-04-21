/**
 * Pure functions that compute a single assist contribution amount
 * given a policy, the instance target, and the current remaining work.
 *
 * Kept out of `service.ts` so they can be unit-tested without any db
 * or deps plumbing. RNG is injected as a `() => number` so tests can
 * seed it (use `createSeededRng(seed)` for deterministic runs).
 */

import type { AssistContributionPolicy } from "../../schema/assist-pool";

import type { AssistPoolMode } from "./types";

export type Rng = () => number;

/**
 * Mulberry32 — tiny 32-bit PRNG. Good enough for tests and for adding
 * run-to-run jitter on the decaying policy. Not cryptographic.
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randIntInclusive(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * `remaining` is how much work is LEFT before completion, regardless
 * of `mode`:
 *   - decrement mode: remaining = instance.remaining (counts down)
 *   - accumulate mode: remaining = target - instance.remaining (also counts down)
 *
 * The caller is responsible for that translation so the policy can be
 * written in one direction. Returned amount is always positive and
 * clamped to `[1, remaining]` so the instance cannot overshoot.
 */
export function computeContribution(
  policy: AssistContributionPolicy,
  remaining: number,
  target: number,
  rng: Rng = Math.random,
): number {
  if (remaining <= 0) return 0;

  let raw: number;
  switch (policy.kind) {
    case "fixed":
      raw = policy.amount;
      break;
    case "uniform":
      raw = randIntInclusive(rng, policy.min, policy.max);
      break;
    case "decaying": {
      // Tail throttle — matches the 砍一刀 psychology. Once the user
      // is within `tailRatio` of completion, force a tiny drip.
      const tailGate = Math.max(1, Math.floor(policy.tailRatio * target));
      if (remaining <= tailGate) {
        raw = policy.tailFloor;
      } else {
        // Head/mid: jitter around `base` uniformly in [base/2, base*3/2],
        // rounded. Integer math only — the whole module stays in BIGINTs.
        const lo = Math.max(1, Math.floor(policy.base / 2));
        const hi = Math.max(lo, Math.floor((policy.base * 3) / 2));
        raw = randIntInclusive(rng, lo, hi);
      }
      break;
    }
    default: {
      const exhaustive: never = policy;
      throw new Error(`unknown assist policy: ${JSON.stringify(exhaustive)}`);
    }
  }

  const clamped = Math.max(1, Math.min(raw, remaining));
  return clamped;
}

/**
 * Translate the instance's `remaining` field (whose semantics depend
 * on `mode`) into the unified "work left" number the policy expects.
 */
export function workLeft(
  mode: AssistPoolMode,
  remaining: number,
  target: number,
): number {
  return mode === "decrement" ? remaining : target - remaining;
}

/** Apply a contribution to an instance's `remaining` field. */
export function applyContribution(
  mode: AssistPoolMode,
  remaining: number,
  amount: number,
): number {
  return mode === "decrement" ? remaining - amount : remaining + amount;
}

/** Detect whether `remaining` (mode-aware) reached the completion gate. */
export function isComplete(
  mode: AssistPoolMode,
  remaining: number,
  target: number,
): boolean {
  return mode === "decrement" ? remaining <= 0 : remaining >= target;
}
