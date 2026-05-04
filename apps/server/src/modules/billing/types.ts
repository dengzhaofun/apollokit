import type {
  billingSubscriptionPlan,
  billingTeamSubscription,
  mauSnapshot,
} from "../../schema";

export type SubscriptionPlan = typeof billingSubscriptionPlan.$inferSelect;
export type TeamSubscription = typeof billingTeamSubscription.$inferSelect;
export type MauSnapshot = typeof mauSnapshot.$inferSelect;

export type SubscriptionStatus = "active" | "past_due" | "canceled";

/**
 * The shape returned by `GET /api/v1/billing/mau/current`.
 *
 * `overageUnits` is **rounded up to the nearest thousand** because
 * the price-per-1k is what plans are quoted at (industry-standard
 * tiered SaaS billing). `projectedOverageCents` already factors
 * that ceiling in, so frontends can display it directly.
 */
export type CurrentMauUsage = {
  yearMonth: string;
  mau: number;
  quota: number | null;
  overage: number;
  overageUnitsPer1k: number;
  projectedOverageCents: number;
  plan: { id: string; name: string; slug: string } | null;
  subscriptionStatus: SubscriptionStatus | null;
};

/** Threshold tiers we monitor. Order matters — see runMauAlerts. */
export const ALERT_THRESHOLDS = [80, 100, 150] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];
