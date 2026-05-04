/**
 * MAU billing math — pure functions shared between the per-tenant
 * billing service (`modules/billing/service.ts`) and the cross-tenant
 * platform-admin view (`modules/platform-admin/service.ts`).
 *
 * Tiered SaaS overage is billed in 1k-unit chunks (industry
 * convention: Auth0 / Clerk / Sentry). 1 user over quota = 1k
 * billable, 1001 over = 2k, etc. Keeping the rule in one place
 * removes the risk of platform-admin and tenant-billing drifting
 * apart on edge cases.
 */

export interface OverageBreakdown {
  /** Raw users above quota (can be 0 or negative-clamped to 0). */
  overage: number;
  /** Overage rounded UP to the nearest thousand — what we actually bill. */
  overageUnitsPer1k: number;
  /** Cents the customer would pay for this cycle's overage. */
  projectedOverageCents: number;
}

/**
 * Compute the overage breakdown for a given (mau, quota, price) tuple.
 *
 * `pricePer1k` is in cents per 1,000 MAU.
 */
export function computeOverage(
  mau: number,
  quota: number,
  pricePer1k: number,
): OverageBreakdown {
  const overage = Math.max(0, mau - quota);
  const overageUnitsPer1k = Math.ceil(overage / 1000);
  return {
    overage,
    overageUnitsPer1k,
    projectedOverageCents: overageUnitsPer1k * pricePer1k,
  };
}
