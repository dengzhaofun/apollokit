/**
 * Service-layer tests for the task module.
 *
 * Talks to the real Neon dev branch. A single test org is seeded per
 * file; ON DELETE CASCADE sweeps all task_* rows on teardown.
 *
 * Coverage map:
 *   - Category CRUD + alias conflict
 *   - Definition CRUD + alias conflict + nesting validation
 *   - Event processing (event_count, event_value)
 *   - Period lazy reset (daily)
 *   - Parent-child accumulation with configurable parentProgressValue
 *   - Prerequisite gating
 *   - Manual claim + idempotency
 *   - Auto-claim via mail stub
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import type { MailService } from "../mail/service";
import type { RewardItemSvc } from "../../lib/rewards";
import { createTaskService } from "./service";

type CapturedMail = {
  organizationId: string;
  input: Record<string, unknown>;
};

type CapturedGrant = {
  organizationId: string;
  endUserId: string;
  source: string;
};

describe("task service", () => {
  const grantLog: CapturedGrant[] = [];
  const captured: CapturedMail[] = [];

  // Stub itemSvc — we don't need real item grants, just record the call.
  const stubItemSvc: RewardItemSvc = {
    grantItems: async (params) => {
      grantLog.push({
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        source: params.source,
      });
    },
    deductItems: async () => {},
  };

  const stubMail = {
    createMessage: async (
      organizationId: string,
      input: Record<string, unknown>,
    ) => {
      captured.push({ organizationId, input });
      return { id: `mail-${captured.length}` };
    },
  } as unknown as MailService;

  const svc = createTaskService(
    { db },
    { itemSvc: stubItemSvc },
    () => stubMail,
  );

  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("task-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Category CRUD ──────────────────────────────────────────

  describe("category CRUD", () => {
    let catId: string;

    test("create category", async () => {
      const cat = await svc.createCategory(orgId, {
        name: "Daily Quests",
        alias: "daily",
        scope: "task",
      });
      expect(cat.name).toBe("Daily Quests");
      expect(cat.alias).toBe("daily");
      expect(cat.scope).toBe("task");
      catId = cat.id;
    });

    test("list categories", async () => {
      const cats = await svc.listCategories(orgId);
      expect(cats.length).toBeGreaterThanOrEqual(1);
      expect(cats.some((c) => c.id === catId)).toBe(true);
    });

    test("get category", async () => {
      const cat = await svc.getCategory(orgId, catId);
      expect(cat.name).toBe("Daily Quests");
    });

    test("update category", async () => {
      const cat = await svc.updateCategory(orgId, catId, {
        name: "Daily Tasks",
      });
      expect(cat.name).toBe("Daily Tasks");
    });

    test("alias conflict throws", async () => {
      await expect(
        svc.createCategory(orgId, { name: "Other", alias: "daily" }),
      ).rejects.toThrow("alias already in use");
    });

    test("delete category", async () => {
      await svc.deleteCategory(orgId, catId);
      await expect(svc.getCategory(orgId, catId)).rejects.toThrow(
        "not found",
      );
    });
  });

  // ─── Definition CRUD ────────────────────────────────────────

  describe("definition CRUD", () => {
    let defId: string;

    test("create definition", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Win 3 Battles",
        alias: "win-3",
        period: "daily",
        countingMethod: "event_count",
        eventName: "battle_win",
        targetValue: 3,
        rewards: [{ type: "item", id: "gold-def-1", count: 100 }],
      });
      expect(def.name).toBe("Win 3 Battles");
      expect(def.period).toBe("daily");
      expect(def.countingMethod).toBe("event_count");
      expect(def.targetValue).toBe(3);
      defId = def.id;
    });

    test("get by alias", async () => {
      const def = await svc.getDefinition(orgId, "win-3");
      expect(def.id).toBe(defId);
    });

    test("get by id", async () => {
      const def = await svc.getDefinition(orgId, defId);
      expect(def.alias).toBe("win-3");
    });

    test("update definition", async () => {
      const def = await svc.updateDefinition(orgId, defId, {
        targetValue: 5,
      });
      expect(def.targetValue).toBe(5);
    });

    test("alias conflict throws", async () => {
      await expect(
        svc.createDefinition(orgId, {
          name: "Another",
          alias: "win-3",
          period: "daily",
          countingMethod: "event_count",
          eventName: "login",
          targetValue: 1,
          rewards: [{ type: "item", id: "x", count: 1 }],
        }),
      ).rejects.toThrow("alias already in use");
    });

    test("nesting too deep throws", async () => {
      const parent = await svc.createDefinition(orgId, {
        name: "Meta Task",
        period: "daily",
        countingMethod: "child_completion",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });
      const child = await svc.createDefinition(orgId, {
        name: "Child Task",
        parentId: parent.id,
        period: "daily",
        countingMethod: "event_count",
        eventName: "test",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });
      // Trying to make a grandchild should fail
      await expect(
        svc.createDefinition(orgId, {
          name: "Grandchild",
          parentId: child.id,
          period: "daily",
          countingMethod: "event_count",
          eventName: "test",
          targetValue: 1,
          rewards: [{ type: "item", id: "x", count: 1 }],
        }),
      ).rejects.toThrow("nesting");
    });

    test("delete definition", async () => {
      await svc.deleteDefinition(orgId, defId);
      await expect(svc.getDefinition(orgId, defId)).rejects.toThrow(
        "not found",
      );
    });
  });

  // ─── Event processing ───────────────────────────────────────

  describe("event processing", () => {
    const endUser = "player-event-test";
    const now = new Date("2026-04-16T10:00:00Z");

    let taskId: string;

    test("setup: create event_count task", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Login 3 times",
        period: "daily",
        countingMethod: "event_count",
        eventName: "login",
        targetValue: 3,
        rewards: [{ type: "item", id: "gold-1", count: 50 }],
      });
      taskId = def.id;
    });

    test("processEvent increments count", async () => {
      const processed = await svc.processEvent(
        orgId,
        endUser,
        "login",
        {},
        now,
      );
      expect(processed).toBe(1);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === taskId);
      expect(t).toBeDefined();
      expect(t!.currentValue).toBe(1);
      expect(t!.isCompleted).toBe(false);
    });

    test("processEvent accumulates to completion", async () => {
      await svc.processEvent(orgId, endUser, "login", {}, now);
      await svc.processEvent(orgId, endUser, "login", {}, now);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === taskId);
      expect(t!.currentValue).toBe(3);
      expect(t!.isCompleted).toBe(true);
    });

    test("processEvent does not over-count after completion", async () => {
      await svc.processEvent(orgId, endUser, "login", {}, now);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === taskId);
      expect(t!.currentValue).toBe(3); // still 3, not 4
    });

    test("daily reset: next day resets progress", async () => {
      const tomorrow = new Date("2026-04-17T10:00:00Z");

      const tasks = await svc.getTasksForUser(
        orgId,
        endUser,
        {},
        tomorrow,
      );
      const t = tasks.find((t) => t.id === taskId);
      expect(t!.currentValue).toBe(0); // lazy reset
      expect(t!.isCompleted).toBe(false);
    });
  });

  // ─── Event value counting ───────────────────────────────────

  describe("event_value counting", () => {
    const endUser = "player-value-test";
    const now = new Date("2026-04-16T10:00:00Z");

    let taskId: string;

    test("setup: create event_value task", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Spend 1000 gold",
        period: "none",
        countingMethod: "event_value",
        eventName: "purchase",
        eventValueField: "amount",
        targetValue: 1000,
        rewards: [{ type: "item", id: "badge-1", count: 1 }],
      });
      taskId = def.id;
    });

    test("processEvent accumulates value from eventData", async () => {
      await svc.processEvent(
        orgId,
        endUser,
        "purchase",
        { amount: 300 },
        now,
      );
      await svc.processEvent(
        orgId,
        endUser,
        "purchase",
        { amount: 500 },
        now,
      );

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === taskId);
      expect(t!.currentValue).toBe(800);
      expect(t!.isCompleted).toBe(false);
    });

    test("completes on reaching target", async () => {
      await svc.processEvent(
        orgId,
        endUser,
        "purchase",
        { amount: 250 },
        now,
      );

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === taskId);
      expect(t!.currentValue).toBe(1050);
      expect(t!.isCompleted).toBe(true);
    });
  });

  // ─── Parent-child accumulation ──────────────────────────────

  describe("parent-child accumulation", () => {
    const endUser = "player-parent-test";
    const now = new Date("2026-04-16T10:00:00Z");

    let parentId: string;
    let childAId: string;
    let childBId: string;

    test("setup: create parent + children with different progressValues", async () => {
      const parent = await svc.createDefinition(orgId, {
        name: "Complete 5 quests",
        period: "daily",
        countingMethod: "child_completion",
        targetValue: 5,
        rewards: [{ type: "item", id: "big-reward", count: 1 }],
      });
      parentId = parent.id;

      const childA = await svc.createDefinition(orgId, {
        name: "Kill 10 monsters",
        parentId: parent.id,
        parentProgressValue: 3,
        period: "daily",
        countingMethod: "event_count",
        eventName: "monster_kill",
        targetValue: 10,
        rewards: [{ type: "item", id: "small-reward", count: 1 }],
      });
      childAId = childA.id;

      const childB = await svc.createDefinition(orgId, {
        name: "Win 1 PvP",
        parentId: parent.id,
        parentProgressValue: 2,
        period: "daily",
        countingMethod: "event_count",
        eventName: "pvp_win",
        targetValue: 1,
        rewards: [{ type: "item", id: "small-reward-2", count: 1 }],
      });
      childBId = childB.id;
    });

    test("child A completion contributes parentProgressValue=3", async () => {
      // Complete child A (10 monster kills)
      for (let i = 0; i < 10; i++) {
        await svc.processEvent(orgId, endUser, "monster_kill", {}, now);
      }

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const parent = tasks.find((t) => t.id === parentId);
      expect(parent!.currentValue).toBe(3); // parentProgressValue of childA
      expect(parent!.isCompleted).toBe(false);
    });

    test("child B completion contributes parentProgressValue=2, total=5 completes parent", async () => {
      await svc.processEvent(orgId, endUser, "pvp_win", {}, now);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const parent = tasks.find((t) => t.id === parentId);
      expect(parent!.currentValue).toBe(5); // 3 + 2
      expect(parent!.isCompleted).toBe(true);
    });
  });

  // ─── Manual claim ───────────────────────────────────────────

  describe("manual claim", () => {
    const endUser = "player-claim-test";
    const now = new Date("2026-04-16T10:00:00Z");

    let taskId: string;

    test("setup: create and complete a task", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Login once",
        period: "none",
        countingMethod: "event_count",
        eventName: "login_claim_test",
        targetValue: 1,
        autoClaim: false,
        rewards: [{ type: "item", id: "reward-1", count: 10 }],
      });
      taskId = def.id;

      await svc.processEvent(
        orgId,
        endUser,
        "login_claim_test",
        {},
        now,
      );
    });

    test("claim succeeds for completed task", async () => {
      const result = await svc.claimReward(orgId, endUser, taskId, now);
      expect(result.taskId).toBe(taskId);
      expect(result.grantedRewards).toHaveLength(1);
    });

    test("double claim throws", async () => {
      await expect(
        svc.claimReward(orgId, endUser, taskId, now),
      ).rejects.toThrow("already claimed");
    });

    test("claim on incomplete task throws", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Impossible",
        period: "none",
        countingMethod: "event_count",
        eventName: "impossible_event",
        targetValue: 999,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });
      await expect(
        svc.claimReward(orgId, endUser, def.id, now),
      ).rejects.toThrow("not completed");
    });
  });

  // ─── Auto-claim via mail ────────────────────────────────────

  describe("auto-claim", () => {
    const endUser = "player-autoclaim-test";
    const now = new Date("2026-04-16T10:00:00Z");

    test("auto-claim sends mail on completion", async () => {
      const before = captured.length;

      const def = await svc.createDefinition(orgId, {
        name: "Auto Claim Task",
        period: "none",
        countingMethod: "event_count",
        eventName: "autoclaim_event",
        targetValue: 1,
        autoClaim: true,
        rewards: [{ type: "item", id: "auto-reward", count: 5 }],
      });

      await svc.processEvent(
        orgId,
        endUser,
        "autoclaim_event",
        {},
        now,
      );

      expect(captured.length).toBe(before + 1);
      const mail = captured[captured.length - 1]!;
      expect(mail.organizationId).toBe(orgId);
      expect(mail.input.originSource).toBe("task.complete");
    });

    test("auto-claim task rejects manual claim", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Auto Only",
        period: "none",
        countingMethod: "event_count",
        eventName: "auto_only_event",
        targetValue: 1,
        autoClaim: true,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      await svc.processEvent(
        orgId,
        endUser,
        "auto_only_event",
        {},
        now,
      );

      await expect(
        svc.claimReward(orgId, endUser, def.id, now),
      ).rejects.toThrow("autoClaim");
    });
  });

  // ─── Prerequisites ──────────────────────────────────────────

  describe("prerequisites", () => {
    const endUser = "player-prereq-test";
    const now = new Date("2026-04-16T10:00:00Z");

    test("event is skipped when prereqs not met", async () => {
      const prereq = await svc.createDefinition(orgId, {
        name: "Prereq Task",
        period: "none",
        countingMethod: "event_count",
        eventName: "prereq_event",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      const dependent = await svc.createDefinition(orgId, {
        name: "Dependent Task",
        period: "none",
        countingMethod: "event_count",
        eventName: "dependent_event",
        targetValue: 1,
        prerequisiteTaskIds: [prereq.id],
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      // Fire dependent event before prereq is done — should be skipped
      const processed = await svc.processEvent(
        orgId,
        endUser,
        "dependent_event",
        {},
        now,
      );
      expect(processed).toBe(0);

      // Complete the prereq
      await svc.processEvent(orgId, endUser, "prereq_event", {}, now);

      // Now fire dependent event — should work
      const processed2 = await svc.processEvent(
        orgId,
        endUser,
        "dependent_event",
        {},
        now,
      );
      expect(processed2).toBe(1);
    });

    test("hidden tasks are filtered in getTasksForUser when prereqs not met", async () => {
      const prereq = await svc.createDefinition(orgId, {
        name: "Prereq Hidden",
        period: "none",
        countingMethod: "event_count",
        eventName: "prereq_hidden_event",
        targetValue: 999,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      await svc.createDefinition(orgId, {
        name: "Hidden Task",
        period: "none",
        countingMethod: "event_count",
        eventName: "hidden_task_event",
        targetValue: 1,
        prerequisiteTaskIds: [prereq.id],
        isHidden: true,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const hidden = tasks.find((t) => t.name === "Hidden Task");
      expect(hidden).toBeUndefined();

      // With includeHidden, it should appear
      const tasksAll = await svc.getTasksForUser(
        orgId,
        endUser,
        { includeHidden: true },
        now,
      );
      const shown = tasksAll.find((t) => t.name === "Hidden Task");
      expect(shown).toBeDefined();
      expect(shown!.prerequisitesMet).toBe(false);
    });
  });

  // ─── No-match events ────────────────────────────────────────

  test("unmatched event returns 0 processed", async () => {
    const processed = await svc.processEvent(
      orgId,
      "any-user",
      "nonexistent_event",
      {},
    );
    expect(processed).toBe(0);
  });
});
