/**
 * Service-layer tests for check-in.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` —
 * no mocks. The `createCheckInService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every config and user_state row.
 *
 * All test-specific aliases must be unique within this file because
 * they share the single test org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCheckInService } from "./service";

describe("check-in service", () => {
  const svc = createCheckInService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("check-in-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("first check-in, none mode, no target", async () => {
    await svc.createConfig(orgId, {
      name: "None No-Target",
      alias: "none-nt",
      resetMode: "none",
      timezone: "Asia/Shanghai",
    });
    const r = await svc.checkIn({
      organizationId: orgId,
      configKey: "none-nt",
      endUserId: "u-none-nt",
    });
    expect(r.alreadyCheckedIn).toBe(false);
    expect(r.justCompleted).toBe(false);
    expect(r.state.totalDays).toBe(1);
    expect(r.state.currentStreak).toBe(1);
    expect(r.state.longestStreak).toBe(1);
    expect(r.state.currentCycleKey).toBe("all");
    expect(r.state.currentCycleDays).toBe(1);
    expect(r.target).toBeNull();
    expect(r.isCompleted).toBe(false);
    expect(r.remaining).toBeNull();
    expect(r.state.firstCheckInAt).toBeInstanceOf(Date);
    expect(r.state.lastCheckInAt).toBeInstanceOf(Date);
  });

  test("repeat check-in same day is idempotent", async () => {
    await svc.createConfig(orgId, {
      name: "Idempotent",
      alias: "idem",
      resetMode: "none",
      timezone: "Asia/Shanghai",
    });
    const a = await svc.checkIn({
      organizationId: orgId,
      configKey: "idem",
      endUserId: "u-idem",
    });
    const b = await svc.checkIn({
      organizationId: orgId,
      configKey: "idem",
      endUserId: "u-idem",
    });
    expect(a.alreadyCheckedIn).toBe(false);
    expect(b.alreadyCheckedIn).toBe(true);
    expect(b.justCompleted).toBe(false);
    expect(b.state.totalDays).toBe(a.state.totalDays);
    expect(b.state.currentStreak).toBe(a.state.currentStreak);
    // firstCheckInAt should be preserved across the "already" path.
    expect(b.state.firstCheckInAt?.toISOString()).toBe(
      a.state.firstCheckInAt?.toISOString(),
    );
  });

  test("target=1 flips justCompleted on first check-in, false on repeat", async () => {
    await svc.createConfig(orgId, {
      name: "Instant",
      alias: "instant",
      resetMode: "none",
      target: 1,
      timezone: "Asia/Shanghai",
    });
    const a = await svc.checkIn({
      organizationId: orgId,
      configKey: "instant",
      endUserId: "u-instant",
    });
    expect(a.justCompleted).toBe(true);
    expect(a.isCompleted).toBe(true);
    expect(a.remaining).toBe(0);

    const b = await svc.checkIn({
      organizationId: orgId,
      configKey: "instant",
      endUserId: "u-instant",
    });
    expect(b.alreadyCheckedIn).toBe(true);
    expect(b.justCompleted).toBe(false);
    expect(b.isCompleted).toBe(true);
    expect(b.remaining).toBe(0);
  });

  test("week mode populates cycleKey and remaining reflects target", async () => {
    await svc.createConfig(orgId, {
      name: "Weekly",
      alias: "weekly",
      resetMode: "week",
      target: 5,
      timezone: "Asia/Shanghai",
    });
    const r = await svc.checkIn({
      organizationId: orgId,
      configKey: "weekly",
      endUserId: "u-weekly",
    });
    expect(r.state.currentCycleKey).toMatch(/^\d{4}-\d{2}$/);
    expect(r.target).toBe(5);
    expect(r.isCompleted).toBe(false);
    expect(r.remaining).toBe(4);
  });

  test("createConfig rejects target above week limit", async () => {
    await expect(
      svc.createConfig(orgId, {
        name: "Bad",
        alias: "bad-week",
        resetMode: "week",
        target: 8,
        timezone: "Asia/Shanghai",
      }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("createConfig rejects zero target", async () => {
    await expect(
      svc.createConfig(orgId, {
        name: "Bad",
        alias: "bad-zero",
        resetMode: "none",
        target: 0,
        timezone: "Asia/Shanghai",
      }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("alias collision surfaces typed error", async () => {
    await svc.createConfig(orgId, {
      name: "First",
      alias: "dup-alias",
      resetMode: "none",
      timezone: "Asia/Shanghai",
    });
    await expect(
      svc.createConfig(orgId, {
        name: "Second",
        alias: "dup-alias",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    ).rejects.toMatchObject({ code: "check_in.alias_conflict" });
  });

  test("deleteConfig cascades user_states", async () => {
    const cfg = await svc.createConfig(orgId, {
      name: "To Delete",
      alias: "to-delete",
      resetMode: "none",
      timezone: "Asia/Shanghai",
    });
    await svc.checkIn({
      organizationId: orgId,
      configKey: "to-delete",
      endUserId: "u-del",
    });
    await svc.deleteConfig(orgId, cfg.id);
    await expect(
      svc.getConfig(orgId, "to-delete"),
    ).rejects.toMatchObject({ code: "check_in.config_not_found" });
    // Probing the cascade explicitly: the user state row referenced the
    // deleted config via FK cascade, so any lookup via the (now-missing)
    // config key should surface config-not-found, not a stale state.
    await expect(
      svc.getUserState({
        organizationId: orgId,
        configKey: cfg.id,
        endUserId: "u-del",
      }),
    ).rejects.toMatchObject({ code: "check_in.config_not_found" });
  });

  test("consecutive days across natural-day boundaries increment streak", async () => {
    await svc.createConfig(orgId, {
      name: "Streak",
      alias: "streak",
      resetMode: "none",
      timezone: "Asia/Shanghai",
    });
    const userId = "u-streak";
    // 10:00 local on three separate days (Shanghai = UTC+8). Noon keeps
    // us safely away from midnight edge cases in timezone conversion.
    const day1 = new Date("2026-04-10T02:00:00Z"); // 10:00 Shanghai
    const day2 = new Date("2026-04-11T02:00:00Z");
    const day3 = new Date("2026-04-12T02:00:00Z");
    const day5 = new Date("2026-04-14T02:00:00Z"); // skip day 4

    const r1 = await svc.checkIn({
      organizationId: orgId,
      configKey: "streak",
      endUserId: userId,
      now: day1,
    });
    expect(r1.state.currentStreak).toBe(1);

    const r2 = await svc.checkIn({
      organizationId: orgId,
      configKey: "streak",
      endUserId: userId,
      now: day2,
    });
    expect(r2.state.currentStreak).toBe(2);
    expect(r2.state.totalDays).toBe(2);

    const r3 = await svc.checkIn({
      organizationId: orgId,
      configKey: "streak",
      endUserId: userId,
      now: day3,
    });
    expect(r3.state.currentStreak).toBe(3);
    expect(r3.state.longestStreak).toBe(3);

    const r5 = await svc.checkIn({
      organizationId: orgId,
      configKey: "streak",
      endUserId: userId,
      now: day5,
    });
    // Gap of one day → streak resets to 1, longest preserves the peak.
    expect(r5.state.currentStreak).toBe(1);
    expect(r5.state.longestStreak).toBe(3);
    expect(r5.state.totalDays).toBe(4);
  });

  test("getUserState returns synthetic zero state for unknown user", async () => {
    await svc.createConfig(orgId, {
      name: "Empty",
      alias: "empty",
      resetMode: "none",
      target: 3,
      timezone: "Asia/Shanghai",
    });
    const view = await svc.getUserState({
      organizationId: orgId,
      configKey: "empty",
      endUserId: "nobody",
    });
    expect(view.state.totalDays).toBe(0);
    expect(view.state.currentStreak).toBe(0);
    expect(view.state.lastCheckInDate).toBeNull();
    expect(view.target).toBe(3);
    expect(view.isCompleted).toBe(false);
    expect(view.remaining).toBe(3);
  });

  test("updateConfig rejects changing target above resetMode limit", async () => {
    const cfg = await svc.createConfig(orgId, {
      name: "PatchTarget",
      alias: "patch-target",
      resetMode: "month",
      timezone: "Asia/Shanghai",
    });
    await expect(
      svc.updateConfig(orgId, cfg.id, { target: 32 }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("listConfigs is scoped to organization", async () => {
    const page = await svc.listConfigs(orgId);
    // Every config we created above should be visible and all rows must
    // belong to the current test org.
    expect(page.items.length).toBeGreaterThan(0);
    for (const row of page.items) {
      expect(row.organizationId).toBe(orgId);
    }
  });

  test("createReward rejects dayNumber above week mode limit", async () => {
    await svc.createConfig(orgId, {
      name: "RewardWeek",
      alias: "rw-week",
      resetMode: "week",
      timezone: "UTC",
    });
    await expect(
      svc.createReward(orgId, "rw-week", {
        dayNumber: 8,
        rewardItems: [{ type: "currency", id: "gold", count: 100 }],
      }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("createReward rejects dayNumber above month mode limit", async () => {
    await svc.createConfig(orgId, {
      name: "RewardMonth",
      alias: "rw-month",
      resetMode: "month",
      timezone: "UTC",
    });
    await expect(
      svc.createReward(orgId, "rw-month", {
        dayNumber: 32,
        rewardItems: [{ type: "currency", id: "gold", count: 100 }],
      }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("createReward rejects dayNumber above none-mode target", async () => {
    await svc.createConfig(orgId, {
      name: "RewardTarget",
      alias: "rw-target",
      resetMode: "none",
      target: 10,
      timezone: "UTC",
    });
    await expect(
      svc.createReward(orgId, "rw-target", {
        dayNumber: 11,
        rewardItems: [{ type: "currency", id: "gold", count: 100 }],
      }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });

  test("createReward accepts large dayNumber when none-mode has no target", async () => {
    await svc.createConfig(orgId, {
      name: "RewardFreeform",
      alias: "rw-freeform",
      resetMode: "none",
      timezone: "UTC",
    });
    const row = await svc.createReward(orgId, "rw-freeform", {
      dayNumber: 999,
      rewardItems: [{ type: "currency", id: "gold", count: 100 }],
    });
    expect(row.dayNumber).toBe(999);
  });

  test("updateReward rejects dayNumber going out of cycle bounds", async () => {
    await svc.createConfig(orgId, {
      name: "RewardPatch",
      alias: "rw-patch",
      resetMode: "week",
      timezone: "UTC",
    });
    const row = await svc.createReward(orgId, "rw-patch", {
      dayNumber: 3,
      rewardItems: [{ type: "currency", id: "gold", count: 100 }],
    });
    await expect(
      svc.updateReward(orgId, row.id, { dayNumber: 9 }),
    ).rejects.toMatchObject({ code: "check_in.invalid_input" });
  });
});

describe("check-in service — activity-bound writable gate", () => {
  const svc = createCheckInService({ db });
  let orgId: string;
  const HOUR = 3_600_000;

  beforeAll(async () => {
    orgId = await createTestOrg("check-in-svc-gate");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  /** Seed an activity at a chosen phase relative to `now`. */
  async function seedActivity(opts: {
    alias: string;
    phaseAt: "active" | "teasing" | "settling" | "ended";
  }): Promise<string> {
    const { activityConfigs } = await import("../../schema/activity");
    const now = Date.now();
    const offsetMap = {
      active: 0,
      teasing: -1.5 * HOUR, // anchor in past so now is between visibleAt and startAt
      settling: +1.5 * HOUR, // anchor in past so now is between endAt and rewardEndAt
      ended: +2.5 * HOUR, // anchor far enough in past that now > rewardEndAt
    };
    const anchor = new Date(now - offsetMap[opts.phaseAt]);
    const [row] = await db
      .insert(activityConfigs)
      .values({
        organizationId: orgId,
        alias: opts.alias,
        name: `gate-${opts.alias}`,
        kind: "generic",
        status: "active",
        visibleAt: new Date(anchor.getTime() - 2 * HOUR),
        startAt: new Date(anchor.getTime() - HOUR),
        endAt: new Date(anchor.getTime() + HOUR),
        rewardEndAt: new Date(anchor.getTime() + 2 * HOUR),
        hiddenAt: new Date(anchor.getTime() + 24 * HOUR),
      })
      .returning({ id: activityConfigs.id });
    return row!.id;
  }

  test("active activity → check-in succeeds", async () => {
    const activityId = await seedActivity({ alias: "g-active", phaseAt: "active" });
    const cfg = await svc.createConfig(orgId, {
      name: "Active",
      alias: "ci-active",
      resetMode: "none",
      timezone: "UTC",
      activityId,
    });
    expect(cfg.activityId).toBe(activityId);
    const r = await svc.checkIn({
      organizationId: orgId,
      configKey: "ci-active",
      endUserId: "u-gate-active",
    });
    expect(r.alreadyCheckedIn).toBe(false);
    expect(r.state.totalDays).toBe(1);
  });

  test.each(["teasing", "settling", "ended"] as const)(
    "%s activity → check-in throws activity.not_in_writable_phase, no row written",
    async (phase) => {
      const activityId = await seedActivity({
        alias: `g-${phase}`,
        phaseAt: phase,
      });
      await svc.createConfig(orgId, {
        name: phase,
        alias: `ci-${phase}`,
        resetMode: "none",
        timezone: "UTC",
        activityId,
      });
      await expect(
        svc.checkIn({
          organizationId: orgId,
          configKey: `ci-${phase}`,
          endUserId: `u-${phase}`,
        }),
      ).rejects.toMatchObject({ code: "activity.not_in_writable_phase" });

      const view = await svc.getUserState({
        organizationId: orgId,
        configKey: `ci-${phase}`,
        endUserId: `u-${phase}`,
      });
      expect(view.state.totalDays).toBe(0);
    },
  );

  test("activityId=null config is unaffected by gate (regression)", async () => {
    await svc.createConfig(orgId, {
      name: "Standalone",
      alias: "ci-standalone",
      resetMode: "none",
      timezone: "UTC",
    });
    const r = await svc.checkIn({
      organizationId: orgId,
      configKey: "ci-standalone",
      endUserId: "u-standalone",
    });
    expect(r.state.totalDays).toBe(1);
  });
});
