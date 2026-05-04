/**
 * Hot-path orchestration for "did this end-user touch this team
 * this month?". Single entry point used by both the request-time
 * middleware (`src/middleware/mau-tracker.ts`) and tests.
 *
 * The function is fire-and-forget from the caller's perspective —
 * the middleware wraps it in `c.executionCtx.waitUntil(...)`. We
 * still `await` internally so test code can assert PG / KV state
 * after one resolved Promise.
 *
 * Failure isolation
 * -----------------
 * Both bloom read and bloom write are best-effort. KV outages or
 * per-key write rate limiting (Cloudflare KV caps writes to a
 * single key at ~1/sec) MUST NOT prevent the PG insert — that's
 * the source of truth. Bloom is just a cache.
 *
 * The PG insert is `ON CONFLICT DO NOTHING`. Multiple concurrent
 * first-activations of the same player serialize on the unique
 * constraint; only one row materializes.
 */

import { logger } from "../logger";
import { mauActivePlayer } from "../../schema/mau";
import type { db } from "../../db";
import {
  BLOOM_BYTES,
  bloomCheck,
  bloomKey,
  bloomSet,
  hashPositions,
} from "./bloom";
import { currentYearMonth } from "./time";

/**
 * Minimal KV-namespace shape we depend on. The Cloudflare runtime
 * `KVNamespace` is structurally compatible — declaring an explicit
 * interface here lets test code pass an in-memory stub without a
 * type cast and documents exactly which methods we use.
 */
export interface MauKv {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export interface TrackMauArgs {
  kv: MauKv;
  db: typeof db;
  teamId: string;
  euUserId: string;
  /** Override for tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Two-month KV TTL on bloom blobs: cron snapshot reads it on the
 * 1st of the next month, then no one ever reads it again, so the
 * data is dead by day 60.
 */
const BLOOM_TTL_SECONDS = 60 * 24 * 60 * 60;

export type TrackMauOutcome =
  | "skipped_bloom_hit"
  | "inserted"
  | "already_in_pg"
  | "skipped_error";

/**
 * Records the `(teamId, euUserId, yearMonth)` activation if it
 * hasn't been recorded already. Returns the path taken — used by
 * tests; the production middleware ignores the return value.
 */
export async function trackMauActivity(
  args: TrackMauArgs,
): Promise<TrackMauOutcome> {
  const { kv, db: database, teamId, euUserId, now } = args;
  const yearMonth = currentYearMonth(now);
  const key = bloomKey(teamId, yearMonth);

  let positions: number[];
  try {
    positions = await hashPositions(euUserId);
  } catch (err) {
    logger.error("[mau.track] hash failed", err);
    return "skipped_error";
  }

  let blob: ArrayBuffer | null = null;
  try {
    blob = await kv.get(key, "arrayBuffer");
  } catch (err) {
    logger.warn("[mau.track] bloom read failed", err);
    // Continue — we still try to insert. KV outage shouldn't lose
    // billable activity.
  }

  if (blob && bloomCheck(blob, positions)) {
    return "skipped_bloom_hit";
  }

  let inserted = false;
  try {
    const rows = await database
      .insert(mauActivePlayer)
      .values({ teamId, euUserId, yearMonth })
      .onConflictDoNothing({
        target: [
          mauActivePlayer.teamId,
          mauActivePlayer.euUserId,
          mauActivePlayer.yearMonth,
        ],
      })
      .returning({ id: mauActivePlayer.id });
    inserted = rows.length > 0;
  } catch (err) {
    logger.error("[mau.track] pg insert failed", err);
    return "skipped_error";
  }

  // Whether we inserted or not, the bloom should reflect "this
  // user is in the table for this month". Updating on the
  // already-in-pg path patches up bloom blobs that were lost in
  // a KV race or never written due to rate-limiting.
  try {
    const next = bloomSet(
      blob && blob.byteLength === BLOOM_BYTES ? blob : null,
      positions,
    );
    await kv.put(key, next, { expirationTtl: BLOOM_TTL_SECONDS });
  } catch (err) {
    // KV write failures are common (per-key 1/sec) and harmless.
    logger.warn("[mau.track] bloom write failed", err);
  }

  return inserted ? "inserted" : "already_in_pg";
}
