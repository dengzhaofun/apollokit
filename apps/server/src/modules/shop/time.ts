/**
 * Pure time utilities for the shop module.
 *
 * Two use cases:
 *
 *   1. `computeNextRefresh(now, cycle)` — for `timeWindowType='cyclic'`
 *      products, rolls a per-user cycle reset marker forward. We anchor
 *      at UTC midnight / UTC Monday / UTC first-of-month. Per-tenant
 *      timezone support is a later extension point (would slot in via
 *      an `Intl.DateTimeFormat({ timeZone })` call like check-in's
 *      `time.ts`); for MVP we keep it UTC-anchored for determinism.
 *
 *   2. `computeEligibilityExpiry(anchorAt, windowSeconds)` — adds the
 *      relative-window duration to the user's eligibility anchor timestamp.
 *
 * Dependency-free on purpose — every KB imported here is bundled into the
 * Worker and counts against cold-start and CPU budget.
 */

import type { RefreshCycle } from "./types";

/**
 * Next reset boundary for a cyclic product, in UTC.
 *
 *   daily   → tomorrow 00:00 UTC
 *   weekly  → next Monday 00:00 UTC (ISO-8601 week start)
 *   monthly → first day of next month 00:00 UTC
 *
 * `now` is evaluated in UTC. Returned Date is strictly greater than `now`.
 */
export function computeNextRefresh(now: Date, cycle: RefreshCycle): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (cycle) {
    case "daily":
      return new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
    case "weekly": {
      // 0=Sun,1=Mon,...,6=Sat. We want the next Monday strictly after now.
      const dow = now.getUTCDay();
      // Days to add to reach next Monday:
      //   dow=1 (Mon)  → 7 (we want *next* Monday, not today)
      //   dow=0 (Sun)  → 1
      //   dow=2..6     → 8-dow (Tue→6, ..., Sat→2)
      const daysToNextMon = dow === 1 ? 7 : (8 - dow) % 7 || 7;
      return new Date(Date.UTC(y, m, d + daysToNextMon, 0, 0, 0, 0));
    }
    case "monthly":
      return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  }
}

/**
 * Compute the eligibility expiry instant for a `timeWindowType='relative'`
 * product: `anchorAt + windowSeconds`.
 *
 * `anchorAt` is either the user's row creation timestamp (anchor=user_created)
 * or their first purchase of this product (anchor=first_purchase). The caller
 * resolves which one to feed in based on `product.eligibilityAnchor`.
 */
export function computeEligibilityExpiry(
  anchorAt: Date,
  windowSeconds: number,
): Date {
  return new Date(anchorAt.getTime() + windowSeconds * 1000);
}
