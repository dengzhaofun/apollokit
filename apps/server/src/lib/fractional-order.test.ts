/**
 * Pure unit tests for the fractional-order helper module.
 *
 * Database-touching paths (`appendKey`, `prependKey`, `resolveMoveKey`)
 * are covered indirectly by per-module service tests that exercise
 * create / move flows against a real Postgres. Here we cover the wire
 * schemas and the deterministic key-math wrappers.
 */
import { describe, expect, test } from "vitest";

import {
  FractionalKeySchema,
  MoveBodySchema,
  keyBetween,
  nKeysBetween,
} from "./fractional-order";

describe("MoveBodySchema", () => {
  test("accepts { before }", () => {
    const r = MoveBodySchema.safeParse({ before: "abc" });
    expect(r.success).toBe(true);
  });

  test("accepts { after }", () => {
    const r = MoveBodySchema.safeParse({ after: "abc" });
    expect(r.success).toBe(true);
  });

  test("accepts { position: first | last }", () => {
    expect(MoveBodySchema.safeParse({ position: "first" }).success).toBe(true);
    expect(MoveBodySchema.safeParse({ position: "last" }).success).toBe(true);
  });

  test("rejects empty object", () => {
    expect(MoveBodySchema.safeParse({}).success).toBe(false);
  });

  test("rejects unknown position values", () => {
    expect(MoveBodySchema.safeParse({ position: "middle" }).success).toBe(false);
  });

  test("rejects empty before/after id", () => {
    expect(MoveBodySchema.safeParse({ before: "" }).success).toBe(false);
    expect(MoveBodySchema.safeParse({ after: "" }).success).toBe(false);
  });
});

describe("FractionalKeySchema", () => {
  test("accepts base62 strings", () => {
    expect(FractionalKeySchema.safeParse("a0").success).toBe(true);
    expect(FractionalKeySchema.safeParse("Zz9").success).toBe(true);
    expect(FractionalKeySchema.safeParse("a0V").success).toBe(true);
  });

  test("rejects empty string", () => {
    expect(FractionalKeySchema.safeParse("").success).toBe(false);
  });

  test("rejects non-base62 characters", () => {
    expect(FractionalKeySchema.safeParse("a-0").success).toBe(false);
    expect(FractionalKeySchema.safeParse("a 0").success).toBe(false);
    expect(FractionalKeySchema.safeParse("a/0").success).toBe(false);
  });
});

describe("keyBetween", () => {
  test("returns a key strictly between two existing keys", () => {
    const k = keyBetween("a0", "a1");
    expect(k > "a0").toBe(true);
    expect(k < "a1").toBe(true);
  });

  test("null/null produces a stable initial key", () => {
    expect(keyBetween(null, null)).toBe("a0");
  });

  test("null/key gives something less than key (prepend)", () => {
    const k = keyBetween(null, "a0");
    expect(k < "a0").toBe(true);
  });

  test("key/null gives something greater than key (append)", () => {
    const k = keyBetween("a0", null);
    expect(k > "a0").toBe(true);
  });

  test("repeated insertion preserves lex order", () => {
    const lo: string | null = null;
    const hi: string | null = null;
    const middle = keyBetween(lo, hi); // "a0"
    const left = keyBetween(lo, middle);
    const right = keyBetween(middle, hi);
    expect(left < middle).toBe(true);
    expect(middle < right).toBe(true);
  });
});

describe("nKeysBetween", () => {
  test("returns 0 keys for n=0", () => {
    expect(nKeysBetween(null, null, 0)).toEqual([]);
  });

  test("returns 1 key matching keyBetween for n=1", () => {
    const [k] = nKeysBetween(null, null, 1);
    expect(k).toBe("a0");
  });

  test("returns N strictly increasing keys", () => {
    const keys = nKeysBetween(null, null, 5);
    expect(keys.length).toBe(5);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  test("respects bounded range", () => {
    const keys = nKeysBetween("a0", "a5", 3);
    expect(keys.length).toBe(3);
    expect(keys[0]! > "a0").toBe(true);
    expect(keys[keys.length - 1]! < "a5").toBe(true);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });
});
