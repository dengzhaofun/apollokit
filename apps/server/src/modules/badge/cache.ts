/**
 * Badge tree cache — Redis (Upstash) key/value.
 *
 * Wrangler has no KV namespace bound yet, so we use the already-bound
 * Upstash Redis client for the tree cache. Keys embed a per-user
 * `cacheVersion` so writes naturally invalidate without prefix-delete:
 *
 *   badge:tree:{orgId}:{endUserId}:v{cacheVersion}:{rootKey}
 *
 * `cacheVersion` is the epoch-ms of the user's most recent signal/
 * dismissal update. We stamp it on writes and read it on fetches; when
 * the stored version is behind the latest, the cache lookup falls
 * through and recomputes.
 *
 * Concretely: there is one source of truth per user — the MAX(updatedAt)
 * over `badge_signals` + `badge_dismissals` for that (orgId, endUserId).
 * We persist it to a short "pointer" Redis key so both reads (to build
 * the cache key) and writes (to bump it) stay O(1). The alternative —
 * running `SELECT MAX(updated_at)...` on every /tree — would add a
 * round-trip to the hot path.
 *
 * TTL: 300s absolute. Protects against drift between the pointer key
 * and the actual tree key (e.g. a worker crash between bump and write).
 */

import type { Redis } from "@upstash/redis/cloudflare";

import type { BadgeTreeNode } from "./types";

const VERSION_TTL_SEC = 24 * 60 * 60; // 1 day — rarely read but cheap
const TREE_TTL_SEC = 300;

function versionKey(orgId: string, endUserId: string): string {
  return `badge:ver:${orgId}:${endUserId}`;
}

function treeKey(
  orgId: string,
  endUserId: string,
  version: number,
  rootKey: string | null,
): string {
  return `badge:tree:${orgId}:${endUserId}:v${version}:${rootKey ?? "_"}`;
}

type CachedTree = {
  serverTimestamp: string;
  nodes: BadgeTreeNode[];
};

export type BadgeCache = {
  readonly enabled: boolean;
  /**
   * Read the cached tree. Returns null on miss or when caching is
   * disabled / Redis is unreachable — callers always fall through to a
   * fresh compute and never surface cache errors to clients.
   */
  readTree(
    orgId: string,
    endUserId: string,
    rootKey: string | null,
  ): Promise<CachedTree | null>;

  /**
   * Write a freshly-computed tree under the current version. Silently
   * no-ops when caching is disabled.
   */
  writeTree(
    orgId: string,
    endUserId: string,
    rootKey: string | null,
    tree: CachedTree,
  ): Promise<void>;

  /**
   * Bump the per-user cache version. Call this whenever signals or
   * dismissals for the user change. Doesn't need to block — callers use
   * `waitUntil` in the Hono context so clients see write responses
   * without this round-trip.
   */
  bumpVersion(orgId: string, endUserId: string): Promise<void>;
};

/**
 * Factory — returns a cache that gracefully degrades when `redis` is
 * unavailable. Unit tests can skip redis entirely by passing `null`.
 */
export function createBadgeCache(redis: Redis | null): BadgeCache {
  if (!redis) {
    return {
      enabled: false,
      async readTree() {
        return null;
      },
      async writeTree() {
        /* noop */
      },
      async bumpVersion() {
        /* noop */
      },
    };
  }

  // Capture into a typed-non-null local — tsc won't narrow `redis`
  // inside nested async functions otherwise.
  const r: Redis = redis;

  async function currentVersion(orgId: string, endUserId: string): Promise<number> {
    const raw = await r.get<string | number | null>(
      versionKey(orgId, endUserId),
    );
    if (raw == null) return 0;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  return {
    enabled: true,

    async readTree(orgId, endUserId, rootKey) {
      try {
        const version = await currentVersion(orgId, endUserId);
        if (version === 0) return null;
        const cached = await r.get<CachedTree>(
          treeKey(orgId, endUserId, version, rootKey),
        );
        return cached ?? null;
      } catch (err) {
        // Cache misses and Redis failures are equivalent to the caller.
        console.warn("[badge-cache] readTree failed", err);
        return null;
      }
    },

    async writeTree(orgId, endUserId, rootKey, tree) {
      try {
        const version = await currentVersion(orgId, endUserId);
        // If version is 0 we haven't bumped yet — the cache would
        // "lead" the data-source state. Skip write.
        if (version === 0) return;
        await r.set(treeKey(orgId, endUserId, version, rootKey), tree, {
          ex: TREE_TTL_SEC,
        });
      } catch (err) {
        console.warn("[badge-cache] writeTree failed", err);
      }
    },

    async bumpVersion(orgId, endUserId) {
      try {
        await r.set(versionKey(orgId, endUserId), Date.now(), {
          ex: VERSION_TTL_SEC,
        });
      } catch (err) {
        console.warn("[badge-cache] bumpVersion failed", err);
      }
    },
  };
}
