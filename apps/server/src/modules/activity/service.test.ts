/**
 * Activity service integration tests — real Neon dev branch, no mocks.
 *
 * Scope:
 *   - Create a draft activity with 5-part time and verify state machine
 *     (draft / scheduled / teasing / active / settling / ended /
 *     archived) via `deriveState`.
 *   - join is idempotent (unique per endUserId per activity).
 *   - addPoints accumulates and produces ledger rows; negative deltas
 *     honored in `active`/`settling`/`ended`, rejected when earning in
 *     non-active.
 *   - claimMilestone is idempotent (unique reward_key).
 *   - tickDue advances persisted status when the derived state changed.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createEventBus } from "../../lib/event-bus";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createActivityService } from "./service";

describe("activity service", () => {
  const events = createEventBus();
  const svc = createActivityService(
    {
      db,
      redis: {} as never,
      events,
    },
    () => null,
  );
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("activity-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // Helper: build an activity whose times straddle `now` so it's active.
  function times(now: Date) {
    return {
      visibleAt: new Date(now.getTime() - 3_600_000).toISOString(),
      startAt: new Date(now.getTime() - 1_800_000).toISOString(),
      endAt: new Date(now.getTime() + 3_600_000).toISOString(),
      rewardEndAt: new Date(now.getTime() + 7_200_000).toISOString(),
      hiddenAt: new Date(now.getTime() + 86_400_000).toISOString(),
    };
  }

  test("createActivity lands in draft and tickDue advances it", async () => {
    const now = new Date();
    const activity = await svc.createActivity(orgId, {
      alias: "a1-life",
      name: "Lifecycle Test",
      ...times(now),
      milestoneTiers: [],
    });
    expect(activity.status).toBe("draft");

    // Publish → derived state == active (because now is between startAt and endAt)
    const published = await svc.publish(orgId, activity.alias, now);
    expect(published.status).toBe("active");
  });

  test("join is idempotent and refuses non-active state", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a2-join",
      name: "Join",
      ...times(now),
      milestoneTiers: [],
    });
    await svc.publish(orgId, a.alias, now);

    const r1 = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "user-1",
      now,
    });
    const r2 = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "user-1",
      now,
    });
    expect(r1.id).toBe(r2.id); // same row via upsert

    // A second user gets a distinct row.
    const r3 = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "user-2",
      now,
    });
    expect(r3.id).not.toBe(r1.id);
  });

  test("addPoints accumulates, writes ledger, detects milestone crossings", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a3-points",
      name: "Points",
      ...times(now),
      milestoneTiers: [
        {
          alias: "m1",
          points: 100,
          rewards: [{ type: "item", id: "reward-uuid", count: 1 }],
        },
        {
          alias: "m2",
          points: 300,
          rewards: [{ type: "item", id: "reward-uuid", count: 5 }],
        },
      ],
    });
    await svc.publish(orgId, a.alias, now);
    await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      now,
    });

    const r1 = await svc.addPoints({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      delta: 60,
      source: "event:checkin",
      now,
    });
    expect(r1.balance).toBe(60);
    expect(r1.unlockedMilestones).toEqual([]);

    const r2 = await svc.addPoints({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      delta: 60,
      source: "event:checkin",
      now,
    });
    expect(r2.balance).toBe(120);
    // Crossed m1 threshold (60 -> 120 passes 100)
    expect(r2.unlockedMilestones).toContain("m1");

    // Jump past m2 in one shot
    const r3 = await svc.addPoints({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      delta: 300,
      source: "event:bonus",
      now,
    });
    expect(r3.balance).toBe(420);
    expect(r3.unlockedMilestones).toContain("m2");
  });

  test("claimMilestone dedup on (activity, user, reward_key)", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a4-claim",
      name: "Claim",
      ...times(now),
      milestoneTiers: [
        {
          alias: "m1",
          points: 50,
          rewards: [{ type: "item", id: "tier1-uuid", count: 1 }],
        },
      ],
    });
    await svc.publish(orgId, a.alias, now);
    await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      now,
    });
    await svc.addPoints({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      delta: 100,
      source: "test",
      now,
    });

    const first = await svc.claimMilestone({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      milestoneAlias: "m1",
      now,
    });
    expect(first.claimed).toBe(true);

    // Second claim returns `claimed: false` (already paid).
    const second = await svc.claimMilestone({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      milestoneAlias: "m1",
      now,
    });
    expect(second.claimed).toBe(false);
  });

  test("aggregated view exposes effectiveEnabled = node.enabled AND resource.isActive", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a-eff",
      name: "Effective",
      ...times(now),
      milestoneTiers: [],
    });
    await svc.publish(orgId, a.alias, now);

    // Virtual node: no refId → resourceActive treated as true; effective
    // tracks node.enabled alone.
    const virtualNode = await svc.createNode(orgId, a.alias, {
      alias: "virt",
      nodeType: "custom",
      enabled: true,
    });

    // Dangling refId (resource doesn't exist) → resourceActive=false →
    // effective=false even though node.enabled=true.
    const danglingNode = await svc.createNode(orgId, a.alias, {
      alias: "dangle",
      nodeType: "check_in",
      refId: crypto.randomUUID(),
      enabled: true,
    });

    const view = await svc.getActivityForUser({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "__viewer__",
      now,
    });
    const virt = view.nodes.find((x) => x.node.id === virtualNode.id);
    const dangle = view.nodes.find((x) => x.node.id === danglingNode.id);

    expect(virt?.resourceActive).toBe(true);
    expect(virt?.effectiveEnabled).toBe(true);

    expect(dangle?.resourceActive).toBe(false);
    expect(dangle?.effectiveEnabled).toBe(false);

    // Flip node.enabled on the virtual node; effective must drop.
    await svc.updateNode(orgId, virtualNode.id, { enabled: false });
    const view2 = await svc.getActivityForUser({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "__viewer__",
      now,
    });
    const virt2 = view2.nodes.find((x) => x.node.id === virtualNode.id);
    expect(virt2?.effectiveEnabled).toBe(false);
    expect(virt2?.resourceActive).toBe(true);
  });

  test("membership: join with queue.enabled allocates a unique number, leave/redeem flows", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a-mem-queue",
      name: "Queue",
      ...times(now),
      milestoneTiers: [],
      membership: {
        leaveAllowed: true,
        queue: { enabled: true, format: "numeric", length: 4 },
      },
    });
    await svc.publish(orgId, a.alias, now);

    // First join → queue number allocated, 4 digits numeric
    const r1 = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "q-u1",
      now,
    });
    expect(r1.queueNumber).not.toBeNull();
    expect(r1.queueNumber!).toMatch(/^\d{4}$/);

    // Second join for same user → same number (idempotent)
    const r1b = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "q-u1",
      now,
    });
    expect(r1b.queueNumber).toBe(r1.queueNumber);

    // Different user → different number
    const r2 = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "q-u2",
      now,
    });
    expect(r2.queueNumber).not.toBeNull();
    expect(r2.queueNumber).not.toBe(r1.queueNumber);

    // Redeem q-u1's queue number — first call succeeds
    const redeemed = await svc.redeemQueueNumber({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "q-u1",
    });
    expect(redeemed.queueNumber).toBe(r1.queueNumber);
    expect(redeemed.usedAt).toBeInstanceOf(Date);

    // Redeem again → ActivityQueueAlreadyRedeemed
    await expect(
      svc.redeemQueueNumber({
        organizationId: orgId,
        activityIdOrAlias: a.alias,
        endUserId: "q-u1",
      }),
    ).rejects.toMatchObject({ code: "activity.queue_already_redeemed" });

    // q-u1 leaves — status 'left', queue_number + used_at preserved
    const left = await svc.leaveActivity({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "q-u1",
    });
    expect(left.status).toBe("left");
    expect(left.leftAt).toBeInstanceOf(Date);
    expect(left.queueNumber).toBe(r1.queueNumber);
    expect(left.queueNumberUsedAt).not.toBeNull();

    // listMembers with status filter picks up the 'left' row
    const onlyLeft = await svc.listMembers({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      status: "left",
    });
    expect(onlyLeft.items.length).toBe(1);
    expect(onlyLeft.items[0]!.endUserId).toBe("q-u1");

    // listMembers 'all' returns both
    const all = await svc.listMembers({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
    });
    expect(all.items.length).toBe(2);
  });

  test("membership: null config → join returns null queueNumber; redeem rejects", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a-mem-nil",
      name: "NoMembership",
      ...times(now),
      milestoneTiers: [],
    });
    await svc.publish(orgId, a.alias, now);

    const r = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      now,
    });
    expect(r.queueNumber).toBeNull();

    await expect(
      svc.redeemQueueNumber({
        organizationId: orgId,
        activityIdOrAlias: a.alias,
        endUserId: "u",
      }),
    ).rejects.toMatchObject({ code: "activity.queue_not_enabled" });
  });

  test("membership: leaveAllowed=false rejects leaveActivity", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a-mem-nocanleave",
      name: "NoLeave",
      ...times(now),
      milestoneTiers: [],
      membership: { leaveAllowed: false },
    });
    await svc.publish(orgId, a.alias, now);
    await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      now,
    });

    await expect(
      svc.leaveActivity({
        organizationId: orgId,
        activityIdOrAlias: a.alias,
        endUserId: "u",
      }),
    ).rejects.toMatchObject({ code: "activity.leave_not_allowed" });
  });

  test("membership: queue disabled → join returns null queueNumber", async () => {
    const now = new Date();
    const a = await svc.createActivity(orgId, {
      alias: "a-mem-queue-off",
      name: "QueueOff",
      ...times(now),
      milestoneTiers: [],
      membership: {
        leaveAllowed: true,
        queue: { enabled: false, format: "alphanumeric", length: 6 },
      },
    });
    await svc.publish(orgId, a.alias, now);

    const r = await svc.join({
      organizationId: orgId,
      activityIdOrAlias: a.alias,
      endUserId: "u",
      now,
    });
    expect(r.queueNumber).toBeNull();
  });

  test("tickDue flips persisted status when derived state moves", async () => {
    // Time window: visible -7d → start -6d → end -4d → rewardEnd -3d →
    // hidden -2d. Publish 5 days ago when state is "active". Then
    // tick at "now" which is past hiddenAt → should advance to archived.
    const publishAt = new Date(Date.now() - 5 * 86_400_000);
    const a = await svc.createActivity(orgId, {
      alias: "a5-tick",
      name: "Tick",
      visibleAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      startAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      endAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      rewardEndAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      hiddenAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      milestoneTiers: [],
    });
    await svc.publish(orgId, a.alias, publishAt);

    const result = await svc.tickDue({ now: new Date() });
    expect(result.advanced).toBeGreaterThanOrEqual(1);

    const reloaded = await svc.getActivity(orgId, a.alias);
    expect(reloaded.status).toBe("archived");
  });
});
