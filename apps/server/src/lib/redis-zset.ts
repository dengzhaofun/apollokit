/**
 * Thin, typed helpers over Upstash Redis ZSET commands.
 *
 * All leaderboard hot-path reads/writes go through these helpers so that
 * the rest of the service layer never touches the raw Redis client. This
 * keeps key naming consistent, gives us a single place to swap drivers,
 * and lets tests stub the client with a plain object.
 *
 * Aggregation semantics:
 *   - "sum"     → score accumulates (ZINCRBY)
 *   - "max"     → score only increases (ZADD ... GT)
 *   - "latest"  → overwrite unconditionally (ZADD)
 *
 * Tie-breakers are NOT encoded in the ZSET score — Redis orders equal
 * scores lexicographically by member. Callers that need a custom
 * tie-break (e.g., first-to-reach wins) pre-combine tie info into the
 * score (integer part) + inverse-timestamp (fractional part) at the
 * call-site. We do NOT do that here to keep the wrapper neutral.
 */

import type { Redis } from "@upstash/redis/cloudflare";

export type ZSetAggregation = "sum" | "max" | "latest";

export type LeaderboardKey = {
  tenantId: string;
  configId: string;
  cycleKey: string;
  scopeKey: string;
};

/**
 * Canonical Redis key for a leaderboard bucket.
 * Format: `lb:{orgId}:{configId}:{cycleKey}:{scopeKey}`
 */
export function leaderboardKey(k: LeaderboardKey): string {
  return `lb:${k.tenantId}:${k.configId}:${k.cycleKey}:${k.scopeKey}`;
}

/**
 * Write a single member's score according to the aggregation policy.
 * Returns the new score after the write (best-effort — Upstash returns
 * null on GT no-op; we fall back to ZSCORE).
 */
export async function zAddWithPolicy(
  redis: Redis,
  key: string,
  member: string,
  delta: number,
  aggregation: ZSetAggregation,
): Promise<number | null> {
  if (aggregation === "sum") {
    // ZINCRBY returns the new score as a string in REST, Upstash SDK
    // returns number.
    const newScore = await redis.zincrby(key, delta, member);
    return typeof newScore === "string" ? Number(newScore) : newScore;
  }
  if (aggregation === "max") {
    // ZADD ... GT: only updates if the new score is greater.
    await redis.zadd(key, { gt: true }, { score: delta, member });
    const score = await redis.zscore(key, member);
    return score ?? null;
  }
  // "latest": overwrite unconditionally.
  await redis.zadd(key, { score: delta, member });
  return delta;
}

/**
 * Trim the ZSET so only the top N members remain.
 *
 * Implementation: `ZREMRANGEBYRANK 0 -(N+1)` removes everything below
 * the top N (ranks are 0-indexed ascending; we want to keep the highest
 * N by score, which corresponds to the largest ranks).
 */
export async function trimTop(
  redis: Redis,
  key: string,
  maxEntries: number,
): Promise<void> {
  if (maxEntries <= 0) return;
  // Keep top N by score → remove everything ranked [0, total-N-1] ascending.
  // Using negative-rank semantics: end = -(maxEntries + 1)
  const stop = -(maxEntries + 1);
  await redis.zremrangebyrank(key, 0, stop);
}

export type ZRangeEntry = { member: string; score: number };

/**
 * Return the top N entries (highest score first) with their scores.
 */
export async function topWithScores(
  redis: Redis,
  key: string,
  limit: number,
): Promise<ZRangeEntry[]> {
  if (limit <= 0) return [];
  // Upstash SDK: zrange(key, start, stop, { rev, withScores }) returns
  // a flat array [member1, score1, member2, score2, ...] when withScores.
  const raw = await redis.zrange(key, 0, limit - 1, {
    rev: true,
    withScores: true,
  });
  return flatPairsToEntries(raw as (string | number)[]);
}

/**
 * Return members ranked within a zero-indexed window [start, stop]
 * sorted highest-first.
 */
export async function rangeWithScores(
  redis: Redis,
  key: string,
  start: number,
  stop: number,
): Promise<ZRangeEntry[]> {
  if (stop < start) return [];
  const raw = await redis.zrange(key, start, stop, {
    rev: true,
    withScores: true,
  });
  return flatPairsToEntries(raw as (string | number)[]);
}

/** Rank of a member (0-indexed, highest-first). null if absent. */
export async function rankOf(
  redis: Redis,
  key: string,
  member: string,
): Promise<number | null> {
  const r = await redis.zrevrank(key, member);
  return typeof r === "number" ? r : null;
}

/** Score of a member. null if absent. */
export async function scoreOf(
  redis: Redis,
  key: string,
  member: string,
): Promise<number | null> {
  const s = await redis.zscore(key, member);
  return typeof s === "number" ? s : null;
}

/** Number of members in the ZSET. */
export async function cardinality(
  redis: Redis,
  key: string,
): Promise<number> {
  const c = await redis.zcard(key);
  return typeof c === "number" ? c : 0;
}

/**
 * Delete the ZSET completely. Used when a cycle closes and we want to
 * reclaim Redis memory after writing the snapshot to PG.
 */
export async function purge(redis: Redis, key: string): Promise<void> {
  await redis.del(key);
}

// ─── Internals ────────────────────────────────────────────────────

function flatPairsToEntries(raw: (string | number)[]): ZRangeEntry[] {
  const out: ZRangeEntry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i] as string;
    const rawScore = raw[i + 1];
    const score =
      typeof rawScore === "number" ? rawScore : Number(rawScore);
    out.push({ member, score });
  }
  return out;
}
