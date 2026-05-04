/**
 * Service-layer tests for platform-admin. Real Postgres, no mocks —
 * the LEFT JOIN gymnastics in `listTeamMauUsage` are exactly the
 * kind of thing that mocks would silently cover up.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import {
  billingSubscriptionPlan,
  billingTeamSubscription,
  euUser,
  mauActivePlayer,
} from "../../schema";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { currentYearMonth } from "../../lib/mau/time";
import { createPlatformAdminService } from "./service";

const svc = createPlatformAdminService({ db });

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
  });
  return id;
}

async function seedSub(teamId: string, planId: string) {
  await db.insert(billingTeamSubscription).values({
    teamId,
    planId,
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

describe("platformAdminService.listTeamMauUsage", () => {
  // Three orgs simulate the platform's customer base:
  //   A — has subscription + active players (overage scenario)
  //   B — has subscription, no activity (under-quota)
  //   C — has activity but no subscription (free-tier)
  let teamA: string;
  let teamB: string;
  let teamC: string;
  let yearMonth: string;

  beforeAll(async () => {
    teamA = await createTestOrg("plat-A");
    teamB = await createTestOrg("plat-B");
    teamC = await createTestOrg("plat-C");
    yearMonth = currentYearMonth();

    const planA = await seedPlan({
      slug: `plat-A-${teamA}`,
      mauQuota: 100,
      overagePricePer1k: 50,
    });
    const planB = await seedPlan({
      slug: `plat-B-${teamB}`,
      mauQuota: 1000,
      overagePricePer1k: 25,
    });
    await seedSub(teamA, planA);
    await seedSub(teamB, planB);
    // teamC: no subscription on purpose

    await seedActivePlayers({
      teamId: teamA,
      yearMonth,
      count: 150, // 50 over quota
      prefix: "A",
    });
    // teamB has no players — should still appear with mau=0
    await seedActivePlayers({
      teamId: teamC,
      yearMonth,
      count: 7,
      prefix: "C",
    });
  });

  afterAll(async () => {
    await deleteTestOrg(teamA);
    await deleteTestOrg(teamB);
    await deleteTestOrg(teamC);
  });

  test("returns one row per team in the system", async () => {
    const { rows } = await svc.listTeamMauUsage();
    const ids = new Set(rows.map((r) => r.teamId));
    expect(ids.has(teamA)).toBe(true);
    expect(ids.has(teamB)).toBe(true);
    expect(ids.has(teamC)).toBe(true);
  });

  test("teamA over quota — overage and projected cents computed", async () => {
    const { rows } = await svc.listTeamMauUsage();
    const a = rows.find((r) => r.teamId === teamA);
    expect(a).toBeDefined();
    expect(a!.mau).toBe(150);
    expect(a!.quota).toBe(100);
    expect(a!.overage).toBe(50);
    // 50 rounds up to 1 × 1k chunk; price 50 → 50 cents
    expect(a!.overageUnitsPer1k).toBe(1);
    expect(a!.projectedOverageCents).toBe(50);
    expect(a!.plan?.slug).toBe(`plat-A-${teamA}`);
    expect(a!.subscriptionStatus).toBe("active");
  });

  test("teamB has subscription but zero activity — mau=0, no overage", async () => {
    const { rows } = await svc.listTeamMauUsage();
    const b = rows.find((r) => r.teamId === teamB);
    expect(b).toBeDefined();
    expect(b!.mau).toBe(0);
    expect(b!.quota).toBe(1000);
    expect(b!.overage).toBe(0);
    expect(b!.projectedOverageCents).toBe(0);
    expect(b!.subscriptionStatus).toBe("active");
  });

  test("teamC has activity but no plan — quota null, plan null", async () => {
    const { rows } = await svc.listTeamMauUsage();
    const c = rows.find((r) => r.teamId === teamC);
    expect(c).toBeDefined();
    expect(c!.mau).toBe(7);
    expect(c!.quota).toBeNull();
    expect(c!.plan).toBeNull();
    expect(c!.overage).toBe(0);
    expect(c!.subscriptionStatus).toBeNull();
  });

  test("yearMonth is the current calendar month (UTC)", async () => {
    const { yearMonth: returned } = await svc.listTeamMauUsage();
    expect(returned).toMatch(/^\d{4}-\d{2}$/);
    expect(returned).toBe(currentYearMonth());
  });

  test("does not double-count when a team has rows in another month", async () => {
    // Insert a player active in teamA for *last* month — should NOT
    // affect the current-month MAU.
    const otherMonth = "2025-01";
    const stranger = `A-old-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(euUser).values({
      id: stranger,
      name: stranger,
      email: `${stranger}@${teamA}.test`,
      tenantId: teamA,
    });
    await db.insert(mauActivePlayer).values({
      teamId: teamA,
      euUserId: stranger,
      yearMonth: otherMonth,
    });

    const { rows } = await svc.listTeamMauUsage();
    const a = rows.find((r) => r.teamId === teamA);
    // Still 150 — the 2025-01 row doesn't contribute to current MAU.
    expect(a!.mau).toBe(150);
  });
});
