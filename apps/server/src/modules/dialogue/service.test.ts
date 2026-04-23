/**
 * Service-layer tests for dialogue.
 *
 * Hits the real Neon dev branch. Covers:
 *   - graph validation (start node, dangling nexts, duplicate ids,
 *     unknown reward definition ids)
 *   - start → advance happy path including branching + rewards
 *   - advance idempotency on retry
 *   - completion clears currentNodeId and sets completedAt
 *   - reset requires repeatable=true
 */

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { itemDefinitions, itemGrantLogs } from "../../schema/item";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCharacterService } from "../character/service";
import { createItemService } from "../item/service";
import { createDialogueService } from "./service";
import type { DialogueNode } from "./types";

const itemSvc = createItemService({ db });
const characterSvc = createCharacterService({ db });
const svc = createDialogueService({ db }, itemSvc);

async function seedDefinition(orgId: string): Promise<string> {
  const [row] = await db
    .insert(itemDefinitions)
    .values({
      organizationId: orgId,
      alias: `gold-${crypto.randomUUID().slice(0, 6)}`,
      name: "gold",
    })
    .returning({ id: itemDefinitions.id });
  return row!.id;
}

function simpleNodes(): DialogueNode[] {
  return [
    {
      id: "start",
      speaker: { name: "NPC", side: "left" },
      content: "Hello!",
      next: "end",
    },
    {
      id: "end",
      speaker: { name: "NPC", side: "left" },
      content: "Goodbye!",
    },
  ];
}

describe("dialogue service — graph validation", () => {
  let orgId: string;
  beforeAll(async () => {
    orgId = await createTestOrg("dlg-graph");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("rejects missing start node", async () => {
    await expect(
      svc.createScript(orgId, {
        name: "bad",
        startNodeId: "nowhere",
        nodes: simpleNodes(),
      }),
    ).rejects.toMatchObject({ code: "dialogue.invalid_graph" });
  });

  test("rejects dangling option.next", async () => {
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { name: "NPC", side: "left" },
        content: "?",
        options: [
          { id: "a", label: "go", next: "ghost" },
        ],
      },
    ];
    await expect(
      svc.createScript(orgId, {
        name: "bad",
        startNodeId: "start",
        nodes,
      }),
    ).rejects.toMatchObject({ code: "dialogue.invalid_graph" });
  });

  test("rejects duplicate node id", async () => {
    const nodes = [
      ...simpleNodes(),
      {
        id: "start",
        speaker: { name: "NPC", side: "left" },
        content: "dup",
      },
    ] as DialogueNode[];
    await expect(
      svc.createScript(orgId, {
        name: "bad",
        startNodeId: "start",
        nodes,
      }),
    ).rejects.toMatchObject({ code: "dialogue.invalid_graph" });
  });

  test("rejects unknown reward definition", async () => {
    const uuid = "99999999-9999-4999-8999-999999999999";
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { name: "NPC", side: "left" },
        content: "ok",
        onEnter: { rewards: [{ definitionId: uuid, quantity: 1 }] },
      },
    ];
    await expect(
      svc.createScript(orgId, {
        name: "bad",
        startNodeId: "start",
        nodes,
      }),
    ).rejects.toMatchObject({ code: "dialogue.unknown_reward" });
  });
});

describe("dialogue service — start/advance/reset", () => {
  let orgId: string;
  let goldDefId: string;
  beforeAll(async () => {
    orgId = await createTestOrg("dlg-flow");
    goldDefId = await seedDefinition(orgId);
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("linear script: start → advance completes and grants rewards", async () => {
    const nodes: DialogueNode[] = [
      {
        id: "greet",
        speaker: { name: "Elder", side: "left" },
        content: "Take this, brave one.",
        onEnter: { rewards: [{ definitionId: goldDefId, quantity: 10 }] },
        next: "farewell",
      },
      {
        id: "farewell",
        speaker: { name: "Elder", side: "left" },
        content: "Safe travels.",
      },
    ];
    const script = await svc.createScript(orgId, {
      alias: "linear-script",
      name: "linear",
      startNodeId: "greet",
      nodes,
    });

    const endUserId = `user-${crypto.randomUUID()}`;
    const s1 = await svc.start(orgId, endUserId, "linear-script");
    expect(s1.currentNode?.id).toBe("greet");
    expect(s1.grantedRewards).toHaveLength(1);
    expect(s1.grantedRewards[0]!.origin).toBe("enter");

    // First advance: greet → farewell. farewell has no `next`, so it's the
    // terminal node but we're currently *at* it (viewing the goodbye line).
    const s2 = await svc.advance(orgId, endUserId, "linear-script", undefined);
    expect(s2.currentNode?.id).toBe("farewell");
    expect(s2.currentNode?.isTerminal).toBe(true);
    expect(s2.completedAt).toBeNull();

    // Second advance from the terminal farewell node completes the script.
    const s3 = await svc.advance(orgId, endUserId, "linear-script", undefined);
    expect(s3.currentNode).toBeNull();
    expect(s3.completedAt).not.toBeNull();

    // Cannot advance once completed
    await expect(
      svc.advance(orgId, endUserId, "linear-script", undefined),
    ).rejects.toMatchObject({ code: "dialogue.already_completed" });

    // Reward only granted once (check grant log)
    const logs = await db
      .select({ id: itemGrantLogs.id })
      .from(itemGrantLogs)
      .where(
        and(
          eq(itemGrantLogs.organizationId, orgId),
          eq(itemGrantLogs.endUserId, endUserId),
          eq(itemGrantLogs.source, "dialogue_enter"),
          eq(itemGrantLogs.sourceId, `${script.id}:${endUserId}:greet`),
        ),
      );
    expect(logs).toHaveLength(1);

    // clean up the script
    await svc.deleteScript(orgId, script.id);
  });

  test("branching script: option rewards grant on choice, not on alt branch", async () => {
    const nodes: DialogueNode[] = [
      {
        id: "pick",
        speaker: { name: "NPC", side: "left" },
        content: "Pick one.",
        options: [
          {
            id: "giveGold",
            label: "take gold",
            rewards: [{ definitionId: goldDefId, quantity: 5 }],
            next: "end",
          },
          { id: "leave", label: "walk away", next: "end" },
        ],
      },
      { id: "end", speaker: { name: "NPC", side: "left" }, content: "bye" },
    ];
    const script = await svc.createScript(orgId, {
      alias: "branching-script",
      name: "branching",
      startNodeId: "pick",
      nodes,
    });

    const u1 = `user-${crypto.randomUUID()}`;
    const u2 = `user-${crypto.randomUUID()}`;

    // u1 picks gold
    await svc.start(orgId, u1, "branching-script");
    const s1 = await svc.advance(orgId, u1, "branching-script", "giveGold");
    expect(s1.grantedRewards.some((g) => g.origin === "option")).toBe(true);

    // u2 walks away
    await svc.start(orgId, u2, "branching-script");
    const s2 = await svc.advance(orgId, u2, "branching-script", "leave");
    expect(s2.grantedRewards.every((g) => g.origin !== "option")).toBe(true);

    await svc.deleteScript(orgId, script.id);
  });

  test("advance requires optionId when node has options", async () => {
    const nodes: DialogueNode[] = [
      {
        id: "q",
        speaker: { name: "NPC", side: "left" },
        content: "Which way?",
        options: [
          { id: "left", label: "left", next: "end" },
          { id: "right", label: "right", next: "end" },
        ],
      },
      { id: "end", speaker: { name: "NPC", side: "left" }, content: "end" },
    ];
    const script = await svc.createScript(orgId, {
      alias: "required-option",
      name: "req",
      startNodeId: "q",
      nodes,
    });
    const u = `user-${crypto.randomUUID()}`;
    await svc.start(orgId, u, "required-option");
    await expect(
      svc.advance(orgId, u, "required-option", undefined),
    ).rejects.toMatchObject({ code: "dialogue.option_required" });
    await expect(
      svc.advance(orgId, u, "required-option", "nonexistent"),
    ).rejects.toMatchObject({ code: "dialogue.invalid_option" });

    await svc.deleteScript(orgId, script.id);
  });

  test("reset rejected on non-repeatable, allowed on repeatable", async () => {
    const nodes = simpleNodes();
    const oneShot = await svc.createScript(orgId, {
      alias: "one-shot",
      name: "one",
      startNodeId: "start",
      nodes,
    });
    const redo = await svc.createScript(orgId, {
      alias: "redo",
      name: "redo",
      startNodeId: "start",
      nodes,
      repeatable: true,
    });

    const u = `user-${crypto.randomUUID()}`;

    await svc.start(orgId, u, "one-shot");
    await expect(
      svc.reset(orgId, u, "one-shot"),
    ).rejects.toMatchObject({ code: "dialogue.not_repeatable" });

    await svc.start(orgId, u, "redo");
    await svc.advance(orgId, u, "redo", undefined);
    const afterReset = await svc.reset(orgId, u, "redo");
    expect(afterReset.currentNode?.id).toBe("start");
    expect(afterReset.completedAt).toBeNull();
    expect(afterReset.historyPath).toEqual(["start"]);

    await svc.deleteScript(orgId, oneShot.id);
    await svc.deleteScript(orgId, redo.id);
  });

  test("start is idempotent: second call returns the same progress, no new rewards", async () => {
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { name: "NPC", side: "left" },
        content: "hi",
        onEnter: { rewards: [{ definitionId: goldDefId, quantity: 7 }] },
      },
    ];
    const script = await svc.createScript(orgId, {
      alias: "idempotent-start",
      name: "idemp",
      startNodeId: "start",
      nodes,
    });
    const u = `user-${crypto.randomUUID()}`;

    const s1 = await svc.start(orgId, u, "idempotent-start");
    expect(s1.grantedRewards).toHaveLength(1);

    const s2 = await svc.start(orgId, u, "idempotent-start");
    expect(s2.grantedRewards).toHaveLength(0);
    expect(s2.currentNode?.id).toBe("start");

    await svc.deleteScript(orgId, script.id);
  });

  test("inactive script rejected at start/advance", async () => {
    const script = await svc.createScript(orgId, {
      alias: "dormant",
      name: "dormant",
      startNodeId: "start",
      nodes: simpleNodes(),
      isActive: false,
    });
    await expect(
      svc.start(orgId, "u-whatever", "dormant"),
    ).rejects.toMatchObject({ code: "dialogue.script_inactive" });
    await svc.deleteScript(orgId, script.id);
  });
});

// ─── character-backed speaker ───────────────────────────────────
//
// The character module lets authors reference a shared NPC row instead
// of inlining name/avatar on every node. The dialogue service
//  (a) validates the reference on write,
//  (b) flattens name/avatarUrl into the client payload on read, pulled
//      live from character_definitions so renaming takes effect
//      immediately across every script that references it.

describe("dialogue service — character-backed speakers", () => {
  let orgId: string;
  beforeAll(async () => {
    orgId = await createTestOrg("dlg-character");
  });
  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("rejects unknown speaker.characterId on create", async () => {
    const ghostId = crypto.randomUUID();
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { characterId: ghostId, side: "left" },
        content: "hi",
      },
    ];
    await expect(
      svc.createScript(orgId, {
        alias: "bad-ref",
        name: "bad-ref",
        startNodeId: "start",
        nodes,
      }),
    ).rejects.toMatchObject({ code: "dialogue.unknown_character" });
  });

  test("client payload surfaces the character's live name/avatar", async () => {
    const chief = await characterSvc.createCharacter(orgId, {
      alias: `chief-${crypto.randomUUID().slice(0, 6)}`,
      name: "Village Chief",
      avatarUrl: "https://cdn.example.com/chief-v1.png",
    });

    const alias = `chief-intro-${crypto.randomUUID().slice(0, 6)}`;
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { characterId: chief.id, side: "left" },
        content: "Welcome!",
      },
    ];
    await svc.createScript(orgId, {
      alias,
      name: "chief-intro",
      startNodeId: "start",
      nodes,
    });

    const userId = `u-chief-${crypto.randomUUID().slice(0, 6)}`;
    const first = await svc.start(orgId, userId, alias);
    expect(first.currentNode?.speaker).toMatchObject({
      name: "Village Chief",
      avatarUrl: "https://cdn.example.com/chief-v1.png",
      side: "left",
    });
    // characterId is authoring metadata — must NOT leak to the client.
    expect(
      (first.currentNode?.speaker as Record<string, unknown>).characterId,
    ).toBeUndefined();

    // Rename + re-avatar the character; the same script's next /start
    // must reflect the change without any script edit.
    await characterSvc.updateCharacter(orgId, chief.id, {
      name: "Elder Chief",
      avatarUrl: "https://cdn.example.com/chief-v2.png",
    });
    const second = await svc.start(orgId, userId, alias);
    expect(second.currentNode?.speaker).toMatchObject({
      name: "Elder Chief",
      avatarUrl: "https://cdn.example.com/chief-v2.png",
    });
  });

  test("inline speaker (no characterId) still works", async () => {
    const alias = `inline-${crypto.randomUUID().slice(0, 6)}`;
    const nodes: DialogueNode[] = [
      {
        id: "start",
        speaker: { name: "System", side: "right" },
        content: "Hello from narrator.",
      },
    ];
    await svc.createScript(orgId, {
      alias,
      name: "inline",
      startNodeId: "start",
      nodes,
    });
    const view = await svc.start(orgId, `u-inline-${crypto.randomUUID()}`, alias);
    expect(view.currentNode?.speaker).toEqual({
      name: "System",
      avatarUrl: undefined,
      side: "right",
    });
  });

  test("update that adds a new unknown characterId is also rejected", async () => {
    const existing = await characterSvc.createCharacter(orgId, {
      name: "Real",
    });
    const alias = `upd-${crypto.randomUUID().slice(0, 6)}`;
    const created = await svc.createScript(orgId, {
      alias,
      name: "upd",
      startNodeId: "start",
      nodes: [
        {
          id: "start",
          speaker: { characterId: existing.id, side: "left" },
          content: "a",
        },
      ],
    });
    const ghostId = crypto.randomUUID();
    await expect(
      svc.updateScript(orgId, created.id, {
        nodes: [
          {
            id: "start",
            speaker: { characterId: ghostId, side: "left" },
            content: "a",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "dialogue.unknown_character" });
  });
});
