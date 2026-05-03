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
import { taskDefinitions } from "../../schema/task";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import type { MailService } from "../mail/service";
import type { RewardItemSvc } from "../../lib/rewards";
import { createTaskService } from "./service";
import { TaskAssignmentNotFound } from "./errors";
import {
  CreateDefinitionSchema,
  UpdateDefinitionSchema,
} from "./validators";

type CapturedMail = {
  tenantId: string;
  input: Record<string, unknown>;
};

type CapturedGrant = {
  tenantId: string;
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
        tenantId: params.tenantId,
        endUserId: params.endUserId,
        source: params.source,
      });
    },
    deductItems: async () => {},
  };

  const stubMail = {
    createMessage: async (
      tenantId: string,
      input: Record<string, unknown>,
    ) => {
      captured.push({ tenantId, input });
      return { id: `mail-${captured.length}` };
    },
  } as unknown as MailService;

  const stubCurrencySvc = {
    grant: async () => {},
    deduct: async () => {},
  };

  const svc = createTaskService(
    { db },
    { itemSvc: stubItemSvc, currencySvc: stubCurrencySvc },
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
      expect(cats.items.length).toBeGreaterThanOrEqual(1);
      expect(cats.items.some((c) => c.id === catId)).toBe(true);
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
      expect(mail.tenantId).toBe(orgId);
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

  // ─── Filter expression ──────────────────────────────────────

  describe("filter expression", () => {
    const now = new Date("2026-04-16T10:00:00Z");

    test("filter matches → increments progress", async () => {
      const endUser = "player-filter-match";
      const def = await svc.createDefinition(orgId, {
        name: "Kill 1 dragon",
        period: "none",
        countingMethod: "event_count",
        eventName: "monster_killed",
        filter: 'monsterId == "dragon"',
        targetValue: 1,
        rewards: [{ type: "item", id: "dragon-reward", count: 1 }],
      });

      const processed = await svc.processEvent(
        orgId,
        endUser,
        "monster_killed",
        { monsterId: "dragon" },
        now,
      );
      expect(processed).toBe(1);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === def.id);
      expect(t!.currentValue).toBe(1);
      expect(t!.isCompleted).toBe(true);
    });

    test("filter rejects → progress unchanged", async () => {
      const endUser = "player-filter-reject";
      const def = await svc.createDefinition(orgId, {
        name: "Kill 1 dragon (reject)",
        period: "none",
        countingMethod: "event_count",
        eventName: "monster_killed_reject",
        filter: 'monsterId == "dragon"',
        targetValue: 1,
        rewards: [{ type: "item", id: "dragon-reward-2", count: 1 }],
      });

      const processed = await svc.processEvent(
        orgId,
        endUser,
        "monster_killed_reject",
        { monsterId: "goblin" },
        now,
      );
      expect(processed).toBe(0);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === def.id);
      expect(t!.currentValue).toBe(0);
      expect(t!.isCompleted).toBe(false);
    });

    test("nested dot access via useDotAccessOperator", async () => {
      const endUser = "player-filter-nested";
      const def = await svc.createDefinition(orgId, {
        name: "High level kill",
        period: "none",
        countingMethod: "event_count",
        eventName: "nested_kill",
        filter: "stats.level >= 10",
        targetValue: 1,
        rewards: [{ type: "item", id: "lvl-reward", count: 1 }],
      });

      // Nested object should satisfy
      await svc.processEvent(
        orgId,
        endUser,
        "nested_kill",
        { stats: { level: 15 } },
        now,
      );

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === def.id);
      expect(t!.currentValue).toBe(1);
    });

    test("dot notation resolves nested fields, not literal 'a.b' keys", async () => {
      const endUser = "player-filter-nested-literal";
      const def = await svc.createDefinition(orgId, {
        name: "Literal dot rejected",
        period: "none",
        countingMethod: "event_count",
        eventName: "literal_dot_kill",
        filter: "stats.level >= 10",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      // A literal "stats.level" key must NOT be treated as a match.
      const processed = await svc.processEvent(
        orgId,
        endUser,
        "literal_dot_kill",
        { "stats.level": 15 },
        now,
      );
      expect(processed).toBe(0);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === def.id);
      expect(t!.currentValue).toBe(0);
    });

    test("filter combined with event_value accumulation", async () => {
      const endUser = "player-filter-value";
      const def = await svc.createDefinition(orgId, {
        name: "Spend 500 gold on weapons",
        period: "none",
        countingMethod: "event_value",
        eventName: "purchase_filtered",
        eventValueField: "amount",
        filter: 'category == "weapon"',
        targetValue: 500,
        rewards: [{ type: "item", id: "weapon-reward", count: 1 }],
      });

      // Non-matching event: filtered out, no progress
      await svc.processEvent(
        orgId,
        endUser,
        "purchase_filtered",
        { amount: 400, category: "potion" },
        now,
      );

      // Matching events: accumulate
      await svc.processEvent(
        orgId,
        endUser,
        "purchase_filtered",
        { amount: 300, category: "weapon" },
        now,
      );
      await svc.processEvent(
        orgId,
        endUser,
        "purchase_filtered",
        { amount: 250, category: "weapon" },
        now,
      );

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const t = tasks.find((t) => t.id === def.id);
      expect(t!.currentValue).toBe(550);
      expect(t!.isCompleted).toBe(true);
    });

    test("malformed filter stored via raw insert → event skipped, other tasks unaffected", async () => {
      const endUser = "player-filter-malformed";

      // Legit task on the same event.
      const legit = await svc.createDefinition(orgId, {
        name: "Legit task",
        period: "none",
        countingMethod: "event_count",
        eventName: "malformed_event",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      // Broken task: bypass the validator by inserting a garbage filter
      // directly into the DB, simulating corrupted / legacy data.
      const [broken] = await db
        .insert(taskDefinitions)
        .values({
          tenantId: orgId,
          name: "Broken filter task",
          period: "none",
          timezone: "UTC",
          weekStartsOn: 1,
          countingMethod: "event_count",
          eventName: "malformed_event",
          filter: "monsterId ===", // syntax error
          targetValue: 1,
          parentProgressValue: 1,
          prerequisiteTaskIds: [],
          rewards: [{ type: "item", id: "x", count: 1 }],
          autoClaim: false,
          sortOrder: "a0",
        })
        .returning();

      const processed = await svc.processEvent(
        orgId,
        endUser,
        "malformed_event",
        {},
        now,
      );

      // Legit task processed; broken task skipped.
      expect(processed).toBe(1);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const tLegit = tasks.find((t) => t.id === legit.id);
      expect(tLegit!.currentValue).toBe(1);

      const tBroken = tasks.find((t) => t.id === broken!.id);
      // No progress row was created for the broken task.
      expect(tBroken!.currentValue).toBe(0);
      expect(tBroken!.isCompleted).toBe(false);
    });

    test("filter blocks downstream prerequisite from unlocking", async () => {
      const endUser = "player-filter-prereq";

      const prereq = await svc.createDefinition(orgId, {
        name: "Kill 1 dragon (prereq)",
        period: "none",
        countingMethod: "event_count",
        eventName: "prereq_filtered_kill",
        filter: 'monsterId == "dragon"',
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      const dependent = await svc.createDefinition(orgId, {
        name: "Post-dragon task",
        period: "none",
        countingMethod: "event_count",
        eventName: "dependent_filtered_event",
        prerequisiteTaskIds: [prereq.id],
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      // Event for the prereq arrives but filter rejects → prereq stays at 0.
      await svc.processEvent(
        orgId,
        endUser,
        "prereq_filtered_kill",
        { monsterId: "goblin" },
        now,
      );

      // Dependent event should be gated because prereq is incomplete.
      const processed = await svc.processEvent(
        orgId,
        endUser,
        "dependent_filtered_event",
        {},
        now,
      );
      expect(processed).toBe(0);

      const tasks = await svc.getTasksForUser(orgId, endUser, {}, now);
      const tDep = tasks.find((t) => t.id === dependent.id);
      expect(tDep!.currentValue).toBe(0);
    });

    test("update with filter + child_completion is rejected", async () => {
      const parent = await svc.createDefinition(orgId, {
        name: "Parent for filter conflict",
        period: "none",
        countingMethod: "child_completion",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
      });

      await expect(
        svc.updateDefinition(orgId, parent.id, {
          filter: 'x == "y"',
        }),
      ).rejects.toThrow(/child_completion/);
    });
  });

  // ─── Validator-level filter checks ──────────────────────────

  describe("filter validator", () => {
    const baseInput = {
      name: "T",
      period: "none" as const,
      countingMethod: "event_count" as const,
      eventName: "evt",
      targetValue: 1,
      rewards: [{ type: "item" as const, id: "x", count: 1 }],
    };

    test("rejects syntactically invalid filter", () => {
      const res = CreateDefinitionSchema.safeParse({
        ...baseInput,
        filter: "monsterId ===",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const paths = res.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("filter");
      }
    });

    test("rejects filter with countingMethod=child_completion", () => {
      const res = CreateDefinitionSchema.safeParse({
        name: "T",
        period: "none" as const,
        countingMethod: "child_completion" as const,
        filter: 'x == "y"',
        targetValue: 1,
        rewards: [{ type: "item" as const, id: "x", count: 1 }],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const paths = res.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("filter");
      }
    });

    test("accepts valid filter on event_count", () => {
      const res = CreateDefinitionSchema.safeParse({
        ...baseInput,
        filter: 'monsterId == "dragon" and stats.level >= 10',
      });
      expect(res.success).toBe(true);
    });

    test("UpdateDefinitionSchema rejects syntactically invalid filter", () => {
      const res = UpdateDefinitionSchema.safeParse({
        filter: "bad ===",
      });
      expect(res.success).toBe(false);
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

  // ─── Reward tiers (阶段性奖励) ────────────────────────────────

  describe("reward tiers", () => {
    const tierRewardA = [{ type: "item" as const, id: "tier-a", count: 1 }];
    const tierRewardB = [{ type: "item" as const, id: "tier-b", count: 2 }];
    const tierRewardC = [{ type: "item" as const, id: "tier-c", count: 3 }];

    test("validator rejects non-increasing thresholds", () => {
      const res = CreateDefinitionSchema.safeParse({
        name: "Tiered",
        period: "none" as const,
        countingMethod: "event_count" as const,
        eventName: "tier_evt",
        targetValue: 10,
        rewards: [{ type: "item" as const, id: "done", count: 1 }],
        rewardTiers: [
          { alias: "t1", threshold: 5, rewards: tierRewardA },
          { alias: "t2", threshold: 5, rewards: tierRewardB },
        ],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const paths = res.error.issues.map((i) => i.path.join("."));
        expect(paths.some((p) => p.includes("threshold"))).toBe(true);
      }
    });

    test("validator rejects duplicate alias", () => {
      const res = CreateDefinitionSchema.safeParse({
        name: "Tiered",
        period: "none" as const,
        countingMethod: "event_count" as const,
        eventName: "tier_evt",
        targetValue: 10,
        rewards: [{ type: "item" as const, id: "done", count: 1 }],
        rewardTiers: [
          { alias: "t1", threshold: 3, rewards: tierRewardA },
          { alias: "t1", threshold: 5, rewards: tierRewardB },
        ],
      });
      expect(res.success).toBe(false);
    });

    test("validator rejects threshold > targetValue", () => {
      const res = CreateDefinitionSchema.safeParse({
        name: "Tiered",
        period: "none" as const,
        countingMethod: "event_count" as const,
        eventName: "tier_evt",
        targetValue: 5,
        rewards: [{ type: "item" as const, id: "done", count: 1 }],
        rewardTiers: [
          { alias: "t1", threshold: 6, rewards: tierRewardA },
        ],
      });
      expect(res.success).toBe(false);
    });

    test("event_count crosses single tier — manual task surfaces claimable", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Manual Tier",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_manual_evt",
        targetValue: 10,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "s1", threshold: 3, rewards: tierRewardA },
          { alias: "s2", threshold: 7, rewards: tierRewardB },
        ],
      });
      const userId = `tier-manual-${Date.now()}`;

      // 3 events → crosses s1 but not s2
      for (let i = 0; i < 3; i++) {
        await svc.processEvent(orgId, userId, "tier_manual_evt", {});
      }

      const list = await svc.getTasksForUser(orgId, userId);
      const view = list.find((t) => t.id === def.id);
      expect(view).toBeDefined();
      expect(view!.currentValue).toBe(3);
      expect(view!.rewardTiers).toHaveLength(2);
      // Manual task — tier not auto-claimed yet, but cross surfaced on
      // currentValue vs threshold; ledger empty until explicit claim.
      expect(view!.claimedTierAliases).toEqual([]);
    });

    test("claimTier succeeds above threshold, grants rewards, is idempotent", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Claim Tier",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_claim_evt",
        targetValue: 10,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "g1", threshold: 2, rewards: tierRewardA },
          { alias: "g2", threshold: 5, rewards: tierRewardB },
        ],
      });
      const userId = `tier-claim-${Date.now()}`;

      // Cross g1 (2 events) but not g2
      await svc.processEvent(orgId, userId, "tier_claim_evt", {});
      await svc.processEvent(orgId, userId, "tier_claim_evt", {});

      const beforeLen = grantLog.length;
      const result = await svc.claimTier(orgId, userId, def.id, "g1");
      expect(result.tierAlias).toBe("g1");
      expect(result.grantedRewards).toEqual(tierRewardA);
      expect(grantLog.length).toBe(beforeLen + 1);
      expect(grantLog[grantLog.length - 1]!.source).toBe("task.tier.claim");

      // Second claim is rejected as already claimed.
      await expect(
        svc.claimTier(orgId, userId, def.id, "g1"),
      ).rejects.toThrow(/already claimed/i);

      // Verify list surfaces g1 as claimed.
      const list = await svc.getTasksForUser(orgId, userId);
      const view = list.find((t) => t.id === def.id)!;
      expect(view.claimedTierAliases).toContain("g1");
      expect(view.claimedTierAliases).not.toContain("g2");
    });

    test("claimTier below threshold throws TaskTierNotReached", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Not Reached",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_notreached_evt",
        targetValue: 10,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "n1", threshold: 5, rewards: tierRewardA },
        ],
      });
      const userId = `tier-nr-${Date.now()}`;
      await svc.processEvent(orgId, userId, "tier_notreached_evt", {});

      await expect(
        svc.claimTier(orgId, userId, def.id, "n1"),
      ).rejects.toThrow(/not reached|has not reached/i);
    });

    test("claimTier on unknown alias throws TaskTierNotFound", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Unknown Alias",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_unknown_evt",
        targetValue: 5,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "known", threshold: 1, rewards: tierRewardA },
        ],
      });
      const userId = `tier-unknown-${Date.now()}`;
      await svc.processEvent(orgId, userId, "tier_unknown_evt", {});

      await expect(
        svc.claimTier(orgId, userId, def.id, "bogus"),
      ).rejects.toThrow(/tier not found|not found/i);
    });

    test("claimTier on autoClaim task throws TaskAutoClaimOnly", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Auto Tier",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_auto_evt",
        targetValue: 5,
        autoClaim: true,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "a1", threshold: 1, rewards: tierRewardA },
        ],
      });
      const userId = `tier-auto-${Date.now()}`;
      await svc.processEvent(orgId, userId, "tier_auto_evt", {});

      await expect(
        svc.claimTier(orgId, userId, def.id, "a1"),
      ).rejects.toThrow(/auto.*claim|autoClaim/i);
    });

    test("autoClaim task dispatches tier via mail on progress bump", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Auto Dispatch",
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_autodispatch_evt",
        targetValue: 10,
        autoClaim: true,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "d1", threshold: 2, rewards: tierRewardA },
          { alias: "d2", threshold: 4, rewards: tierRewardB },
        ],
      });
      const userId = `tier-autodispatch-${Date.now()}`;
      const mailBefore = captured.length;

      // 2 events → crosses d1 only.
      await svc.processEvent(orgId, userId, "tier_autodispatch_evt", {});
      await svc.processEvent(orgId, userId, "tier_autodispatch_evt", {});

      const d1Mails = captured
        .slice(mailBefore)
        .filter(
          (m) =>
            (m.input.originSource as string | undefined) === "task.tier" &&
            String(m.input.content ?? "").includes("d1"),
        );
      expect(d1Mails).toHaveLength(1);

      // Re-fire — must stay idempotent.
      await svc.processEvent(orgId, userId, "tier_autodispatch_evt", {});
      const d1MailsAfter = captured
        .slice(mailBefore)
        .filter(
          (m) =>
            (m.input.originSource as string | undefined) === "task.tier" &&
            String(m.input.content ?? "").includes("d1"),
        );
      expect(d1MailsAfter).toHaveLength(1);
    });

    test("event_value single event crossing 2 tiers dispatches both", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Big Jump",
        period: "none",
        countingMethod: "event_value",
        eventName: "tier_bigjump_evt",
        eventValueField: "amount",
        targetValue: 100,
        autoClaim: true,
        rewards: [{ type: "item", id: "final", count: 1 }],
        rewardTiers: [
          { alias: "j1", threshold: 10, rewards: tierRewardA },
          { alias: "j2", threshold: 25, rewards: tierRewardB },
          { alias: "j3", threshold: 70, rewards: tierRewardC },
        ],
      });
      const userId = `tier-bigjump-${Date.now()}`;
      const mailBefore = captured.length;

      await svc.processEvent(orgId, userId, "tier_bigjump_evt", {
        amount: 30,
      });

      const mails = captured
        .slice(mailBefore)
        .filter(
          (m) => (m.input.originSource as string | undefined) === "task.tier",
        );
      const aliases = mails
        .map((m) => {
          const id = m.input.originSourceId as string;
          return id.split(":").pop();
        })
        .filter(Boolean);
      expect(aliases.sort()).toEqual(["j1", "j2"]);

      // Definition used — satisfy lint.
      expect(def.id).toBeDefined();
    });

    test("subtask completion bumps parent past parent tier — tier fires", async () => {
      const parent = await svc.createDefinition(orgId, {
        name: "Parent Tier",
        period: "none",
        countingMethod: "child_completion",
        targetValue: 4,
        autoClaim: true,
        rewards: [{ type: "item", id: "parent-done", count: 1 }],
        rewardTiers: [
          { alias: "pt1", threshold: 2, rewards: tierRewardA },
          { alias: "pt2", threshold: 4, rewards: tierRewardB },
        ],
      });
      const child1 = await svc.createDefinition(orgId, {
        name: "Child 1",
        parentId: parent.id,
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_sub_evt_1",
        targetValue: 1,
        parentProgressValue: 2,
        rewards: [{ type: "item", id: "c1", count: 1 }],
      });
      // Child2 exists so parent config is "realistic" but we only fire
      // child1 — its parentProgressValue=2 alone bumps parent past pt1.
      await svc.createDefinition(orgId, {
        name: "Child 2",
        parentId: parent.id,
        period: "none",
        countingMethod: "event_count",
        eventName: "tier_sub_evt_2",
        targetValue: 1,
        parentProgressValue: 2,
        rewards: [{ type: "item", id: "c2", count: 1 }],
      });
      const userId = `tier-sub-${Date.now()}`;
      const mailBefore = captured.length;

      // Complete child1 → parent progress jumps 0 → 2 (crosses pt1).
      await svc.processEvent(orgId, userId, "tier_sub_evt_1", {});

      const tierMails = captured
        .slice(mailBefore)
        .filter(
          (m) =>
            (m.input.originSource as string | undefined) === "task.tier" &&
            (m.input.originSourceId as string).startsWith(`${parent.id}:`),
        );
      expect(tierMails).toHaveLength(1);
      const id = tierMails[0]!.input.originSourceId as string;
      expect(id.endsWith(":pt1")).toBe(true);

      // Silence unused-var lint.
      expect(child1.id).toBeDefined();
    });
  });

  // ─── Assignment (定向分配) ────────────────────────────────────

  describe("assignment", () => {
    const baseRewards = [
      { type: "item" as const, id: "assign-reward", count: 1 },
    ];

    test("broadcast task: unassigned user sees and progresses normally", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Broadcast Control",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_broadcast_evt",
        targetValue: 1,
        rewards: baseRewards,
      });
      const userId = `assign-broadcast-${Date.now()}`;

      const processed = await svc.processEvent(
        orgId,
        userId,
        "assign_broadcast_evt",
        {},
      );
      expect(processed).toBe(1);

      const list = await svc.getTasksForUser(orgId, userId);
      const view = list.find((t) => t.id === def.id);
      expect(view).toBeDefined();
      expect(view!.isCompleted).toBe(true);
      expect(view!.assignment).toBeNull();
    });

    test("assigned task: unassigned user gets NO progress and NO visibility", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Assigned Only",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_only_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const userId = `assign-nope-${Date.now()}`;

      const processed = await svc.processEvent(
        orgId,
        userId,
        "assign_only_evt",
        {},
      );
      expect(processed).toBe(0); // event short-circuits

      const list = await svc.getTasksForUser(orgId, userId);
      expect(list.find((t) => t.id === def.id)).toBeUndefined();
    });

    test("assignTask then event: user sees task, progresses, can claim", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Assigned Flow",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_flow_evt",
        targetValue: 1,
        visibility: "assigned",
        autoClaim: false,
        rewards: baseRewards,
      });
      const userId = `assign-flow-${Date.now()}`;

      const assigned = await svc.assignTask(orgId, userId, def.id, {
        source: "manual",
        sourceRef: "test",
      });
      expect(assigned.taskId).toBe(def.id);
      expect(assigned.endUserId).toBe(userId);
      expect(assigned.revokedAt).toBeNull();
      expect(assigned.source).toBe("manual");

      const processed = await svc.processEvent(
        orgId,
        userId,
        "assign_flow_evt",
        {},
      );
      expect(processed).toBe(1);

      const list = await svc.getTasksForUser(orgId, userId);
      const view = list.find((t) => t.id === def.id)!;
      expect(view.isCompleted).toBe(true);
      expect(view.assignment).not.toBeNull();
      expect(view.assignment!.source).toBe("manual");

      // Manual claim path still works.
      const before = grantLog.length;
      const claim = await svc.claimReward(orgId, userId, def.id);
      expect(claim.taskId).toBe(def.id);
      expect(grantLog.length).toBe(before + 1);
    });

    test("assignTask on inactive task throws TaskNotAssignable", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Inactive",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_inactive_evt",
        targetValue: 1,
        visibility: "assigned",
        isActive: false,
        rewards: baseRewards,
      });
      await expect(
        svc.assignTask(orgId, "whoever", def.id),
      ).rejects.toThrow(/not assignable|inactive/);
    });

    test("idempotency: second assignTask returns existing row, does NOT refresh assignedAt", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Idem",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_idem_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const userId = `assign-idem-${Date.now()}`;
      const t0 = new Date("2026-04-18T10:00:00Z");
      const t1 = new Date("2026-04-18T11:00:00Z");

      const a = await svc.assignTask(orgId, userId, def.id, {
        source: "manual",
        sourceRef: "first",
        now: t0,
      });
      const b = await svc.assignTask(orgId, userId, def.id, {
        source: "rule",
        sourceRef: "second",
        now: t1,
      });
      expect(b.assignedAt.getTime()).toBe(a.assignedAt.getTime());
      expect(b.source).toBe("manual");
      expect(b.sourceRef).toBe("first");
    });

    test("allowReassign=true refreshes existing row", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Reassign",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_reassign_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const userId = `assign-reassign-${Date.now()}`;
      const t0 = new Date("2026-04-18T10:00:00Z");
      const t1 = new Date("2026-04-18T11:00:00Z");

      await svc.assignTask(orgId, userId, def.id, {
        source: "manual",
        sourceRef: "first",
        now: t0,
      });
      const b = await svc.assignTask(orgId, userId, def.id, {
        source: "rule",
        sourceRef: "second",
        allowReassign: true,
        now: t1,
      });
      expect(b.assignedAt.getTime()).toBe(t1.getTime());
      expect(b.source).toBe("rule");
      expect(b.sourceRef).toBe("second");
    });

    test("expired assignment is treated as unassigned (list + processEvent)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Expiring",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_expire_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const userId = `assign-expire-${Date.now()}`;
      const start = new Date("2026-04-18T10:00:00Z");
      const later = new Date("2026-04-18T11:30:00Z");

      await svc.assignTask(orgId, userId, def.id, {
        ttlSeconds: 3600, // expires at start + 1h = 11:00Z
        now: start,
      });

      // At `later` (11:30Z), assignment is expired.
      const processed = await svc.processEvent(
        orgId,
        userId,
        "assign_expire_evt",
        {},
        later,
      );
      expect(processed).toBe(0);

      const list = await svc.getTasksForUser(orgId, userId, {}, later);
      expect(list.find((t) => t.id === def.id)).toBeUndefined();
    });

    test("revokeAssignment hides task and stops progress; re-assign revives", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Revoke Then Revive",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_revoke_evt",
        targetValue: 2,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const userId = `assign-revoke-${Date.now()}`;

      await svc.assignTask(orgId, userId, def.id);
      await svc.processEvent(orgId, userId, "assign_revoke_evt", {});
      // Confirm progress advanced (currentValue=1, not complete yet).
      let list = await svc.getTasksForUser(orgId, userId);
      expect(list.find((t) => t.id === def.id)!.currentValue).toBe(1);

      await svc.revokeAssignment(orgId, userId, def.id);
      list = await svc.getTasksForUser(orgId, userId);
      expect(list.find((t) => t.id === def.id)).toBeUndefined();

      // Event now short-circuits.
      const processed = await svc.processEvent(
        orgId,
        userId,
        "assign_revoke_evt",
        {},
      );
      expect(processed).toBe(0);

      // Re-assign → prior progress (currentValue=1) is retained.
      await svc.assignTask(orgId, userId, def.id);
      list = await svc.getTasksForUser(orgId, userId);
      const view = list.find((t) => t.id === def.id)!;
      expect(view.currentValue).toBe(1);
      expect(view.assignment).not.toBeNull();
    });

    test("revokeAssignment on nonexistent row throws TaskAssignmentNotFound", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Revoke Nothing",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_revoke_nothing_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      await expect(
        svc.revokeAssignment(orgId, "never-assigned", def.id),
      ).rejects.toBeInstanceOf(TaskAssignmentNotFound);
    });

    test("assignTaskToUsers: mixed new + existing counts correctly", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Batch",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_batch_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const stamp = Date.now();
      const u1 = `batch-${stamp}-1`;
      const u2 = `batch-${stamp}-2`;
      const u3 = `batch-${stamp}-3`;

      // Pre-assign one user.
      await svc.assignTask(orgId, u1, def.id);

      const result = await svc.assignTaskToUsers(
        orgId,
        def.id,
        [u1, u2, u2, u3], // u2 duplicated in input
      );

      expect(result.assigned).toBe(2); // u2 + u3
      expect(result.skipped).toBe(1); // u1 already had active row
      expect(result.items).toHaveLength(3); // deduped
    });

    test("assignTaskToUsers above cap throws TaskAssignmentBatchTooLarge", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "TooBig",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_toobig_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const ids = Array.from({ length: 1001 }, (_, i) => `u-${i}`);
      await expect(svc.assignTaskToUsers(orgId, def.id, ids)).rejects.toThrow(
        /batch_too_large|too large/i,
      );
    });

    test("listAssignments filters active by default; activeOnly=false shows revoked", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "ListFilter",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_list_evt",
        targetValue: 1,
        visibility: "assigned",
        rewards: baseRewards,
      });
      const stamp = Date.now();
      const active = `list-${stamp}-a`;
      const revoked = `list-${stamp}-r`;

      await svc.assignTask(orgId, active, def.id);
      await svc.assignTask(orgId, revoked, def.id);
      await svc.revokeAssignment(orgId, revoked, def.id);

      const activeList = await svc.listAssignments(orgId, {
        taskId: def.id,
      });
      const uids = activeList.map((r) => r.endUserId);
      expect(uids).toContain(active);
      expect(uids).not.toContain(revoked);

      const allList = await svc.listAssignments(orgId, {
        taskId: def.id,
        activeOnly: false,
      });
      const allUids = allList.map((r) => r.endUserId);
      expect(allUids).toContain(active);
      expect(allUids).toContain(revoked);
    });

    test("defaultAssignmentTtlSeconds fallback used when no call-level expiry given", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Default TTL",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_ttl_evt",
        targetValue: 1,
        visibility: "assigned",
        defaultAssignmentTtlSeconds: 7200, // 2h
        rewards: baseRewards,
      });
      const userId = `ttl-${Date.now()}`;
      const t0 = new Date("2026-04-18T10:00:00Z");

      const a = await svc.assignTask(orgId, userId, def.id, { now: t0 });
      expect(a.expiresAt).not.toBeNull();
      expect(a.expiresAt!.getTime()).toBe(t0.getTime() + 7200 * 1000);
    });

    test("autoClaim with visibility=assigned does NOT mail unassigned users", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Autoclaim Assigned",
        period: "none",
        countingMethod: "event_count",
        eventName: "assign_autoclaim_evt",
        targetValue: 1,
        visibility: "assigned",
        autoClaim: true,
        rewards: baseRewards,
      });
      const before = captured.length;
      const outsider = `outsider-${Date.now()}`;

      // Outsider fires event — must NOT receive mail.
      await svc.processEvent(orgId, outsider, "assign_autoclaim_evt", {});
      expect(captured.length).toBe(before);

      // Assign real user; same event now mails.
      const insider = `insider-${Date.now()}`;
      await svc.assignTask(orgId, insider, def.id);
      await svc.processEvent(orgId, insider, "assign_autoclaim_evt", {});
      expect(captured.length).toBe(before + 1);
      const mail = captured[captured.length - 1]!;
      expect(Array.isArray(mail.input.targetUserIds)).toBe(true);
      expect((mail.input.targetUserIds as string[])[0]).toBe(insider);

      // Silence unused-var lint.
      expect(def.id).toBeDefined();
    });
  });

  describe("processEvent records to event-catalog", () => {
    test("first external event writes inferred row with fields", async () => {
      const { createEventCatalogService } = await import(
        "../event-catalog/service"
      );
      const catalogSvc = createEventCatalogService({ db });
      const svc = createTaskService(
        { db, eventCatalog: catalogSvc },
        { itemSvc: stubItemSvc, currencySvc: stubCurrencySvc },
        () => undefined,
      );

      const uniqueName = `catalog_evt_${Date.now()}`;
      await svc.processEvent(orgId, "user-catalog-1", uniqueName, {
        foo: "bar",
        amount: 42,
      });

      const view = await catalogSvc.getOne(orgId, uniqueName);
      expect(view.source).toBe("external");
      expect(view.status).toBe("inferred");
      expect(view.fields.map((f) => f.path).sort()).toEqual([
        "amount",
        "foo",
      ]);
    });
  });

  // ─── Activity-bound writable / claimable gate ────────────────────
  describe("activity-bound gate", () => {
    const HOUR = 3_600_000;

    async function seedActivity(opts: {
      alias: string;
      phaseAt: "active" | "teasing" | "ended";
    }): Promise<string> {
      const { activityConfigs } = await import("../../schema/activity");
      const offsetMap = {
        active: 0,
        teasing: -1.5 * HOUR,
        ended: +1.5 * HOUR,
      };
      const anchor = new Date(Date.now() - offsetMap[opts.phaseAt]);
      const [row] = await db
        .insert(activityConfigs)
        .values({
          tenantId: orgId,
          alias: opts.alias,
          name: `gate-${opts.alias}`,
          kind: "generic",
          status: "active",
          visibleAt: new Date(anchor.getTime() - 2 * HOUR),
          startAt: new Date(anchor.getTime() - HOUR),
          endAt: new Date(anchor.getTime() + HOUR),
          hiddenAt: new Date(anchor.getTime() + 24 * HOUR),
        })
        .returning({ id: activityConfigs.id });
      return row!.id;
    }

    test("processEvent: active activity → progress upserted", async () => {
      const activityId = await seedActivity({
        alias: "gate-task-active",
        phaseAt: "active",
      });
      const def = await svc.createDefinition(orgId, {
        name: "Active gate",
        period: "none",
        countingMethod: "event_count",
        eventName: "gate_evt_active",
        targetValue: 5,
        rewards: [],
        activityId,
      });
      const processed = await svc.processEvent(
        orgId,
        "u-gate-task-active",
        "gate_evt_active",
        {},
      );
      expect(processed).toBe(1);
      const tasks = await svc.getTasksForUser(
        orgId,
        "u-gate-task-active",
        {},
      );
      expect(tasks.find((t) => t.id === def.id)?.currentValue).toBe(1);
    });

    test("processEvent: teasing activity → silent skip (no row, no error)", async () => {
      const activityId = await seedActivity({
        alias: "gate-task-teasing",
        phaseAt: "teasing",
      });
      const def = await svc.createDefinition(orgId, {
        name: "Teasing gate",
        period: "none",
        countingMethod: "event_count",
        eventName: "gate_evt_teasing",
        targetValue: 5,
        rewards: [],
        activityId,
      });
      const processed = await svc.processEvent(
        orgId,
        "u-gate-task-teasing",
        "gate_evt_teasing",
        {},
      );
      expect(processed).toBe(0);
      const tasks = await svc.getTasksForUser(
        orgId,
        "u-gate-task-teasing",
        {},
      );
      const t = tasks.find((tk) => tk.id === def.id);
      expect(t?.currentValue ?? 0).toBe(0);
    });

    test("processEvent: mixed batch — active progresses, ended is silently skipped", async () => {
      const activeId = await seedActivity({
        alias: "gate-mix-active",
        phaseAt: "active",
      });
      const endedId = await seedActivity({
        alias: "gate-mix-ended",
        phaseAt: "ended",
      });
      const evtName = "gate_evt_mix";
      const defA = await svc.createDefinition(orgId, {
        name: "mix-A",
        period: "none",
        countingMethod: "event_count",
        eventName: evtName,
        targetValue: 5,
        rewards: [],
        activityId: activeId,
      });
      const defB = await svc.createDefinition(orgId, {
        name: "mix-B",
        period: "none",
        countingMethod: "event_count",
        eventName: evtName,
        targetValue: 5,
        rewards: [],
        activityId: endedId,
      });
      const endUser = "u-gate-mix";
      const processed = await svc.processEvent(orgId, endUser, evtName, {});
      expect(processed).toBe(1); // only the active one counted
      const tasks = await svc.getTasksForUser(orgId, endUser, {});
      expect(tasks.find((t) => t.id === defA.id)?.currentValue).toBe(1);
      expect(tasks.find((t) => t.id === defB.id)?.currentValue ?? 0).toBe(0);
    });

    test("claimReward: ended activity (pre-archive grace window) → claim succeeds", async () => {
      const activityId = await seedActivity({
        alias: "gate-claim-ended",
        phaseAt: "ended",
      });
      const def = await svc.createDefinition(orgId, {
        name: "Claim ended",
        period: "none",
        countingMethod: "event_count",
        eventName: "noop-claim-ended",
        targetValue: 1,
        rewards: [{ type: "item", id: "x", count: 1 }],
        autoClaim: false,
        activityId,
      });
      const { taskUserProgress } = await import("../../schema/task");
      await db.insert(taskUserProgress).values({
        taskId: def.id,
        endUserId: "u-claim-ended",
        tenantId: orgId,
        currentValue: def.targetValue,
        isCompleted: true,
        completedAt: new Date(),
        periodKey: "none",
      });
      const r = await svc.claimReward(orgId, "u-claim-ended", def.id);
      expect(r.taskId).toBe(def.id);
    });

    test("activityId=null def is unaffected by gate (regression)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Standalone gate",
        period: "none",
        countingMethod: "event_count",
        eventName: "gate_evt_standalone",
        targetValue: 5,
        rewards: [],
      });
      const processed = await svc.processEvent(
        orgId,
        "u-gate-standalone",
        "gate_evt_standalone",
        {},
      );
      expect(processed).toBe(1);
      const tasks = await svc.getTasksForUser(
        orgId,
        "u-gate-standalone",
        {},
      );
      expect(tasks.find((t) => t.id === def.id)?.currentValue).toBe(1);
    });
  });
});
