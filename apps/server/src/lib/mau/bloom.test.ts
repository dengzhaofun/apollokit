import { describe, expect, test } from "vitest";

import {
  BLOOM_BITS,
  BLOOM_BYTES,
  HASH_COUNT,
  bloomCheck,
  bloomKey,
  bloomSet,
  hashPositions,
} from "./bloom";

describe("mau bloom filter", () => {
  test("constants are self-consistent", () => {
    expect(BLOOM_BYTES * 8).toBe(BLOOM_BITS);
    expect(HASH_COUNT).toBeGreaterThanOrEqual(2);
  });

  test("bloomKey is stable and namespaced", () => {
    expect(bloomKey("team_abc", "2026-05")).toBe("mau:bloom:team_abc:2026-05");
  });

  test("hashPositions returns deterministic in-range positions", async () => {
    const a = await hashPositions("eu_player_42");
    const b = await hashPositions("eu_player_42");
    expect(a).toEqual(b);
    expect(a).toHaveLength(HASH_COUNT);
    for (const pos of a) {
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(BLOOM_BITS);
    }
  });

  test("hashPositions distinguishes different inputs", async () => {
    const a = await hashPositions("eu_a");
    const b = await hashPositions("eu_b");
    // Tiny chance of identical positions for distinct inputs (≈3 in 16k³),
    // so we assert "not all identical" rather than "all distinct".
    expect(a.join(",") === b.join(",")).toBe(false);
  });

  test("bloomCheck returns false on null / wrong-size buffers", () => {
    expect(bloomCheck(null, [0, 1, 2])).toBe(false);
    expect(bloomCheck(new ArrayBuffer(BLOOM_BYTES - 1), [0])).toBe(false);
  });

  test("bloomSet then bloomCheck round-trips", () => {
    const positions = [3, 4096, BLOOM_BITS - 1];
    const buf = bloomSet(null, positions);
    expect(buf.byteLength).toBe(BLOOM_BYTES);
    expect(bloomCheck(buf, positions)).toBe(true);
    // A position that wasn't set should miss.
    expect(bloomCheck(buf, [42])).toBe(false);
  });

  test("bloomSet preserves prior bits (idempotent on repeats)", () => {
    const a = bloomSet(null, [10]);
    const b = bloomSet(a, [20]);
    expect(bloomCheck(b, [10])).toBe(true);
    expect(bloomCheck(b, [20])).toBe(true);
    // Re-setting same positions stays consistent.
    const c = bloomSet(b, [10, 20]);
    expect(bloomCheck(c, [10])).toBe(true);
    expect(bloomCheck(c, [20])).toBe(true);
  });

  test("bloomSet returns a fresh buffer (no mutation of input)", () => {
    const a = bloomSet(null, [5]);
    const before = new Uint8Array(a).slice();
    bloomSet(a, [99]);
    const after = new Uint8Array(a);
    expect(after).toEqual(before);
  });

  test("end-to-end: set 1k random ids, check all hits, sample non-set misses", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `eu_user_${i}`);
    let buf: ArrayBuffer | null = null;
    for (const id of ids) {
      const positions = await hashPositions(id);
      buf = bloomSet(buf, positions);
    }
    for (const id of ids) {
      const positions = await hashPositions(id);
      expect(bloomCheck(buf, positions)).toBe(true);
    }
    // Most never-inserted ids should miss. We don't assert 100% misses
    // because the 1k load + 16k bits + 3 hashes leaves a non-zero FPR
    // (≈ 2 % expected) — assertion is "majority miss".
    let misses = 0;
    for (let i = 0; i < 200; i++) {
      const positions = await hashPositions(`eu_other_${i}`);
      if (!bloomCheck(buf, positions)) misses++;
    }
    expect(misses).toBeGreaterThan(150); // > 75 % miss rate
  });
});
