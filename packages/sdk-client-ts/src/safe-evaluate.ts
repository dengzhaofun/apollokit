/**
 * Resilient wrapper around `ExperimentClientService.experimentClientPostEvaluate`.
 *
 * Why this exists: the auto-generated SDK method throws on network /
 * 5xx errors. A game client without a try/catch around it can hang
 * the player's launch flow on a single transient blip. `safeEvaluate`
 * provides three layers of resilience:
 *
 *   1. **Try/catch** — on any error, fall through to fallback paths
 *      instead of throwing. The caller never has to wrap.
 *   2. **In-memory cache (60s TTL)** — repeated calls with the same
 *      keys + attributes return the cached result without round-tripping.
 *      Also used as a stale fallback if a later call fails.
 *   3. **Caller fallback** — if both the network call AND any cache
 *      miss, return a tenant-supplied fallback (`{ key: 'control' }`)
 *      so the game still has a defined variant for every requested
 *      experiment.
 *
 * This is hand-written and lives OUTSIDE the `generated/` directory so
 * `pnpm sdks:generate` will not overwrite it.
 */

import { ExperimentClientService } from "./generated/sdk.gen.js"
import type {
  ExperimentClientPostEvaluateData,
  ExperimentEvaluatedVariant,
} from "./generated/types.gen.js"

/** Result map keyed by experiment.key. */
export type SafeEvaluateResult = Record<string, ExperimentEvaluatedVariant>

export interface SafeEvaluateOptions {
  /** Experiment keys to evaluate. Required. Max 50 per server validator. */
  keys: string[]
  /**
   * Tenant-supplied attributes for targeting rule evaluation
   * (plan, cohort, etc.). The server merges in geo / UA — SDK
   * values override on conflict. Total payload capped at 4KB.
   */
  attributes?: Record<string, unknown>
  /**
   * Fallback variant per experiment key, used only when both the
   * network call AND any in-memory cache miss. Typically
   * `{ onboarding_flow: 'control', shop_price_tier: 'control' }`
   * to default everyone to the safe path on outage.
   */
  fallback?: Record<string, string>
  /**
   * Optional override for the underlying SDK options. Useful for
   * passing a custom client / signal / headers — anything the
   * generated method already accepts.
   */
  sdkOptions?: Partial<ExperimentClientPostEvaluateData>
  /**
   * Milliseconds before a cached entry is considered stale. Defaults
   * to 60_000 (60 s). Stale entries are still returned as a fallback
   * if the next network call fails — they only stop being authoritative.
   */
  cacheTtlMs?: number
}

interface CacheEntry {
  result: SafeEvaluateResult
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(opts: SafeEvaluateOptions): string {
  // Sort keys so re-orderings of either array still hit the same
  // cache entry. JSON.stringify on attributes is good enough — we
  // expect O(10) attributes max.
  const keys = [...opts.keys].sort()
  return JSON.stringify({ keys, attributes: opts.attributes ?? {} })
}

function buildFallback(
  fallback: Record<string, string> | undefined,
  keys: string[],
): SafeEvaluateResult {
  if (!fallback) return {}
  const r: SafeEvaluateResult = {}
  for (const k of keys) {
    if (fallback[k]) r[k] = { variantKey: fallback[k], config: null }
  }
  return r
}

/**
 * Evaluate experiments with full failure tolerance. Never throws.
 *
 * Returns the variant map. If the server returned `result` is
 * partial (some experiments are draft / not found), those keys are
 * simply absent from the map — caller should treat absence as "no
 * variant assigned, render default UI".
 */
export async function safeEvaluate(
  opts: SafeEvaluateOptions,
): Promise<SafeEvaluateResult> {
  const ttl = opts.cacheTtlMs ?? 60_000
  const key = cacheKey(opts)
  const cached = cache.get(key)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < ttl) {
    return cached.result
  }

  const body: ExperimentClientPostEvaluateData["body"] = {
    experiment_keys: opts.keys,
    ...(opts.attributes ? { attributes: opts.attributes } : {}),
  }

  try {
    const response = await ExperimentClientService.experimentClientPostEvaluate(
      {
        ...(opts.sdkOptions ?? {}),
        body,
      },
    )
    // hey-api returns `{ data, error, response }` where `data` is keyed
    // by status code. We only consume the 200 envelope here.
    const data = response.data?.[200]?.data?.results ?? {}
    cache.set(key, { result: data, fetchedAt: now })
    return data
  } catch {
    // Network / 4xx / 5xx — try graceful degradation.
    if (cached) return cached.result // stale > nothing
    return buildFallback(opts.fallback, opts.keys)
  }
}

/**
 * Drop the in-memory cache. Useful when a player logs out / the
 * tenant context changes (and you want subsequent evaluations to
 * re-fetch with the new identity).
 */
export function clearSafeEvaluateCache(): void {
  cache.clear()
}
