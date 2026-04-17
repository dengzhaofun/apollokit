/**
 * Leaderboard service integration tests — real Neon dev branch.
 *
 * These tests exercise the PG path end-to-end. Redis is swapped for a
 * no-op so the tests don't depend on Upstash being reachable — the
 * service falls back to PG for all reads and writes the same atomic
 * `leaderboard_entries` row either way.
 *
 * Scope:
 *   - createConfig + alias conflict
 *   - contribute fan-out across multiple configs sharing a metricKey
 *   - aggregation modes: sum, max, latest
 *   - activity scoping: activity-bound configs only fire when
 *     contribute carries a matching `activityContext`
 *   - getTop / getNeighbors fallback to PG when Redis unreachable
 *   - settleBucket is idempotent via the snapshots unique key
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createEventBus } from "../../lib/event-bus";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createLeaderboardService } from "./service";

// Redis stub — every method rejects or returns empty; service is
// designed to fall back to PG on failure.
const fakeRedis = {
  zincrby: async () => 0,
  zadd: async () => null,
  zscore: async () => null,
  zrevrank: async () => null,
  zcard: async () => 0,
  zremrangebyrank: async () => 0,
  zrange: async () => [] as string[],
  del: async () => 0,
  set: async () => "OK",
} as unknown as Parameters<typeof createLeaderboardService>[0]["redis"];

describe("leaderboard service", () => {
  const events = createEventBus();
  const svc = createLeaderboardService(
    { db, redis: fakeRedis, events },
    () => null,
  );
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("leaderboard-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("createConfig + alias conflict", async () => {
    await svc.createConfig(orgId, {
      alias: "lb-conflict",
      name: "LB",
      metricKey: "score",
      cycle: "daily",
    });
    await expect(
      svc.createConfig(orgId, {
        alias: "lb-conflict",
        name: "LB2",
        metricKey: "score",
        cycle: "daily",
      }),
    ).rejects.toMatchObject({ code: "leaderboard.alias_conflict" });
  });

  test("contribute fans out to every matching metricKey config", async () => {
    await svc.createConfig(orgId, {
      alias: "fanout-daily",
      name: "Daily",
      metricKey: "pvp_fanout",
      cycle: "daily",
      aggregation: "sum",
    });
    await svc.createConfig(orgId, {
      alias: "fanout-weekly",
      name: "Weekly",
      metricKey: "pvp_fanout",
      cycle: "weekly",
      aggregation: "sum",
    });
    await svc.createConfig(orgId, {
      alias: "fanout-all",
      name: "All",
      metricKey: "pvp_fanout",
      cycle: "all_time",
      aggregation: "sum",
    });

    const result = await svc.contribute({
      organizationId: orgId,
      endUserId: "user-A",
      metricKey: "pvp_fanout",
      value: 42,
      source: "test",
    });

    expect(result.applied).toBe(3);
    expect(result.details.filter((d) => d.skipped).length).toBe(0);
  });

  test("aggregation mode `max` retains the highest score", async () => {
    const cfg = await svc.createConfig(orgId, {
      alias: "agg-max",
      name: "Max Agg",
      metricKey: "max_metric",
      cycle: "all_time",
      aggregation: "max",
    });

    await svc.contribute({
      organizationId: orgId,
      endUserId: "u1",
      metricKey: "max_metric",
      value: 100,
      source: "m1",
    });
    await svc.contribute({
      organizationId: orgId,
      endUserId: "u1",
      metricKey: "max_metric",
      value: 30,
      source: "m1",
    });
    await svc.contribute({
      organizationId: orgId,
      endUserId: "u1",
      metricKey: "max_metric",
      value: 200,
      source: "m1",
    });

    const top = await svc.getTop({
      organizationId: orgId,
      configKey: cfg.alias,
      limit: 5,
    });
    expect(top.rankings[0]?.endUserId).toBe("u1");
    expect(top.rankings[0]?.score).toBe(200);
  });

  test("aggregation mode `latest` overwrites", async () => {
    const cfg = await svc.createConfig(orgId, {
      alias: "agg-latest",
      name: "Latest Agg",
      metricKey: "latest_metric",
      cycle: "all_time",
      aggregation: "latest",
    });
    await svc.contribute({
      organizationId: orgId,
      endUserId: "u1",
      metricKey: "latest_metric",
      value: 500,
      source: "m",
    });
    await svc.contribute({
      organizationId: orgId,
      endUserId: "u1",
      metricKey: "latest_metric",
      value: 10,
      source: "m",
    });
    const top = await svc.getTop({
      organizationId: orgId,
      configKey: cfg.alias,
    });
    expect(top.rankings[0]?.score).toBe(10);
  });

  test("activity-bound config only fires on matching activityContext", async () => {
    const activityIdA = crypto.randomUUID();
    const activityIdB = crypto.randomUUID();

    await svc.createConfig(orgId, {
      alias: "lb-act-a",
      name: "Activity A only",
      metricKey: "act_metric",
      cycle: "all_time",
      activityId: activityIdA,
    });
    await svc.createConfig(orgId, {
      alias: "lb-act-free",
      name: "Unbound",
      metricKey: "act_metric",
      cycle: "all_time",
    });

    // No activity context → only the unbound config matches.
    const r1 = await svc.contribute({
      organizationId: orgId,
      endUserId: "x",
      metricKey: "act_metric",
      value: 5,
    });
    expect(r1.applied).toBe(1);

    // With matching activity → both configs match.
    const r2 = await svc.contribute({
      organizationId: orgId,
      endUserId: "x",
      metricKey: "act_metric",
      value: 5,
      activityContext: { activityId: activityIdA },
    });
    expect(r2.applied).toBe(2);

    // With non-matching activity → only the unbound one.
    const r3 = await svc.contribute({
      organizationId: orgId,
      endUserId: "x",
      metricKey: "act_metric",
      value: 5,
      activityContext: { activityId: activityIdB },
    });
    expect(r3.applied).toBe(1);
  });

  test("getNeighbors returns empty / null self when Redis is empty", async () => {
    const cfg = await svc.createConfig(orgId, {
      alias: "nbr",
      name: "Nbr",
      metricKey: "nbr_metric",
      cycle: "all_time",
    });
    // Stubbed Redis has no data, so neighbors fall back to empty.
    const r = await svc.getNeighbors({
      organizationId: orgId,
      configKey: cfg.alias,
      endUserId: "unknown",
    });
    expect(r.rankings.length).toBe(0);
    expect(r.self?.rank).toBeNull();
  });

  test("settleBucket is idempotent via snapshots unique key", async () => {
    const cfg = await svc.createConfig(orgId, {
      alias: "settle-idem",
      name: "Settle Idem",
      metricKey: "settle_metric",
      cycle: "daily",
      aggregation: "sum",
    });
    await svc.contribute({
      organizationId: orgId,
      endUserId: "u",
      metricKey: "settle_metric",
      value: 10,
    });

    // First settle — produces a snapshot.
    await svc.settleBucket({
      config: cfg,
      cycleKey: "2026-01-01",
      scopeKey: orgId,
    });
    const snaps = await svc.listSnapshots({
      organizationId: orgId,
      configKey: cfg.alias,
    });
    const before = snaps.length;

    // Second settle with same (cycle, scope) — must be a no-op.
    await svc.settleBucket({
      config: cfg,
      cycleKey: "2026-01-01",
      scopeKey: orgId,
    });
    const after = await svc.listSnapshots({
      organizationId: orgId,
      configKey: cfg.alias,
    });
    expect(after.length).toBe(before);
  });
});
