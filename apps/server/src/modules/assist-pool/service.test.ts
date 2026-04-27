/**
 * Service-layer tests for assist-pool.
 *
 * Talk to the real Neon dev branch configured in `.dev.vars` — no mocks.
 * Each test seeds its own test org; ON DELETE CASCADE sweeps rows on
 * `afterAll`. A fresh `EventBus` instance is used per test to avoid
 * cross-test handler leakage.
 *
 * Aliases must be unique within this file because all tests share a
 * single org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createEventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createSeededRng } from "./distribution";
import { createAssistPoolService } from "./service";

describe("assist-pool service", () => {
  const events = createEventBus();
  const svc = createAssistPoolService(
    { db, events },
    { rng: createSeededRng(12345) },
  );
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("assist-pool-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("createConfig persists a decrement + fixed policy", async () => {
    const row = await svc.createConfig(orgId, {
      name: "Cut a Slice",
      alias: "cut-1",
      targetAmount: 100,
      mode: "decrement",
      contributionPolicy: { kind: "fixed", amount: 25 },
    });
    expect(row.alias).toBe("cut-1");
    expect(row.targetAmount).toBe(100);
    expect(row.mode).toBe("decrement");
    expect(row.contributionPolicy).toEqual({ kind: "fixed", amount: 25 });
    expect(row.isActive).toBe(true);
    expect(row.perAssisterLimit).toBe(1);
    expect(row.initiatorCanAssist).toBe(false);
  });

  test("duplicate alias returns a typed conflict", async () => {
    await svc.createConfig(orgId, {
      name: "Dup",
      alias: "dup-alias",
      targetAmount: 10,
      contributionPolicy: { kind: "fixed", amount: 5 },
    });
    await expect(
      svc.createConfig(orgId, {
        name: "Dup 2",
        alias: "dup-alias",
        targetAmount: 10,
        contributionPolicy: { kind: "fixed", amount: 5 },
      }),
    ).rejects.toMatchObject({ code: "assist_pool.alias_conflict" });
  });

  test("listConfigs excludes activity-scoped by default", async () => {
    const scopedId = crypto.randomUUID();
    await svc.createConfig(orgId, {
      name: "Standalone",
      alias: "scope-standalone",
      targetAmount: 10,
      contributionPolicy: { kind: "fixed", amount: 5 },
    });
    await svc.createConfig(orgId, {
      name: "InActivity",
      alias: "scope-activity",
      targetAmount: 10,
      contributionPolicy: { kind: "fixed", amount: 5 },
      activityId: scopedId,
    });
    const standalone = await svc.listConfigs(orgId);
    const aliases = new Set(standalone.items.map((r) => r.alias));
    expect(aliases.has("scope-standalone")).toBe(true);
    expect(aliases.has("scope-activity")).toBe(false);

    const all = await svc.listConfigs(orgId, { includeActivity: true });
    expect(new Set(all.items.map((r) => r.alias)).has("scope-activity")).toBe(true);

    const only = await svc.listConfigs(orgId, { activityId: scopedId });
    expect(only.items.map((r) => r.alias)).toEqual(["scope-activity"]);
  });

  test("initiate + contribute reaches completion exactly at target", async () => {
    await svc.createConfig(orgId, {
      name: "Exact",
      alias: "exact",
      targetAmount: 100,
      mode: "decrement",
      contributionPolicy: { kind: "fixed", amount: 25 },
      perAssisterLimit: 10,
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "exact",
      initiatorEndUserId: "u-init-exact",
    });
    expect(instance.status).toBe("in_progress");
    expect(instance.remaining).toBe(100);

    let res = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-helper-1",
    });
    expect(res.completed).toBe(false);
    expect(res.instance.remaining).toBe(75);
    expect(res.contribution.amount).toBe(25);

    res = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-helper-2",
    });
    res = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-helper-3",
    });
    res = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-helper-4",
    });

    expect(res.completed).toBe(true);
    expect(res.instance.status).toBe("completed");
    expect(res.instance.remaining).toBe(0);
    expect(res.instance.completedAt).toBeInstanceOf(Date);
  });

  test("contribute after completion rejects with already_completed", async () => {
    await svc.createConfig(orgId, {
      name: "One-Shot",
      alias: "one-shot",
      targetAmount: 10,
      contributionPolicy: { kind: "fixed", amount: 10 },
      perAssisterLimit: 5,
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "one-shot",
      initiatorEndUserId: "u-one",
    });
    const first = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-one-helper",
    });
    expect(first.completed).toBe(true);

    await expect(
      svc.contribute({
        organizationId: orgId,
        instanceId: instance.id,
        assisterEndUserId: "u-one-helper-2",
      }),
    ).rejects.toMatchObject({ code: "assist_pool.already_completed" });
  });

  test("perAssisterLimit blocks the same helper twice by default", async () => {
    await svc.createConfig(orgId, {
      name: "Single Help",
      alias: "single-help",
      targetAmount: 100,
      contributionPolicy: { kind: "fixed", amount: 5 },
      perAssisterLimit: 1,
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "single-help",
      initiatorEndUserId: "u-solo",
    });
    await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-helper",
    });
    await expect(
      svc.contribute({
        organizationId: orgId,
        instanceId: instance.id,
        assisterEndUserId: "u-helper",
      }),
    ).rejects.toMatchObject({ code: "assist_pool.assister_limit_reached" });
  });

  test("self-assist blocked by default, allowed when initiatorCanAssist=true", async () => {
    await svc.createConfig(orgId, {
      name: "No Self",
      alias: "no-self",
      targetAmount: 50,
      contributionPolicy: { kind: "fixed", amount: 10 },
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "no-self",
      initiatorEndUserId: "u-self",
    });
    await expect(
      svc.contribute({
        organizationId: orgId,
        instanceId: instance.id,
        assisterEndUserId: "u-self",
      }),
    ).rejects.toMatchObject({ code: "assist_pool.self_assist_forbidden" });

    await svc.createConfig(orgId, {
      name: "Allow Self",
      alias: "allow-self",
      targetAmount: 50,
      contributionPolicy: { kind: "fixed", amount: 10 },
      initiatorCanAssist: true,
    });
    const inst2 = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "allow-self",
      initiatorEndUserId: "u-self-ok",
    });
    const res = await svc.contribute({
      organizationId: orgId,
      instanceId: inst2.id,
      assisterEndUserId: "u-self-ok",
    });
    expect(res.contribution.assisterEndUserId).toBe("u-self-ok");
  });

  test("expired instance rejects further contributions", async () => {
    await svc.createConfig(orgId, {
      name: "Short",
      alias: "short-lived",
      targetAmount: 100,
      contributionPolicy: { kind: "fixed", amount: 10 },
      expiresInSeconds: 1,
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "short-lived",
      initiatorEndUserId: "u-shortlived",
    });
    // Fast-forward by manipulating the DB expires_at directly via
    // force-expire path
    await svc.forceExpireInstance(orgId, instance.id);
    await expect(
      svc.contribute({
        organizationId: orgId,
        instanceId: instance.id,
        assisterEndUserId: "u-latecomer",
      }),
    ).rejects.toMatchObject({ code: "assist_pool.instance_expired" });
  });

  test("accumulate mode completes when remaining reaches target", async () => {
    await svc.createConfig(orgId, {
      name: "Accum",
      alias: "accum",
      targetAmount: 30,
      mode: "accumulate",
      contributionPolicy: { kind: "fixed", amount: 10 },
      perAssisterLimit: 5,
    });
    const instance = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "accum",
      initiatorEndUserId: "u-accum",
    });
    expect(instance.remaining).toBe(0);

    const a = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-a1",
    });
    expect(a.instance.remaining).toBe(10);
    expect(a.completed).toBe(false);

    const b = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-a2",
    });
    expect(b.instance.remaining).toBe(20);

    const c = await svc.contribute({
      organizationId: orgId,
      instanceId: instance.id,
      assisterEndUserId: "u-a3",
    });
    expect(c.instance.remaining).toBe(30);
    expect(c.completed).toBe(true);
  });

  test("maxInstancesPerInitiator caps concurrent in-progress instances", async () => {
    await svc.createConfig(orgId, {
      name: "One Open",
      alias: "one-open",
      targetAmount: 10,
      contributionPolicy: { kind: "fixed", amount: 5 },
      maxInstancesPerInitiator: 1,
    });
    await svc.initiateInstance({
      organizationId: orgId,
      configKey: "one-open",
      initiatorEndUserId: "u-caplimit",
    });
    await expect(
      svc.initiateInstance({
        organizationId: orgId,
        configKey: "one-open",
        initiatorEndUserId: "u-caplimit",
      }),
    ).rejects.toMatchObject({ code: "assist_pool.initiator_limit_reached" });
  });

  test("expireOverdue flips overdue in-progress rows", async () => {
    await svc.createConfig(orgId, {
      name: "Overdue",
      alias: "overdue",
      targetAmount: 100,
      contributionPolicy: { kind: "fixed", amount: 10 },
      expiresInSeconds: 60,
    });
    // Create an instance then rewind expiresAt to the past via force-expire.
    const inst = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "overdue",
      initiatorEndUserId: "u-od",
    });
    // force-expire already flips to expired — to test expireOverdue on
    // still-in-progress rows, create another with very short TTL.
    await svc.createConfig(orgId, {
      name: "Tiny",
      alias: "tiny-ttl",
      targetAmount: 100,
      contributionPolicy: { kind: "fixed", amount: 10 },
      expiresInSeconds: 1,
    });
    const tiny = await svc.initiateInstance({
      organizationId: orgId,
      configKey: "tiny-ttl",
      initiatorEndUserId: "u-tiny",
    });
    // Pass a future `now` to simulate time passing.
    const swept = await svc.expireOverdue({
      now: new Date(Date.now() + 5 * 1000),
    });
    expect(swept).toBeGreaterThanOrEqual(1);

    const after = await svc.getInstance(orgId, tiny.id);
    expect(after.status).toBe("expired");
    // The first instance was force-expired separately; no assertion here
    void inst;
  });

  describe("activity-bound writable gate", () => {
    const HOUR = 3_600_000;
    async function seedActivity(opts: {
      alias: string;
      phaseAt: "active" | "teasing" | "ended";
    }): Promise<string> {
      const { activityConfigs } = await import("../../schema/activity");
      const offsetMap = { active: 0, teasing: -1.5 * HOUR, ended: +2.5 * HOUR };
      const anchor = new Date(Date.now() - offsetMap[opts.phaseAt]);
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

    test("teasing activity → initiateInstance throws activity.not_in_writable_phase", async () => {
      const activityId = await seedActivity({
        alias: "ap-gate-teasing",
        phaseAt: "teasing",
      });
      await svc.createConfig(orgId, {
        name: "Bound teasing",
        alias: "ap-bound-teasing",
        targetAmount: 10,
        contributionPolicy: { kind: "fixed", amount: 5 },
        activityId,
      });
      await expect(
        svc.initiateInstance({
          organizationId: orgId,
          configKey: "ap-bound-teasing",
          initiatorEndUserId: "u-ap-gate-teasing",
        }),
      ).rejects.toMatchObject({ code: "activity.not_in_writable_phase" });
    });

    test("active activity → initiateInstance + contribute both succeed", async () => {
      const activityId = await seedActivity({
        alias: "ap-gate-active",
        phaseAt: "active",
      });
      await svc.createConfig(orgId, {
        name: "Bound active",
        alias: "ap-bound-active",
        targetAmount: 100,
        contributionPolicy: { kind: "fixed", amount: 25 },
        perAssisterLimit: 5,
        activityId,
      });
      const inst = await svc.initiateInstance({
        organizationId: orgId,
        configKey: "ap-bound-active",
        initiatorEndUserId: "u-ap-gate-active",
      });
      expect(inst.status).toBe("in_progress");
      const r = await svc.contribute({
        organizationId: orgId,
        instanceId: inst.id,
        assisterEndUserId: "u-ap-gate-helper",
      });
      expect(r.contribution.amount).toBe(25);
    });
  });
});
