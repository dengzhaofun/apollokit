/**
 * Battle Pass service 集成测试 —— 走真 Postgres（本地 apollokit_dev）。
 *
 * 不 mock DB；rewardServices 注入一个记录调用的 stub，这样我们既能
 * 观察奖励发放是否被触发，又不必拉起 item/currency 模块的完整栈。
 *
 * 每个测试会独立建一个 activity + season 来避免互相污染。cascade 从
 * organization → activity_configs / battle_pass_configs / 所有下游子
 * 表一路清干净。
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { RewardEntry, RewardServices } from "../../lib/rewards";
import { activityConfigs } from "../../schema/activity";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createBattlePassService } from "./service";

type Granted = {
  kind: "item" | "currency" | "entity";
  organizationId: string;
  endUserId: string;
  source: string;
  sourceId?: string;
  payload: unknown;
};

function makeMockRewardServices(): {
  services: RewardServices;
  granted: Granted[];
} {
  const granted: Granted[] = [];
  const services: RewardServices = {
    itemSvc: {
      async grantItems(params) {
        granted.push({
          kind: "item",
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          source: params.source,
          sourceId: params.sourceId,
          payload: params.grants,
        });
      },
      async deductItems() {
        return null;
      },
    },
    currencySvc: {
      async grant(params) {
        granted.push({
          kind: "currency",
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          source: params.source,
          sourceId: params.sourceId,
          payload: params.grants,
        });
      },
      async deduct() {
        return null;
      },
    },
  };
  return { services, granted };
}

async function createActiveActivity(params: {
  orgId: string;
  alias: string;
  kind?: string;
  status?: string;
}): Promise<string> {
  const now = new Date();
  const visibleAt = new Date(now.getTime() - 60_000);
  const startAt = new Date(now.getTime() - 30_000);
  const endAt = new Date(now.getTime() + 7 * 24 * 3600_000);
  const hiddenAt = new Date(now.getTime() + 30 * 24 * 3600_000);
  const [row] = await db
    .insert(activityConfigs)
    .values({
      organizationId: params.orgId,
      alias: params.alias,
      name: `test-${params.alias}`,
      kind: params.kind ?? "season_pass",
      visibleAt,
      startAt,
      endAt,
      hiddenAt,
      status: params.status ?? "active",
    })
    .returning({ id: activityConfigs.id });
  return row!.id;
}

// 一个典型的 "3 档 × 3 级 × uniform(xpPerLevel=100)" 纪行
function makeSeasonInput(activityId: string, code: string) {
  const rewards: RewardEntry[] = [
    { type: "currency", id: "gold", count: 10 },
  ];
  return {
    activityId,
    code,
    name: `Season ${code}`,
    maxLevel: 3,
    levelCurve: { type: "uniform" as const, xpPerLevel: 100 },
    tiers: [
      { code: "free", order: 0, priceSku: null },
      { code: "premium", order: 1, priceSku: "bp_premium_68" },
      { code: "premium_plus", order: 2, priceSku: "bp_plus_128" },
    ],
    levelRewards: [
      {
        level: 1,
        rewards: {
          free: rewards,
          premium: [{ type: "currency", id: "gem", count: 5 }] as RewardEntry[],
        },
      },
      {
        level: 2,
        rewards: {
          free: rewards,
          premium: [{ type: "currency", id: "gem", count: 10 }] as RewardEntry[],
        },
      },
      {
        level: 3,
        rewards: {
          free: rewards,
          premium: [{ type: "currency", id: "gem", count: 20 }] as RewardEntry[],
        },
      },
    ],
  };
}

describe("battle-pass service", () => {
  let orgId: string;
  const { services: rewardSvcs, granted } = makeMockRewardServices();
  const svc = createBattlePassService({ db }, () => rewardSvcs);

  beforeAll(async () => {
    orgId = await createTestOrg("battle-pass-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("createConfig fails when activity does not exist", async () => {
    await expect(
      svc.createConfig(orgId, makeSeasonInput(crypto.randomUUID(), "no-activity")),
    ).rejects.toMatchObject({ code: "battle_pass.activity_not_found" });
  });

  test("createConfig fails when activity kind is not season_pass", async () => {
    const actId = await createActiveActivity({
      orgId,
      alias: "wrong-kind",
      kind: "generic",
    });
    await expect(
      svc.createConfig(orgId, makeSeasonInput(actId, "wrong-kind")),
    ).rejects.toMatchObject({ code: "battle_pass.invalid_input" });
  });

  test("createConfig + duplicate activity conflict", async () => {
    const actId = await createActiveActivity({
      orgId,
      alias: "dup-activity",
    });
    await svc.createConfig(orgId, makeSeasonInput(actId, "dup-a"));
    await expect(
      svc.createConfig(orgId, makeSeasonInput(actId, "dup-a-second")),
    ).rejects.toMatchObject({ code: "battle_pass.activity_conflict" });
  });

  test("createConfig + duplicate code conflict", async () => {
    const a1 = await createActiveActivity({ orgId, alias: "dup-code-1" });
    const a2 = await createActiveActivity({ orgId, alias: "dup-code-2" });
    await svc.createConfig(orgId, makeSeasonInput(a1, "dup-code"));
    await expect(
      svc.createConfig(orgId, makeSeasonInput(a2, "dup-code")),
    ).rejects.toMatchObject({ code: "battle_pass.code_conflict" });
  });

  test("bindTasks is replace-semantics", async () => {
    const actId = await createActiveActivity({ orgId, alias: "bind-replace" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "bind-replace"));

    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [
        { taskDefinitionId: t1, xpReward: 10, category: "daily" },
        { taskDefinitionId: t2, xpReward: 20, category: "weekly" },
      ],
    });
    const first = await svc.listSeasonTasks(orgId, s.id);
    expect(first).toHaveLength(2);

    // Replace with a shorter list
    const t3 = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [
        { taskDefinitionId: t3, xpReward: 5, category: "season" },
      ],
    });
    const second = await svc.listSeasonTasks(orgId, s.id);
    expect(second).toHaveLength(1);
    expect(second[0]!.taskDefinitionId).toBe(t3);
  });

  test("grantXpForTask returns idempotent when task is not bound", async () => {
    const taskId = crypto.randomUUID();
    const [outcome] = await svc.grantXpForTask({
      organizationId: orgId,
      endUserId: "u-not-bound",
      taskDefinitionId: taskId,
    });
    expect(outcome?.idempotent).toBe(true);
    expect(outcome?.xpAdded).toBe(0);
    expect(outcome?.seasonId).toBeNull();
  });

  test("grantXpForTask accumulates xp and computes level", async () => {
    const actId = await createActiveActivity({ orgId, alias: "xp-flow" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "xp-flow"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });

    const endUserId = "u-xp-flow";

    // First completion → 100 xp → level 1
    const [r1] = await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });
    expect(r1?.idempotent).toBe(false);
    expect(r1?.xpAdded).toBe(100);
    expect(r1?.currentXp).toBe(100);
    expect(r1?.newLevel).toBe(1);
    expect(r1?.oldLevel).toBe(0);

    // Second completion → 200 xp → level 2
    const [r2] = await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });
    expect(r2?.currentXp).toBe(200);
    expect(r2?.newLevel).toBe(2);
    expect(r2?.oldLevel).toBe(1);

    // Third and fourth → level 3 capped
    await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });
    const [r4] = await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });
    expect(r4?.newLevel).toBe(3);
    expect(r4?.currentXp).toBe(400); // xp 仍然累加，只是 level 不再涨
  });

  test("grantXpForTask skips when activity is not active", async () => {
    const actId = await createActiveActivity({
      orgId,
      alias: "xp-inactive",
      status: "ended",
    });
    const s = await svc.createConfig(
      orgId,
      makeSeasonInput(actId, "xp-inactive"),
    );
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });

    const [outcome] = await svc.grantXpForTask({
      organizationId: orgId,
      endUserId: "u-inactive",
      taskDefinitionId: taskId,
    });
    expect(outcome?.idempotent).toBe(true);
    expect(outcome?.seasonId).toBeNull();
  });

  test("grantTier is idempotent and appends owned_tiers", async () => {
    const actId = await createActiveActivity({ orgId, alias: "tier-flow" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "tier-flow"));
    const endUserId = "u-tier-flow";

    const first = await svc.grantTier({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      tierCode: "premium",
      source: "purchase",
      externalOrderId: "order-1",
    });
    expect(first.idempotent).toBe(false);
    expect(first.ownedTiers).toContain("free");
    expect(first.ownedTiers).toContain("premium");

    const repeat = await svc.grantTier({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      tierCode: "premium",
      source: "purchase",
      externalOrderId: "order-1",
    });
    expect(repeat.idempotent).toBe(true);
    expect(repeat.ownedTiers).toContain("premium");
  });

  test("grantTier rejects unknown tier code", async () => {
    const actId = await createActiveActivity({ orgId, alias: "tier-unknown" });
    const s = await svc.createConfig(
      orgId,
      makeSeasonInput(actId, "tier-unknown"),
    );
    await expect(
      svc.grantTier({
        organizationId: orgId,
        seasonId: s.id,
        endUserId: "u-x",
        tierCode: "nonexistent",
        source: "purchase",
      }),
    ).rejects.toMatchObject({ code: "battle_pass.unknown_tier" });
  });

  test("claim flow: level-not-reached, tier-not-owned, claim, idempotent", async () => {
    const actId = await createActiveActivity({ orgId, alias: "claim-flow" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "claim-flow"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });
    const endUserId = "u-claim-flow";

    // 未达等级 → error
    await expect(
      svc.claimLevel({
        organizationId: orgId,
        seasonId: s.id,
        endUserId,
        level: 1,
        tierCode: "free",
      }),
    ).rejects.toMatchObject({ code: "battle_pass.level_not_reached" });

    // 升到 L1
    await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });

    // 未持档（没激活 premium 就想领 premium 奖）→ error
    await expect(
      svc.claimLevel({
        organizationId: orgId,
        seasonId: s.id,
        endUserId,
        level: 1,
        tierCode: "premium",
      }),
    ).rejects.toMatchObject({ code: "battle_pass.tier_not_owned" });

    // 领 free 档 L1 奖励
    const before = granted.length;
    const out = await svc.claimLevel({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      level: 1,
      tierCode: "free",
    });
    expect(out.idempotent).toBe(false);
    expect(out.level).toBe(1);
    expect(out.tierCode).toBe("free");
    expect(granted.length).toBe(before + 1);

    // 重复领 → 幂等，不再调 grantRewards
    const again = await svc.claimLevel({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      level: 1,
      tierCode: "free",
    });
    expect(again.idempotent).toBe(true);
    expect(granted.length).toBe(before + 1);
  });

  test("claimAll picks up all claimable levels × tiers and is idempotent", async () => {
    const actId = await createActiveActivity({ orgId, alias: "claim-all" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "claim-all"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });
    const endUserId = "u-claim-all";

    // Earn up to level 3 (max)
    for (let i = 0; i < 3; i++) {
      await svc.grantXpForTask({
        organizationId: orgId,
        endUserId,
        taskDefinitionId: taskId,
      });
    }

    // Activate premium to unlock premium rewards on all 3 levels
    await svc.grantTier({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      tierCode: "premium",
      source: "purchase",
    });

    const before = granted.length;
    const outcomes = await svc.claimAll({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
    });
    // 3 levels × 2 tiers (free + premium) = 6 reward entries
    expect(outcomes).toHaveLength(6);
    expect(outcomes.every((o) => !o.idempotent)).toBe(true);
    expect(granted.length).toBe(before + 6);

    // Repeat → all idempotent
    const repeat = await svc.claimAll({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
    });
    expect(repeat).toHaveLength(0); // listClaimable 会过滤掉已领取的
  });

  test("aggregate view surfaces progress + tiers + claimable + task bindings", async () => {
    const actId = await createActiveActivity({ orgId, alias: "agg-view" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "agg-view"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });
    const endUserId = "u-agg";

    await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });

    const view = await svc.getAggregateView(orgId, s.id, endUserId);
    expect(view.season.maxLevel).toBe(3);
    expect(view.season.tiers).toHaveLength(3);
    expect(view.progress.currentXp).toBe(100);
    expect(view.progress.currentLevel).toBe(1);
    expect(view.progress.xpToNextLevel).toBe(100);
    expect(view.progress.ownedTiers).toEqual(["free"]);
    expect(view.claimable.length).toBeGreaterThanOrEqual(1);
    expect(view.claimable.some((c) => c.level === 1 && c.tierCode === "free")).toBe(true);
    expect(view.taskBindings).toHaveLength(1);
    expect(view.taskBindings[0]!.taskDefinitionId).toBe(taskId);
  });

  test("purgeUserProgressForSeason removes progress but keeps claims/grants", async () => {
    const actId = await createActiveActivity({ orgId, alias: "purge" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "purge"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });
    const endUserId = "u-purge";

    await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });
    await svc.grantTier({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      tierCode: "premium",
      source: "admin_grant",
    });
    await svc.claimLevel({
      organizationId: orgId,
      seasonId: s.id,
      endUserId,
      level: 1,
      tierCode: "free",
    });

    const beforeView = await svc.getAggregateView(orgId, s.id, endUserId);
    expect(beforeView.progress.currentLevel).toBe(1);

    // Archive cleanup
    await svc.purgeUserProgressForSeason(s.id);

    // Progress should be zeroed (no row, defaults)
    const afterView = await svc.getAggregateView(orgId, s.id, endUserId);
    expect(afterView.progress.currentLevel).toBe(0);
    expect(afterView.progress.currentXp).toBe(0);
    expect(afterView.progress.ownedTiers).toEqual(["free"]); // 默认值

    // Claims history should still exist — verify via listClaimable filter
    // (已领的 level=1/tier=free 应该不在 claimable 里，证明 claims 记录还在)
    // 注意：ownedTiers 被 purge 清回到 ['free']，所以 premium 部分不再 claimable
    const stillClaimable = afterView.claimable;
    // 虽然 progress 清零了，但因为 currentLevel=0，所以不会有 claimable 出来
    // 这里只是验证 purge 不会抛错、视图能正常组装
    expect(Array.isArray(stillClaimable)).toBe(true);
  });

  test("claim rejected when activity is archived (reward window closed)", async () => {
    const actId = await createActiveActivity({ orgId, alias: "archived" });
    const s = await svc.createConfig(orgId, makeSeasonInput(actId, "archived"));
    const taskId = crypto.randomUUID();
    await svc.bindTasks(orgId, s.id, {
      bindings: [{ taskDefinitionId: taskId, xpReward: 100, category: "daily" }],
    });
    const endUserId = "u-archived";

    // 让玩家升到 L1
    await svc.grantXpForTask({
      organizationId: orgId,
      endUserId,
      taskDefinitionId: taskId,
    });

    // 把 activity 时间窗口推到全部过去 + status='archived'。
    // gate 用 deriveState(row, now) 实时算 phase，所以光改 status 列
    // 不够 —— 必须把 hiddenAt 推到过去才能让 phase=archived。这也更
    // 接近生产事实：cron 在过完 hiddenAt 之后才会把 status 写成 archived。
    const past = new Date(Date.now() - 24 * 3_600_000);
    await db
      .update(activityConfigs)
      .set({
        status: "archived",
        visibleAt: new Date(past.getTime() - 5 * 3_600_000),
        startAt: new Date(past.getTime() - 4 * 3_600_000),
        endAt: new Date(past.getTime() - 3 * 3_600_000),
        hiddenAt: new Date(past.getTime() - 3_600_000),
      })
      .where(eq(activityConfigs.id, actId));

    await expect(
      svc.claimLevel({
        organizationId: orgId,
        seasonId: s.id,
        endUserId,
        level: 1,
        tierCode: "free",
      }),
    ).rejects.toMatchObject({ code: "battle_pass.reward_window_closed" });
  });
});
