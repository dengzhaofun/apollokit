/**
 * Service-layer tests for the level module.
 *
 * Talks to the real Neon dev branch (see apps/server/.dev.vars). A single
 * test org is seeded per file; ON DELETE CASCADE sweeps all level_* rows
 * on teardown.
 *
 * Coverage map:
 *   - Config CRUD + alias conflict
 *   - Stage CRUD
 *   - Level CRUD
 *   - Unlock rule evaluation (pure function)
 *   - Client: reportClear (stars, attempts, locking, newlyUnlocked)
 *   - Client: claimRewards (clear + star, double-claim, not-cleared)
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import type { RewardServices } from "../../lib/rewards";
import { createLevelService } from "./service";
import type { LevelService } from "./service";

// ─── Mock reward services ────────────────────────────────────────

type GrantCall = {
  tenantId: string;
  endUserId: string;
  grants: Array<{ definitionId: string; quantity: number }>;
  source: string;
  sourceId?: string;
};

const grantCalls: GrantCall[] = [];

const mockRewardServices: RewardServices = {
  itemSvc: {
    grantItems: async (params) => {
      grantCalls.push(params as GrantCall);
    },
    deductItems: async () => {},
  },
  currencySvc: {
    grant: async () => {},
    deduct: async () => {},
  },
};

describe("level service", () => {
  let orgId: string;
  let svc: LevelService;

  beforeAll(async () => {
    orgId = await createTestOrg("level-svc");
    svc = createLevelService({ db }, mockRewardServices);
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Config CRUD ─────────────────────────────────────────────

  describe("config CRUD", () => {
    test("creates a config", async () => {
      const c = await svc.createConfig(orgId, {
        name: "Main Story",
        alias: "lv-main-story",
      });
      expect(c.name).toBe("Main Story");
      expect(c.alias).toBe("lv-main-story");
      expect(c.tenantId).toBe(orgId);
      expect(c.id).toBeTruthy();
    });

    test("lists configs", async () => {
      await svc.createConfig(orgId, {
        name: "Side Quests",
        alias: "lv-side-quests",
      });
      const list = await svc.listConfigs(orgId);
      expect(list.items.length).toBeGreaterThanOrEqual(2);
      expect(list.items.some((c) => c.alias === "lv-main-story")).toBe(true);
      expect(list.items.some((c) => c.alias === "lv-side-quests")).toBe(true);
    });

    test("gets config by id", async () => {
      const created = await svc.createConfig(orgId, {
        name: "By Id Test",
        alias: "lv-by-id",
      });
      const fetched = await svc.getConfig(orgId, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe("By Id Test");
    });

    test("gets config by alias", async () => {
      const fetched = await svc.getConfig(orgId, "lv-main-story");
      expect(fetched.alias).toBe("lv-main-story");
      expect(fetched.name).toBe("Main Story");
    });

    test("updates config", async () => {
      const c = await svc.createConfig(orgId, {
        name: "To Update",
        alias: "lv-to-update",
      });
      const updated = await svc.updateConfig(orgId, c.id, {
        name: "Updated Name",
      });
      expect(updated.name).toBe("Updated Name");
      expect(updated.alias).toBe("lv-to-update");
    });

    test("deletes config", async () => {
      const c = await svc.createConfig(orgId, {
        name: "To Delete",
        alias: "lv-to-delete",
      });
      await svc.deleteConfig(orgId, c.id);
      await expect(svc.getConfig(orgId, c.id)).rejects.toMatchObject({
        code: "level.config_not_found",
      });
    });

    test("throws on duplicate alias", async () => {
      await svc.createConfig(orgId, {
        name: "Dup A",
        alias: "lv-dup-alias",
      });
      await expect(
        svc.createConfig(orgId, {
          name: "Dup B",
          alias: "lv-dup-alias",
        }),
      ).rejects.toMatchObject({ code: "level.alias_conflict" });
    });
  });

  // ─── Stage CRUD ──────────────────────────────────────────────

  describe("stage CRUD", () => {
    let stageConfigId: string;

    beforeAll(async () => {
      const c = await svc.createConfig(orgId, {
        name: "Stage Test Config",
        alias: "lv-stage-cfg",
        hasStages: true,
      });
      stageConfigId = c.id;
    });

    test("creates a stage", async () => {
      const s = await svc.createStage(orgId, stageConfigId, {
        name: "Chapter 1",
      });
      expect(s.name).toBe("Chapter 1");
      expect(s.configId).toBe(stageConfigId);
    });

    test("lists stages", async () => {
      await svc.createStage(orgId, stageConfigId, { name: "Chapter 2" });
      const list = await svc.listStages(orgId, stageConfigId);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.some((s) => s.name === "Chapter 1")).toBe(true);
      expect(list.some((s) => s.name === "Chapter 2")).toBe(true);
    });

    test("updates stage", async () => {
      const s = await svc.createStage(orgId, stageConfigId, {
        name: "Old Stage",
      });
      const updated = await svc.updateStage(orgId, s.id, {
        name: "New Stage",
      });
      expect(updated.name).toBe("New Stage");
    });

    test("deletes stage", async () => {
      const s = await svc.createStage(orgId, stageConfigId, {
        name: "Doomed Stage",
      });
      await svc.deleteStage(orgId, s.id);
      // listStages should no longer include it
      const list = await svc.listStages(orgId, stageConfigId);
      expect(list.some((x) => x.id === s.id)).toBe(false);
    });
  });

  // ─── Level CRUD ──────────────────────────────────────────────

  describe("level CRUD", () => {
    let levelConfigId: string;

    beforeAll(async () => {
      const c = await svc.createConfig(orgId, {
        name: "Level CRUD Config",
        alias: "lv-level-crud",
      });
      levelConfigId = c.id;
    });

    test("creates a level", async () => {
      const l = await svc.createLevel(orgId, levelConfigId, {
        name: "Level 1",
        alias: "lv-l1",
        maxStars: 3,
      });
      expect(l.name).toBe("Level 1");
      expect(l.configId).toBe(levelConfigId);
      expect(l.maxStars).toBe(3);
    });

    test("lists levels", async () => {
      await svc.createLevel(orgId, levelConfigId, {
        name: "Level 2",
        alias: "lv-l2",
      });
      const list = await svc.listLevels(orgId, levelConfigId);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.some((l) => l.alias === "lv-l1")).toBe(true);
      expect(list.some((l) => l.alias === "lv-l2")).toBe(true);
    });

    test("updates level", async () => {
      const l = await svc.createLevel(orgId, levelConfigId, {
        name: "Old Level",
        alias: "lv-old",
      });
      const updated = await svc.updateLevel(orgId, l.id, {
        name: "New Level",
      });
      expect(updated.name).toBe("New Level");
      expect(updated.alias).toBe("lv-old");
    });

    test("deletes level", async () => {
      const l = await svc.createLevel(orgId, levelConfigId, {
        name: "Doomed Level",
        alias: "lv-doomed",
      });
      await svc.deleteLevel(orgId, l.id);
      const list = await svc.listLevels(orgId, levelConfigId);
      expect(list.some((x) => x.id === l.id)).toBe(false);
    });
  });

  // ─── Unlock rule evaluation (pure function) ─────────────────

  describe("evaluateUnlockRule", () => {
    test("auto rule always returns true", () => {
      const result = svc.evaluateUnlockRule({ type: "auto" }, new Map());
      expect(result).toBe(true);
    });

    test("null rule returns true", () => {
      const result = svc.evaluateUnlockRule(null, new Map());
      expect(result).toBe(true);
    });

    test("level_clear checks progress map", () => {
      const progressMap = new Map<string, { status: string; stars: number }>();
      progressMap.set("lvl-a", { status: "cleared", stars: 2 });

      expect(
        svc.evaluateUnlockRule(
          { type: "level_clear", levelId: "lvl-a" },
          progressMap,
        ),
      ).toBe(true);

      expect(
        svc.evaluateUnlockRule(
          { type: "level_clear", levelId: "lvl-b" },
          progressMap,
        ),
      ).toBe(false);
    });

    test("level_stars checks star count", () => {
      const progressMap = new Map<string, { status: string; stars: number }>();
      progressMap.set("lvl-a", { status: "cleared", stars: 2 });

      expect(
        svc.evaluateUnlockRule(
          { type: "level_stars", levelId: "lvl-a", stars: 2 },
          progressMap,
        ),
      ).toBe(true);

      expect(
        svc.evaluateUnlockRule(
          { type: "level_stars", levelId: "lvl-a", stars: 3 },
          progressMap,
        ),
      ).toBe(false);
    });

    test("star_threshold checks total stars", () => {
      expect(
        svc.evaluateUnlockRule(
          { type: "star_threshold", threshold: 5 },
          new Map(),
          undefined,
          10,
        ),
      ).toBe(true);

      expect(
        svc.evaluateUnlockRule(
          { type: "star_threshold", threshold: 15 },
          new Map(),
          undefined,
          10,
        ),
      ).toBe(false);
    });

    test("all combinator requires all rules", () => {
      const progressMap = new Map<string, { status: string; stars: number }>();
      progressMap.set("lvl-a", { status: "cleared", stars: 3 });

      // Both pass
      expect(
        svc.evaluateUnlockRule(
          {
            type: "all",
            rules: [
              { type: "level_clear", levelId: "lvl-a" },
              { type: "level_stars", levelId: "lvl-a", stars: 2 },
            ],
          },
          progressMap,
        ),
      ).toBe(true);

      // Second fails
      expect(
        svc.evaluateUnlockRule(
          {
            type: "all",
            rules: [
              { type: "level_clear", levelId: "lvl-a" },
              { type: "level_clear", levelId: "lvl-b" },
            ],
          },
          progressMap,
        ),
      ).toBe(false);
    });

    test("any combinator requires at least one rule", () => {
      const progressMap = new Map<string, { status: string; stars: number }>();
      progressMap.set("lvl-a", { status: "cleared", stars: 1 });

      expect(
        svc.evaluateUnlockRule(
          {
            type: "any",
            rules: [
              { type: "level_clear", levelId: "lvl-a" },
              { type: "level_clear", levelId: "lvl-b" },
            ],
          },
          progressMap,
        ),
      ).toBe(true);

      // Both fail
      expect(
        svc.evaluateUnlockRule(
          {
            type: "any",
            rules: [
              { type: "level_clear", levelId: "lvl-b" },
              { type: "level_clear", levelId: "lvl-c" },
            ],
          },
          progressMap,
        ),
      ).toBe(false);
    });
  });

  // ─── Client: reportClear ────────────────────────────────────

  describe("reportClear", () => {
    let clearConfigId: string;
    let autoLevelId: string;

    beforeAll(async () => {
      const c = await svc.createConfig(orgId, {
        name: "Clear Test Config",
        alias: "lv-clear-cfg",
      });
      clearConfigId = c.id;
    });

    test("records a clear with stars", async () => {
      const lvl = await svc.createLevel(orgId, clearConfigId, {
        name: "Auto Level",
        unlockRule: { type: "auto" },
        maxStars: 3,
      });
      autoLevelId = lvl.id;

      const result = await svc.reportClear(orgId, "lv-u-clear", lvl.id, {
        stars: 2,
      });
      expect(result.levelId).toBe(lvl.id);
      expect(result.stars).toBe(2);
      expect(result.firstClear).toBe(true);
    });

    test("updates best stars on re-clear", async () => {
      // First clear with 1 star
      const lvl = await svc.createLevel(orgId, clearConfigId, {
        name: "Re-clear Level",
        unlockRule: { type: "auto" },
        maxStars: 3,
      });
      await svc.reportClear(orgId, "lv-u-reclear", lvl.id, { stars: 1 });

      // Second clear with 3 stars
      const result = await svc.reportClear(orgId, "lv-u-reclear", lvl.id, {
        stars: 3,
      });
      expect(result.stars).toBe(3);
      expect(result.firstClear).toBe(false);
    });

    test("increments attempts on re-clear", async () => {
      const lvl = await svc.createLevel(orgId, clearConfigId, {
        name: "Attempts Level",
        unlockRule: { type: "auto" },
        maxStars: 3,
      });
      await svc.reportClear(orgId, "lv-u-attempts", lvl.id, { stars: 1 });
      await svc.reportClear(orgId, "lv-u-attempts", lvl.id, { stars: 2 });

      // Verify via getLevelDetail
      const detail = await svc.getLevelDetail(
        orgId,
        "lv-u-attempts",
        lvl.id,
      );
      expect(detail.progress?.attempts).toBe(2);
    });

    test("rejects clear on locked level", async () => {
      const lvlA = await svc.createLevel(orgId, clearConfigId, {
        name: "Gate Level",
        unlockRule: { type: "auto" },
        maxStars: 3,
      });
      const lvlB = await svc.createLevel(orgId, clearConfigId, {
        name: "Locked Level",
        unlockRule: { type: "level_clear", levelId: lvlA.id },
        maxStars: 3,
      });

      // Try to clear lvlB without clearing lvlA first
      await expect(
        svc.reportClear(orgId, "lv-u-locked", lvlB.id, { stars: 1 }),
      ).rejects.toMatchObject({ code: "level.locked" });
    });

    test("computes newly unlocked levels", async () => {
      const lvl1 = await svc.createLevel(orgId, clearConfigId, {
        name: "Unlock Gate",
        unlockRule: { type: "auto" },
        maxStars: 3,
      });
      const lvl2 = await svc.createLevel(orgId, clearConfigId, {
        name: "Unlock Target",
        unlockRule: { type: "level_clear", levelId: lvl1.id },
        maxStars: 3,
      });

      const result = await svc.reportClear(orgId, "lv-u-unlock", lvl1.id, {
        stars: 2,
      });
      expect(result.newlyUnlocked).toContain(lvl2.id);
    });
  });

  // ─── Client: claimRewards ───────────────────────────────────

  describe("claimRewards", () => {
    let rewardConfigId: string;
    let rewardLevelId: string;
    const rewardItemId = "fake-reward-item-def-id";

    beforeAll(async () => {
      const c = await svc.createConfig(orgId, {
        name: "Reward Test Config",
        alias: "lv-reward-cfg",
      });
      rewardConfigId = c.id;

      const lvl = await svc.createLevel(orgId, rewardConfigId, {
        name: "Reward Level",
        unlockRule: { type: "auto" },
        maxStars: 3,
        clearRewards: [{ type: "item", id: rewardItemId, count: 10 }],
        starRewards: [
          {
            stars: 1,
            rewards: [{ type: "item", id: rewardItemId, count: 5 }],
          },
          {
            stars: 2,
            rewards: [{ type: "item", id: rewardItemId, count: 10 }],
          },
          {
            stars: 3,
            rewards: [{ type: "item", id: rewardItemId, count: 20 }],
          },
        ],
      });
      rewardLevelId = lvl.id;
    });

    test("claims clear rewards", async () => {
      const endUserId = "lv-u-claim-clear";
      grantCalls.length = 0;

      // Clear the level first
      await svc.reportClear(orgId, endUserId, rewardLevelId, { stars: 2 });

      // Claim clear rewards
      const result = await svc.claimRewards(orgId, endUserId, rewardLevelId, {
        type: "clear",
      });
      expect(result.type).toBe("clear");
      expect(result.grantedRewards).toHaveLength(1);
      expect(result.grantedRewards[0]!.id).toBe(rewardItemId);
      expect(result.grantedRewards[0]!.count).toBe(10);

      // Verify the mock was called
      expect(grantCalls.length).toBeGreaterThanOrEqual(1);
      const call = grantCalls[grantCalls.length - 1]!;
      expect(call.tenantId).toBe(orgId);
      expect(call.endUserId).toBe(endUserId);
    });

    test("rejects double clear reward claim", async () => {
      const endUserId = "lv-u-claim-clear"; // reuse from previous test
      await expect(
        svc.claimRewards(orgId, endUserId, rewardLevelId, { type: "clear" }),
      ).rejects.toMatchObject({ code: "level.rewards_already_claimed" });
    });

    test("rejects claim on uncleared level", async () => {
      const endUserId = "lv-u-no-clear";
      await expect(
        svc.claimRewards(orgId, endUserId, rewardLevelId, { type: "clear" }),
      ).rejects.toMatchObject({ code: "level.not_cleared" });
    });

    test("claims star rewards", async () => {
      const endUserId = "lv-u-claim-star";
      grantCalls.length = 0;

      // Clear with 3 stars
      await svc.reportClear(orgId, endUserId, rewardLevelId, { stars: 3 });

      // Claim star tier 3 (should grant tiers 1, 2, 3 since none claimed)
      const result = await svc.claimRewards(orgId, endUserId, rewardLevelId, {
        type: "star",
        starTier: 3,
      });
      expect(result.type).toBe("star");
      // Should include rewards from all 3 tiers (5 + 10 + 20 = 35 total)
      expect(result.grantedRewards.length).toBe(3);
    });
  });
});
