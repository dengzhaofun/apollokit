/**
 * Billing service — protocol-agnostic.
 *
 * Three responsibilities:
 *   1. Read current-cycle MAU usage and project overage charges
 *      for one team. (`getCurrentMauUsage`)
 *   2. Read historical billing-quality snapshots from
 *      `mau_snapshot`. (`listSnapshots`)
 *   3. Cron-driven side effects: send threshold alerts and write
 *      monthly snapshots. (`runMauAlerts`, `runMonthlyMauSnapshot`)
 *
 * Service does not import `hono`, the `db` constant, or the `deps`
 * constant — only the `AppDeps` type. Routes wire this through
 * `index.ts`; the cron handler in `src/scheduled.ts` calls the
 * cron methods directly.
 */

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { logger } from "../../lib/logger";
import { sendMauAlertEmail } from "../../lib/mailer";
import { computeOverage } from "../../lib/mau/billing-math";
import {
  periodStartFromYearMonth,
  previousYearMonth,
  currentYearMonth,
} from "../../lib/mau/time";
import {
  billingSubscriptionPlan,
  billingTeamSubscription,
  mauActivePlayer,
  mauAlert,
  mauSnapshot,
  member,
  team,
  user,
} from "../../schema";
import { BillingSubscriptionNotFound } from "./errors";
import {
  ALERT_THRESHOLDS,
  type AlertThreshold,
  type CurrentMauUsage,
  type MauSnapshot,
  type SubscriptionStatus,
} from "./types";

type BillingDeps = Pick<AppDeps, "db">;

/**
 * Resolve the highest threshold tier crossed by a (mau, quota)
 * pair. Returns the list of tiers that have been reached so the
 * caller can attempt to insert each into `mau_alert` — the unique
 * key handles dedup, so we don't need to know which were already
 * sent in a previous tick.
 */
function thresholdsReached(mau: number, quota: number): AlertThreshold[] {
  if (quota <= 0) return [];
  const ratio = (mau / quota) * 100;
  return ALERT_THRESHOLDS.filter((t) => ratio >= t);
}

export function createBillingService(d: BillingDeps) {
  const { db } = d;

  async function countMauForTeam(
    teamId: string,
    yearMonth: string,
  ): Promise<number> {
    const [row] = await db
      .select({ c: count() })
      .from(mauActivePlayer)
      .where(
        and(
          eq(mauActivePlayer.teamId, teamId),
          eq(mauActivePlayer.yearMonth, yearMonth),
        ),
      );
    return row?.c ?? 0;
  }

  async function loadSubscriptionWithPlan(teamId: string) {
    const rows = await db
      .select({
        subscription: billingTeamSubscription,
        plan: billingSubscriptionPlan,
      })
      .from(billingTeamSubscription)
      .innerJoin(
        billingSubscriptionPlan,
        eq(billingTeamSubscription.planId, billingSubscriptionPlan.id),
      )
      .where(eq(billingTeamSubscription.teamId, teamId))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    /**
     * Real-time current-cycle MAU + overage projection. Returns
     * a stable shape even for teams without a subscription so
     * the admin UI can render a "no plan attached" state.
     */
    async getCurrentMauUsage(
      teamId: string,
      now: Date = new Date(),
    ): Promise<CurrentMauUsage> {
      const yearMonth = currentYearMonth(now);
      const [mau, sub] = await Promise.all([
        countMauForTeam(teamId, yearMonth),
        loadSubscriptionWithPlan(teamId),
      ]);

      if (!sub) {
        return {
          yearMonth,
          mau,
          quota: null,
          overage: 0,
          overageUnitsPer1k: 0,
          projectedOverageCents: 0,
          plan: null,
          subscriptionStatus: null,
        };
      }

      const { overage, overageUnitsPer1k, projectedOverageCents } =
        computeOverage(
          mau,
          sub.plan.mauQuota,
          sub.plan.overagePricePer1k,
        );

      return {
        yearMonth,
        mau,
        quota: sub.plan.mauQuota,
        overage,
        overageUnitsPer1k,
        projectedOverageCents,
        plan: {
          id: sub.plan.id,
          name: sub.plan.name,
          slug: sub.plan.slug,
        },
        subscriptionStatus: sub.subscription.status as SubscriptionStatus,
      };
    },

    async listSnapshots(
      teamId: string,
      months: number,
    ): Promise<MauSnapshot[]> {
      const earliest = new Date();
      earliest.setUTCMonth(earliest.getUTCMonth() - months);
      earliest.setUTCDate(1);
      earliest.setUTCHours(0, 0, 0, 0);

      return db
        .select()
        .from(mauSnapshot)
        .where(
          and(
            eq(mauSnapshot.teamId, teamId),
            gte(mauSnapshot.periodStart, earliest.toISOString().slice(0, 10)),
            eq(mauSnapshot.source, "monthly_close"),
          ),
        )
        .orderBy(desc(mauSnapshot.periodStart));
    },

    /**
     * Get the subscription row + plan for a team. Throws if the
     * team has no subscription — admin UI should branch on the
     * 404 to offer "attach plan" UX.
     */
    async getSubscription(teamId: string) {
      const sub = await loadSubscriptionWithPlan(teamId);
      if (!sub) throw new BillingSubscriptionNotFound(teamId);
      return sub;
    },

    /**
     * Hourly cron task. Walks every active subscription, checks
     * the current MAU against the plan quota, and fires off the
     * threshold alert email for any tier that hasn't been alerted
     * yet this month.
     *
     * The dedup is owned by the unique index on
     * `mau_alert(team_id, year_month, threshold)` — we attempt
     * the insert with ON CONFLICT DO NOTHING and only act on
     * rows that actually inserted. That makes the whole task
     * naturally idempotent under retries / clock skew.
     */
    async runMauAlerts({ now }: { now: Date }): Promise<{
      teamsScanned: number;
      alertsTriggered: number;
    }> {
      const yearMonth = currentYearMonth(now);

      const activeSubs = await db
        .select({
          teamId: billingTeamSubscription.teamId,
          planId: billingTeamSubscription.planId,
          mauQuota: billingSubscriptionPlan.mauQuota,
          teamName: team.name,
          organizationId: team.organizationId,
        })
        .from(billingTeamSubscription)
        .innerJoin(
          billingSubscriptionPlan,
          eq(billingTeamSubscription.planId, billingSubscriptionPlan.id),
        )
        .innerJoin(team, eq(billingTeamSubscription.teamId, team.id))
        .where(eq(billingTeamSubscription.status, "active"));

      let alertsTriggered = 0;

      for (const sub of activeSubs) {
        try {
          const mau = await countMauForTeam(sub.teamId, yearMonth);
          const tiers = thresholdsReached(mau, sub.mauQuota);
          if (tiers.length === 0) continue;

          for (const threshold of tiers) {
            const inserted = await db
              .insert(mauAlert)
              .values({
                teamId: sub.teamId,
                yearMonth,
                threshold,
                mauAtTrigger: mau,
                quotaAtTrigger: sub.mauQuota,
              })
              .onConflictDoNothing({
                target: [
                  mauAlert.teamId,
                  mauAlert.yearMonth,
                  mauAlert.threshold,
                ],
              })
              .returning({ id: mauAlert.id });
            if (inserted.length === 0) continue;

            alertsTriggered++;

            // Best-effort email — failure must not roll back the
            // mau_alert row (we'd then re-spam the customer next
            // tick). Log loudly so ops can see it; admin UI shows
            // the alert from the row regardless.
            try {
              await notifyOrgAdmins(db, sub.organizationId, {
                teamName: sub.teamName,
                yearMonth,
                threshold,
                mau,
                quota: sub.mauQuota,
              });
            } catch (err) {
              logger.error(
                `[billing.runMauAlerts] notify failed team=${sub.teamId} threshold=${threshold}`,
                err,
              );
            }
          }
        } catch (err) {
          logger.error(
            `[billing.runMauAlerts] team failed team=${sub.teamId}`,
            err,
          );
        }
      }

      return { teamsScanned: activeSubs.length, alertsTriggered };
    },

    /**
     * Month-1 cron task: snapshot the just-finished month's MAU
     * for every team that had any activity. We snapshot all teams
     * with rows in `mau_active_player` for the previous month,
     * not just teams with subscriptions — a team that got deleted
     * mid-month or had its subscription canceled still has a real
     * MAU number we may need to bill for in arrears.
     */
    async runMonthlyMauSnapshot({ now }: { now: Date }): Promise<{
      snapshotsWritten: number;
    }> {
      const yearMonth = previousYearMonth(now);
      const periodStart = periodStartFromYearMonth(yearMonth);
      const periodStartStr = periodStart.toISOString().slice(0, 10);

      const aggregates = await db
        .select({
          teamId: mauActivePlayer.teamId,
          mau: count(),
          organizationId: team.organizationId,
        })
        .from(mauActivePlayer)
        .innerJoin(team, eq(mauActivePlayer.teamId, team.id))
        .where(eq(mauActivePlayer.yearMonth, yearMonth))
        .groupBy(mauActivePlayer.teamId, team.organizationId);

      let written = 0;
      for (const agg of aggregates) {
        try {
          const inserted = await db
            .insert(mauSnapshot)
            .values({
              organizationId: agg.organizationId,
              teamId: agg.teamId,
              periodStart: periodStartStr,
              mau: agg.mau,
              source: "monthly_close",
            })
            .onConflictDoNothing({
              target: [
                mauSnapshot.teamId,
                mauSnapshot.periodStart,
                mauSnapshot.source,
              ],
            })
            .returning({ id: mauSnapshot.id });
          if (inserted.length > 0) written++;
        } catch (err) {
          logger.error(
            `[billing.runMonthlyMauSnapshot] team failed team=${agg.teamId}`,
            err,
          );
        }
      }

      return { snapshotsWritten: written };
    },
  };
}

/**
 * Resolve "owner" / "admin" emails for an organization and send
 * the threshold-alert email to each. Soft fail (returns) if no
 * recipients exist — better to log and let the alert row stand
 * than to throw and roll back the dedup write.
 */
async function notifyOrgAdmins(
  db: AppDeps["db"],
  organizationId: string,
  params: {
    teamName: string;
    yearMonth: string;
    threshold: number;
    mau: number;
    quota: number;
  },
): Promise<void> {
  const recipients = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.role, ["owner", "admin"]),
      ),
    );

  if (recipients.length === 0) {
    logger.warn(
      `[billing.notifyOrgAdmins] no admin/owner recipients for org=${organizationId}`,
    );
    return;
  }

  const dashboardUrl = buildDashboardUrl();
  await Promise.all(
    recipients.map((r) =>
      sendMauAlertEmail({
        to: r.email,
        teamName: params.teamName,
        yearMonth: params.yearMonth,
        threshold: params.threshold,
        mau: params.mau,
        quota: params.quota,
        dashboardUrl,
      }),
    ),
  );
}

function buildDashboardUrl(): string {
  // ADMIN_URL is a wrangler `vars` entry — present at runtime, not
  // under unit tests. Fall back to a stable placeholder so test
  // assertions aren't environment-dependent.
  type EnvShape = { ADMIN_URL?: string };
  const env = (globalThis as { process?: { env?: EnvShape } }).process?.env;
  const base = env?.ADMIN_URL ?? "https://app.example.com";
  return `${base}/billing`;
}

// Stop drizzle-kit from tree-shaking `sql` in some tooling paths.
void sql;

export type BillingService = ReturnType<typeof createBillingService>;
