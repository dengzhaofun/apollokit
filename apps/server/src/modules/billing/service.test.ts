/**
 * Service-layer tests for the billing module. Talks to the real
 * Neon dev branch — no mocks. The cron methods write `mau_alert`
 * and `mau_snapshot` rows we then assert against.
 *
 * Email side effects fall back to `console.log` under vitest
 * because the `EMAIL` binding is unset in the cloudflare-workers
 * shim — assertions here cover the database-visible state, not
 * the mailer wire.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "../../db";
import { previousYearMonth, currentYearMonth } from "../../lib/mau/time";
import {
  billingSubscriptionPlan,
  billingTeamSubscription,
  euUser,
  mauActivePlayer,
  mauAlert,
  mauSnapshot,
} from "../../schema";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { BillingSubscriptionNotFound } from "./errors";
import { createBillingService } from "./service";

const svc = createBillingService({ db });

async function seedPlan(opts: {
  slug: string;
  mauQuota: number;
  overagePricePer1k: number;
}) {
  const id = `plan-${crypto.randomUUID()}`;
  await db.insert(billingSubscriptionPlan).values({
    id,
    name: opts.slug,
    slug: opts.slug,
    mauQuota: opts.mauQuota,
    overagePricePer1k: opts.overagePricePer1k,
    basePriceCents: 0,
  });
  return id;
}

async function seedSubscription(opts: { teamId: string; planId: string }) {
  await db.insert(billingTeamSubscription).values({
    teamId: opts.teamId,
    planId: opts.planId,
    billingCycleAnchor: new Date().toISOString().slice(0, 10),
    status: "active",
  });
}

async function seedActivePlayers(opts: {
  teamId: string;
  yearMonth: string;
  count: number;
  prefix: string;
}) {
  for (let i = 0; i < opts.count; i++) {
    const id = `${opts.prefix}-${i}-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(euUser).values({
      id,
      name: id,
      email: `${id}@${opts.teamId}.test`,
      tenantId: opts.teamId,
    });
    await db.insert(mauActivePlayer).values({
      teamId: opts.teamId,
      euUserId: id,
      yearMonth: opts.yearMonth,
    });
  }
}

describe("billing service — getCurrentMauUsage", () => {
  let teamId: string;

  beforeAll(async () => {
    teamId = await createTestOrg("bill-usage");
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("returns no-plan shape when team has no subscription", async () => {
    const r = await svc.getCurrentMauUsage(teamId);
    expect(r.plan).toBeNull();
    expect(r.quota).toBeNull();
    expect(r.subscriptionStatus).toBeNull();
    expect(r.overage).toBe(0);
    expect(r.projectedOverageCents).toBe(0);
  });

  test("under-quota team has zero overage", async () => {
    const planId = await seedPlan({
      slug: `under-${teamId}`,
      mauQuota: 1000,
      overagePricePer1k: 100,
    });
    await seedSubscription({ teamId, planId });
    await seedActivePlayers({
      teamId,
      yearMonth: currentYearMonth(),
      count: 50,
      prefix: "u-under",
    });
    const r = await svc.getCurrentMauUsage(teamId);
    expect(r.mau).toBeGreaterThanOrEqual(50);
    expect(r.quota).toBe(1000);
    expect(r.overage).toBe(0);
    expect(r.overageUnitsPer1k).toBe(0);
    expect(r.projectedOverageCents).toBe(0);
    expect(r.plan?.slug).toBe(`under-${teamId}`);
    expect(r.subscriptionStatus).toBe("active");
  });
});

describe("billing service — overage rounding", () => {
  let teamId: string;

  beforeAll(async () => {
    teamId = await createTestOrg("bill-overage");
    const planId = await seedPlan({
      slug: `over-${teamId}`,
      mauQuota: 100,
      // $0.50 per 1k overage = 50 cents
      overagePricePer1k: 50,
    });
    await seedSubscription({ teamId, planId });
    // 100 quota + 1 over = 1k chunk (rounded up).
    await seedActivePlayers({
      teamId,
      yearMonth: currentYearMonth(),
      count: 101,
      prefix: "u-over",
    });
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("overage is rounded UP to nearest thousand for billing", async () => {
    const r = await svc.getCurrentMauUsage(teamId);
    expect(r.mau).toBe(101);
    expect(r.quota).toBe(100);
    expect(r.overage).toBe(1);
    expect(r.overageUnitsPer1k).toBe(1);
    expect(r.projectedOverageCents).toBe(50);
  });
});

describe("billing service — getSubscription", () => {
  let teamId: string;

  beforeAll(async () => {
    teamId = await createTestOrg("bill-getsub");
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("throws BillingSubscriptionNotFound when missing", async () => {
    await expect(svc.getSubscription(teamId)).rejects.toBeInstanceOf(
      BillingSubscriptionNotFound,
    );
  });

  test("returns subscription + plan when present", async () => {
    const planId = await seedPlan({
      slug: `getsub-${teamId}`,
      mauQuota: 5000,
      overagePricePer1k: 25,
    });
    await seedSubscription({ teamId, planId });
    const sub = await svc.getSubscription(teamId);
    expect(sub.plan.id).toBe(planId);
    expect(sub.subscription.status).toBe("active");
  });
});

describe("billing service — runMauAlerts", () => {
  let teamId: string;
  let yearMonth: string;
  const now = new Date(Date.UTC(2026, 4, 15)); // 2026-05-15

  beforeAll(async () => {
    teamId = await createTestOrg("bill-alerts");
    yearMonth = currentYearMonth(now);
    const planId = await seedPlan({
      slug: `alerts-${teamId}`,
      mauQuota: 100,
      overagePricePer1k: 100,
    });
    await seedSubscription({ teamId, planId });
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("under 80%: no alerts", async () => {
    await seedActivePlayers({
      teamId,
      yearMonth,
      count: 50, // 50% — below the lowest tier
      prefix: "u-alert-50",
    });
    const r = await svc.runMauAlerts({ now });
    // We may scan more than one team if other tests ran first;
    // assert by inspecting the per-team alert log instead.
    expect(r.teamsScanned).toBeGreaterThan(0);
    const rows = await db
      .select()
      .from(mauAlert)
      .where(and(eq(mauAlert.teamId, teamId), eq(mauAlert.yearMonth, yearMonth)));
    expect(rows).toHaveLength(0);
  });

  test("crossing 100% triggers 80 + 100 alerts; not 150", async () => {
    // Currently at 50; add 60 to put MAU at 110 (110% of 100 quota).
    await seedActivePlayers({
      teamId,
      yearMonth,
      count: 60,
      prefix: "u-alert-100",
    });
    await svc.runMauAlerts({ now });
    const rows = await db
      .select()
      .from(mauAlert)
      .where(and(eq(mauAlert.teamId, teamId), eq(mauAlert.yearMonth, yearMonth)));
    const triggered = rows.map((r) => r.threshold).sort((a, b) => a - b);
    expect(triggered).toEqual([80, 100]);
  });

  test("re-running with same data does not duplicate alerts", async () => {
    await svc.runMauAlerts({ now });
    const rows = await db
      .select()
      .from(mauAlert)
      .where(and(eq(mauAlert.teamId, teamId), eq(mauAlert.yearMonth, yearMonth)));
    expect(rows).toHaveLength(2);
  });

  test("crossing 150% adds the 150 alert without resending earlier tiers", async () => {
    // Push to 160 total → 160 % of 100.
    await seedActivePlayers({
      teamId,
      yearMonth,
      count: 50,
      prefix: "u-alert-150",
    });
    await svc.runMauAlerts({ now });
    const rows = await db
      .select()
      .from(mauAlert)
      .where(and(eq(mauAlert.teamId, teamId), eq(mauAlert.yearMonth, yearMonth)));
    const triggered = rows.map((r) => r.threshold).sort((a, b) => a - b);
    expect(triggered).toEqual([80, 100, 150]);
  });
});

describe("billing service — runMonthlyMauSnapshot", () => {
  let teamId: string;
  let yearMonth: string;

  beforeAll(async () => {
    teamId = await createTestOrg("bill-snapshot");
    // Pretend "now" is 2026-06-01; we snapshot 2026-05.
    yearMonth = "2026-05";
    await seedActivePlayers({
      teamId,
      yearMonth,
      count: 7,
      prefix: "u-snap",
    });
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("aggregates last month and writes mau_snapshot", async () => {
    const now = new Date(Date.UTC(2026, 5, 1, 0, 1)); // 2026-06-01 00:01 UTC
    expect(previousYearMonth(now)).toBe(yearMonth);
    await svc.runMonthlyMauSnapshot({ now });
    const [row] = await db
      .select()
      .from(mauSnapshot)
      .where(
        and(
          eq(mauSnapshot.teamId, teamId),
          eq(mauSnapshot.periodStart, "2026-05-01"),
          eq(mauSnapshot.source, "monthly_close"),
        ),
      );
    expect(row).toBeDefined();
    expect(row?.mau).toBe(7);
  });

  test("re-running is idempotent — no duplicate snapshot rows", async () => {
    const now = new Date(Date.UTC(2026, 5, 1, 0, 2));
    await svc.runMonthlyMauSnapshot({ now });
    const rows = await db
      .select()
      .from(mauSnapshot)
      .where(
        and(
          eq(mauSnapshot.teamId, teamId),
          eq(mauSnapshot.periodStart, "2026-05-01"),
          eq(mauSnapshot.source, "monthly_close"),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});

describe("billing service — listSnapshots", () => {
  let teamId: string;

  beforeAll(async () => {
    teamId = await createTestOrg("bill-list");
  });

  afterAll(async () => {
    await deleteTestOrg(teamId);
  });

  test("returns rows for the team in DESC period_start order", async () => {
    await db.insert(mauSnapshot).values([
      {
        organizationId: teamId,
        teamId,
        periodStart: "2026-03-01",
        mau: 100,
        source: "monthly_close",
      },
      {
        organizationId: teamId,
        teamId,
        periodStart: "2026-04-01",
        mau: 250,
        source: "monthly_close",
      },
    ]);
    const rows = await svc.listSnapshots(teamId, 12);
    expect(rows.map((r) => r.periodStart)).toEqual([
      "2026-04-01",
      "2026-03-01",
    ]);
  });
});
