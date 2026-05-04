/**
 * Platform-operator service — cross-tenant aggregations.
 *
 * No HTTP imports, no `db` import — just `AppDeps` type. Production
 * wiring goes through `./index.ts`'s singleton; tests instantiate the
 * factory directly with the real `db`.
 *
 * The single SQL `listTeamMauUsage` does a left-outer chain so it
 * returns *every* team in the system (including those with neither
 * a subscription nor any current-month activity). The platform
 * dashboard wants the full picture — silent zero-MAU teams matter
 * (could indicate broken tracker / churned customer / unused project).
 */

import { and, count, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { computeOverage } from "../../lib/mau/billing-math";
import { currentYearMonth } from "../../lib/mau/time";
import {
  billingSubscriptionPlan,
  billingTeamSubscription,
  mauActivePlayer,
  organization,
  team,
} from "../../schema";
import type {
  PlatformSubscriptionStatus,
  PlatformTeamUsageRow,
} from "./types";

type PlatformAdminDeps = Pick<AppDeps, "db">;

export type ListTeamMauUsageOptions = {
  /** Override "now" for tests; defaults to `new Date()`. */
  now?: Date;
};

export function createPlatformAdminService(d: PlatformAdminDeps) {
  const { db } = d;

  return {
    /**
     * Returns one row per Better Auth team. MAU is COUNT-aggregated
     * from `mau_active_player` for the current calendar month, scoped
     * to that team via the LEFT JOIN's ON clause (so teams with zero
     * activity still produce a row).
     *
     * Sorting/filtering happens in the route layer because the
     * derived `overage` / `projectedOverageCents` columns are
     * computed application-side (price × ceiling math doesn't belong
     * in SQL — it'd require duplicating `computeOverage` logic in
     * SQL form, and SQL ORDER BY can't see service-layer derivations).
     */
    async listTeamMauUsage(
      opts: ListTeamMauUsageOptions = {},
    ): Promise<{ yearMonth: string; rows: PlatformTeamUsageRow[] }> {
      const now = opts.now ?? new Date();
      const yearMonth = currentYearMonth(now);

      // The MAU JOIN's ON clause MUST include the year_month filter —
      // putting `eq(mau_active_player.year_month, yearMonth)` in WHERE
      // would convert the LEFT JOIN into an effective INNER JOIN
      // (filters out teams with no current-month activity). Drizzle's
      // `and(...)` inside the join condition is the right place.
      const raw = await db
        .select({
          organizationId: organization.id,
          organizationName: organization.name,
          teamId: team.id,
          teamName: team.name,
          mau: count(mauActivePlayer.id),
          planId: billingSubscriptionPlan.id,
          planName: billingSubscriptionPlan.name,
          planSlug: billingSubscriptionPlan.slug,
          mauQuota: billingSubscriptionPlan.mauQuota,
          overagePricePer1k: billingSubscriptionPlan.overagePricePer1k,
          subscriptionStatus: billingTeamSubscription.status,
        })
        .from(team)
        .innerJoin(organization, eq(team.organizationId, organization.id))
        .leftJoin(
          billingTeamSubscription,
          eq(billingTeamSubscription.teamId, team.id),
        )
        .leftJoin(
          billingSubscriptionPlan,
          eq(billingTeamSubscription.planId, billingSubscriptionPlan.id),
        )
        .leftJoin(
          mauActivePlayer,
          and(
            eq(mauActivePlayer.teamId, team.id),
            eq(mauActivePlayer.yearMonth, yearMonth),
          ),
        )
        .groupBy(
          organization.id,
          organization.name,
          team.id,
          team.name,
          billingSubscriptionPlan.id,
          billingSubscriptionPlan.name,
          billingSubscriptionPlan.slug,
          billingSubscriptionPlan.mauQuota,
          billingSubscriptionPlan.overagePricePer1k,
          billingTeamSubscription.status,
        );

      const rows: PlatformTeamUsageRow[] = raw.map((r) => {
        const hasPlan = r.planId !== null && r.mauQuota !== null;
        const breakdown = hasPlan
          ? computeOverage(
              r.mau,
              r.mauQuota ?? 0,
              r.overagePricePer1k ?? 0,
            )
          : { overage: 0, overageUnitsPer1k: 0, projectedOverageCents: 0 };

        return {
          organizationId: r.organizationId,
          organizationName: r.organizationName,
          teamId: r.teamId,
          teamName: r.teamName,
          yearMonth,
          mau: r.mau,
          quota: hasPlan ? r.mauQuota : null,
          ...breakdown,
          plan: hasPlan
            ? {
                id: r.planId!,
                name: r.planName!,
                slug: r.planSlug!,
              }
            : null,
          subscriptionStatus: r.subscriptionStatus
            ? (r.subscriptionStatus as PlatformSubscriptionStatus)
            : null,
        };
      });

      return { yearMonth, rows };
    },
  };
}

// drizzle-kit's tooling sometimes tree-shakes `sql` if no expression
// uses it — we keep the import live in case future queries adopt
// raw SQL fragments.
void sql;

export type PlatformAdminService = ReturnType<
  typeof createPlatformAdminService
>;
