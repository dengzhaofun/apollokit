/**
 * Cross-tenant view types for the platform-operator surface.
 *
 * One row per Better Auth team in the system, decorated with the
 * org name for grouping in UI, the team's current-month MAU and
 * its plan / overage situation. The platform dashboard renders a
 * sortable / searchable table over these.
 */

export type PlatformSubscriptionStatus = "active" | "past_due" | "canceled";

export type PlatformTeamUsageRow = {
  organizationId: string;
  organizationName: string;
  teamId: string;
  teamName: string;
  /** "YYYY-MM" — the month this row's MAU was counted for. */
  yearMonth: string;
  mau: number;
  /** null when the team has no subscription attached. */
  quota: number | null;
  /** 0 when no subscription or under-quota. */
  overage: number;
  overageUnitsPer1k: number;
  projectedOverageCents: number;
  plan: {
    id: string;
    name: string;
    slug: string;
  } | null;
  subscriptionStatus: PlatformSubscriptionStatus | null;
};
