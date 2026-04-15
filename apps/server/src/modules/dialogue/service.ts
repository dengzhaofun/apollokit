/**
 * Dialogue service — protocol-agnostic business logic for in-game
 * dialogue scripts (NPC cutscenes, tutorials, branching conversations).
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or `../../db`. It
 * receives dependencies through the AppDeps type and cross-module service
 * handles (itemService) via the factory. See apps/server/CLAUDE.md.
 *
 * ---------------------------------------------------------------------
 * Script graph model
 * ---------------------------------------------------------------------
 *
 * A script carries:
 *   - startNodeId: where the player begins
 *   - nodes: DialogueNode[] — authored as a jsonb blob, validated on
 *     every write (start node exists, all next pointers resolve, node ids
 *     are unique, option ids are unique within a node, reward
 *     definitionIds all exist in this org's item_definitions).
 *
 * Rewards can appear in two places:
 *   - node.onEnter.rewards — granted the first time a player enters a
 *     node, keyed by `("dialogue_enter", "${scriptId}:${endUserId}:${nodeId}")`
 *     in item_grant_logs.
 *   - option.rewards — granted when a player picks an option to leave a
 *     node, keyed by `("dialogue_option",
 *     "${scriptId}:${endUserId}:${fromNodeId}:${optionId}")`.
 *
 * Both paths are idempotent by a pre-INSERT lookup in item_grant_logs
 * (mirrors the mail claim pattern — item_grant_logs has no unique index
 * on (source, sourceId), so we check first).
 *
 * ---------------------------------------------------------------------
 * State transitions — conditional UPDATE without transactions
 * ---------------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` has no transactions. Advance is therefore a
 * single conditional UPDATE:
 *
 *   UPDATE dialogue_progress
 *      SET currentNodeId = $next,
 *          historyPath   = historyPath || to_jsonb($next),
 *          completedAt   = ($next IS NULL ? now() : null)
 *    WHERE id = $id
 *      AND currentNodeId = $from
 *      AND completedAt IS NULL
 *  RETURNING *;
 *
 * 0 rows returned ⇒ somebody else already advanced (or completed). We
 * re-read and decide:
 *   - If the current state matches what this advance would have produced
 *     (fromNodeId → nextNodeId), treat as a safe idempotent retry, issue
 *     the reward grants (which are themselves idempotent via the lookup
 *     above), and return the session view.
 *   - Otherwise throw DialogueInvalidOption (the client tried to take a
 *     stale option from a different node).
 *
 * ---------------------------------------------------------------------
 * Reset semantics
 * ---------------------------------------------------------------------
 *
 * `/reset` clears dialogue state (currentNodeId ← startNodeId, historyPath
 * ← [startNodeId], completedAt ← null). Rewards are NOT re-granted on
 * replay — grant_log keys are per-(node, option), not per-(attempt). This
 * is intentional: dialogue rewards are a first-visit bonus, not a
 * repeatable farm. Document this boundary so operators don't design
 * reward loops around replay.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { itemDefinitions, itemGrantLogs } from "../../schema/item";
import {
  dialogueProgress,
  dialogueScripts,
} from "../../schema/dialogue";
import type { ItemService } from "../item";
import type { ItemEntry } from "../item/types";
import {
  DialogueAlreadyCompleted,
  DialogueInvalidGraph,
  DialogueInvalidOption,
  DialogueNotRepeatable,
  DialogueOptionRequired,
  DialogueProgressNotFound,
  DialogueScriptAliasConflict,
  DialogueScriptInactive,
  DialogueScriptNotFound,
  DialogueUnknownReward,
} from "./errors";
import type {
  ClientDialogueNode,
  DialogueNode,
  DialogueOption,
  DialogueProgress,
  DialogueRewardGrant,
  DialogueScript,
  DialogueSessionView,
} from "./types";
import type {
  CreateDialogueScriptInput,
  UpdateDialogueScriptInput,
} from "./validators";

type DialogueDeps = Pick<AppDeps, "db">;

const SOURCE_ENTER = "dialogue_enter";
const SOURCE_OPTION = "dialogue_option";

function enterSourceId(scriptId: string, endUserId: string, nodeId: string) {
  return `${scriptId}:${endUserId}:${nodeId}`;
}

function optionSourceId(
  scriptId: string,
  endUserId: string,
  fromNodeId: string,
  optionId: string,
) {
  return `${scriptId}:${endUserId}:${fromNodeId}:${optionId}`;
}

function toClientNode(node: DialogueNode): ClientDialogueNode {
  const hasOptions = node.options && node.options.length > 0;
  const isTerminal = !hasOptions && !node.next;
  return {
    id: node.id,
    speaker: node.speaker,
    content: node.content,
    next: node.next,
    options: node.options?.map((o) => ({
      id: o.id,
      label: o.label,
      next: o.next,
      action: o.action,
    })),
    isTerminal,
  };
}

function validateGraph(
  startNodeId: string,
  nodes: DialogueNode[],
): void {
  if (nodes.length === 0) {
    throw new DialogueInvalidGraph("nodes must not be empty");
  }
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new DialogueInvalidGraph(`duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
  }
  if (!ids.has(startNodeId)) {
    throw new DialogueInvalidGraph(
      `startNodeId '${startNodeId}' is not among nodes`,
    );
  }
  for (const n of nodes) {
    if (n.next !== undefined && !ids.has(n.next)) {
      throw new DialogueInvalidGraph(
        `node '${n.id}'.next='${n.next}' points to unknown node`,
      );
    }
    if (n.options) {
      const optionIds = new Set<string>();
      for (const o of n.options) {
        if (optionIds.has(o.id)) {
          throw new DialogueInvalidGraph(
            `duplicate option id '${o.id}' in node '${n.id}'`,
          );
        }
        optionIds.add(o.id);
        if (o.next !== undefined && !ids.has(o.next)) {
          throw new DialogueInvalidGraph(
            `option '${n.id}.${o.id}'.next='${o.next}' points to unknown node`,
          );
        }
      }
    }
  }
}

function collectRewardDefinitionIds(nodes: DialogueNode[]): string[] {
  const ids = new Set<string>();
  for (const n of nodes) {
    for (const r of n.onEnter?.rewards ?? []) ids.add(r.definitionId);
    for (const o of n.options ?? []) {
      for (const r of o.rewards ?? []) ids.add(r.definitionId);
    }
  }
  return Array.from(ids);
}

export function createDialogueService(d: DialogueDeps, itemSvc: ItemService) {
  const { db } = d;
  // itemSvc is retained on closure only for parity with mail/shop wiring;
  // grantItems is called through it so future cross-cutting concerns (logs,
  // metrics) hit one funnel.
  void itemSvc;

  async function assertRewardDefinitionsExist(
    organizationId: string,
    nodes: DialogueNode[],
  ): Promise<void> {
    const ids = collectRewardDefinitionIds(nodes);
    if (ids.length === 0) return;
    const rows = await db
      .select({ id: itemDefinitions.id })
      .from(itemDefinitions)
      .where(
        and(
          eq(itemDefinitions.organizationId, organizationId),
          inArray(itemDefinitions.id, ids),
        ),
      );
    const known = new Set(rows.map((r) => r.id));
    for (const id of ids) {
      if (!known.has(id)) throw new DialogueUnknownReward(id);
    }
  }

  async function loadScriptById(
    organizationId: string,
    id: string,
  ): Promise<DialogueScript> {
    const rows = await db
      .select()
      .from(dialogueScripts)
      .where(
        and(
          eq(dialogueScripts.id, id),
          eq(dialogueScripts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new DialogueScriptNotFound(id);
    return rows[0];
  }

  async function loadScriptByAlias(
    organizationId: string,
    alias: string,
  ): Promise<DialogueScript> {
    const rows = await db
      .select()
      .from(dialogueScripts)
      .where(
        and(
          eq(dialogueScripts.alias, alias),
          eq(dialogueScripts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new DialogueScriptNotFound(alias);
    return rows[0];
  }

  async function loadProgress(
    organizationId: string,
    endUserId: string,
    scriptId: string,
  ): Promise<DialogueProgress | null> {
    const rows = await db
      .select()
      .from(dialogueProgress)
      .where(
        and(
          eq(dialogueProgress.organizationId, organizationId),
          eq(dialogueProgress.endUserId, endUserId),
          eq(dialogueProgress.scriptId, scriptId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Idempotent grant — only inserts if `(source, sourceId)` isn't already
   * logged for this user. Returns whether new rewards were granted.
   */
  async function grantIfNew(
    organizationId: string,
    endUserId: string,
    rewards: ItemEntry[],
    source: string,
    sourceId: string,
  ): Promise<boolean> {
    if (rewards.length === 0) return false;
    const prior = await db
      .select({ id: itemGrantLogs.id })
      .from(itemGrantLogs)
      .where(
        and(
          eq(itemGrantLogs.organizationId, organizationId),
          eq(itemGrantLogs.endUserId, endUserId),
          eq(itemGrantLogs.source, source),
          eq(itemGrantLogs.sourceId, sourceId),
        ),
      )
      .limit(1);
    if (prior.length > 0) return false;
    await itemSvc.grantItems({
      organizationId,
      endUserId,
      grants: rewards,
      source,
      sourceId,
    });
    return true;
  }

  function findNode(script: DialogueScript, nodeId: string): DialogueNode {
    const node = script.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new DialogueInvalidGraph(
        `script ${script.id} missing node ${nodeId} at runtime — graph corrupted`,
      );
    }
    return node;
  }

  function findOption(
    node: DialogueNode,
    optionId: string,
  ): DialogueOption {
    const opt = node.options?.find((o) => o.id === optionId);
    if (!opt) {
      throw new DialogueInvalidOption(
        `node '${node.id}' has no option '${optionId}'`,
      );
    }
    return opt;
  }

  function buildSessionView(
    script: DialogueScript,
    progress: DialogueProgress,
    granted: DialogueRewardGrant[],
  ): DialogueSessionView {
    const currentNode = progress.currentNodeId
      ? toClientNode(findNode(script, progress.currentNodeId))
      : null;
    return {
      scriptId: script.id,
      scriptAlias: script.alias ?? "",
      currentNode,
      historyPath: progress.historyPath,
      completedAt: progress.completedAt?.toISOString() ?? null,
      grantedRewards: granted,
    };
  }

  return {
    // ─── Admin — CRUD ──────────────────────────────────────────

    async createScript(
      organizationId: string,
      input: CreateDialogueScriptInput,
    ): Promise<DialogueScript> {
      const nodes = input.nodes as DialogueNode[];
      validateGraph(input.startNodeId, nodes);
      await assertRewardDefinitionsExist(organizationId, nodes);

      try {
        const [row] = await db
          .insert(dialogueScripts)
          .values({
            organizationId,
            alias: input.alias ?? null,
            name: input.name,
            description: input.description ?? null,
            startNodeId: input.startNodeId,
            nodes,
            triggerCondition: input.triggerCondition ?? null,
            repeatable: input.repeatable ?? false,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("dialogue script insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new DialogueScriptAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateScript(
      organizationId: string,
      id: string,
      input: UpdateDialogueScriptInput,
    ): Promise<DialogueScript> {
      const existing = await loadScriptById(organizationId, id);

      // Validate merged graph so partial updates can't leave the script
      // in an inconsistent state.
      const mergedStart = input.startNodeId ?? existing.startNodeId;
      const mergedNodes =
        input.nodes !== undefined
          ? (input.nodes as DialogueNode[])
          : existing.nodes;
      if (input.nodes !== undefined || input.startNodeId !== undefined) {
        validateGraph(mergedStart, mergedNodes);
        if (input.nodes !== undefined) {
          await assertRewardDefinitionsExist(organizationId, mergedNodes);
        }
      }

      const patch: Record<string, unknown> = {};
      if (input.alias !== undefined) patch.alias = input.alias;
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.startNodeId !== undefined) patch.startNodeId = input.startNodeId;
      if (input.nodes !== undefined) patch.nodes = mergedNodes;
      if (input.triggerCondition !== undefined)
        patch.triggerCondition = input.triggerCondition;
      if (input.repeatable !== undefined) patch.repeatable = input.repeatable;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      if (Object.keys(patch).length === 0) return existing;

      try {
        const [row] = await db
          .update(dialogueScripts)
          .set(patch)
          .where(
            and(
              eq(dialogueScripts.id, id),
              eq(dialogueScripts.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new DialogueScriptNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && typeof input.alias === "string") {
          throw new DialogueScriptAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async deleteScript(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(dialogueScripts)
        .where(
          and(
            eq(dialogueScripts.id, id),
            eq(dialogueScripts.organizationId, organizationId),
          ),
        )
        .returning({ id: dialogueScripts.id });
      if (deleted.length === 0) throw new DialogueScriptNotFound(id);
    },

    async listScripts(organizationId: string): Promise<DialogueScript[]> {
      return db
        .select()
        .from(dialogueScripts)
        .where(eq(dialogueScripts.organizationId, organizationId));
    },

    async getScript(
      organizationId: string,
      id: string,
    ): Promise<DialogueScript> {
      return loadScriptById(organizationId, id);
    },

    // ─── Client — start / advance / reset ──────────────────────

    /**
     * Start or resume a script for an end user.
     *
     * First visit: creates a dialogue_progress row positioned at the
     * startNode, grants startNode.onEnter.rewards (idempotent).
     * Subsequent visits: returns the current progress unchanged.
     * Concurrent first-visits are resolved by the unique constraint on
     * (organizationId, endUserId, scriptId) — the loser falls through
     * to the re-read branch.
     */
    async start(
      organizationId: string,
      endUserId: string,
      alias: string,
    ): Promise<DialogueSessionView> {
      const script = await loadScriptByAlias(organizationId, alias);
      if (!script.isActive) throw new DialogueScriptInactive(alias);

      const startNode = findNode(script, script.startNodeId);
      const granted: DialogueRewardGrant[] = [];

      // Upsert-first path: if a progress row exists, don't overwrite it.
      const existing = await loadProgress(
        organizationId,
        endUserId,
        script.id,
      );
      if (existing) {
        return buildSessionView(script, existing, granted);
      }

      // Fresh start — insert; on unique-violation, re-read and return.
      try {
        const [row] = await db
          .insert(dialogueProgress)
          .values({
            organizationId,
            endUserId,
            scriptId: script.id,
            currentNodeId: script.startNodeId,
            historyPath: [script.startNodeId],
            completedAt: null,
          })
          .returning();
        if (!row) throw new Error("dialogue_progress insert returned no row");

        // Grant onEnter rewards for the start node (idempotent).
        const enterRewards = startNode.onEnter?.rewards ?? [];
        const didGrant = await grantIfNew(
          organizationId,
          endUserId,
          enterRewards,
          SOURCE_ENTER,
          enterSourceId(script.id, endUserId, startNode.id),
        );
        if (didGrant) {
          granted.push({
            origin: "enter",
            nodeId: startNode.id,
            rewards: enterRewards,
          });
        }

        return buildSessionView(script, row, granted);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const fallback = await loadProgress(
          organizationId,
          endUserId,
          script.id,
        );
        if (!fallback) throw err;
        return buildSessionView(script, fallback, granted);
      }
    },

    /**
     * Advance the session by one node.
     *
     * If the current node has options, `optionId` is required. If the
     * current node has no options, `optionId` must be omitted; the
     * transition uses `node.next`.
     *
     * If the resulting next pointer is undefined the script completes
     * (completedAt set, currentNodeId cleared).
     */
    async advance(
      organizationId: string,
      endUserId: string,
      alias: string,
      optionId: string | undefined,
    ): Promise<DialogueSessionView> {
      const script = await loadScriptByAlias(organizationId, alias);
      if (!script.isActive) throw new DialogueScriptInactive(alias);

      const progress = await loadProgress(
        organizationId,
        endUserId,
        script.id,
      );
      if (!progress) {
        throw new DialogueProgressNotFound(alias, endUserId);
      }
      if (progress.completedAt) {
        throw new DialogueAlreadyCompleted(alias);
      }
      if (!progress.currentNodeId) {
        throw new DialogueAlreadyCompleted(alias);
      }

      const fromNode = findNode(script, progress.currentNodeId);
      const hasOptions = (fromNode.options ?? []).length > 0;

      let chosenOption: DialogueOption | null = null;
      if (hasOptions) {
        if (!optionId) throw new DialogueOptionRequired(fromNode.id);
        chosenOption = findOption(fromNode, optionId);
      } else if (optionId) {
        throw new DialogueInvalidOption(
          `node '${fromNode.id}' has no options; optionId must be omitted`,
        );
      }

      const nextNodeId = chosenOption?.next ?? fromNode.next ?? null;
      const nowIso = new Date();

      // Conditional UPDATE — classic "winner takes it" state transition.
      // `historyPath || to_jsonb($next)` appends only when next is non-null.
      const nextPush = nextNodeId
        ? sql`${dialogueProgress.historyPath} || ${JSON.stringify([nextNodeId])}::jsonb`
        : sql`${dialogueProgress.historyPath}`;

      const updated = await db
        .update(dialogueProgress)
        .set({
          currentNodeId: nextNodeId,
          historyPath: nextPush as unknown as string[],
          completedAt: nextNodeId ? null : nowIso,
        })
        .where(
          and(
            eq(dialogueProgress.id, progress.id),
            eq(dialogueProgress.currentNodeId, fromNode.id),
            isNull(dialogueProgress.completedAt),
          ),
        )
        .returning();

      let effectiveProgress: DialogueProgress | undefined = updated[0];

      if (!effectiveProgress) {
        // Zero-row update: the progress moved between our SELECT and UPDATE.
        // If the current state matches what we would have produced, treat
        // as an idempotent retry. Otherwise it's a genuine invalid op.
        const latest = await loadProgress(
          organizationId,
          endUserId,
          script.id,
        );
        if (!latest) {
          throw new DialogueProgressNotFound(alias, endUserId);
        }
        const lastVisited = latest.historyPath[latest.historyPath.length - 1];
        const priorVisited =
          latest.historyPath[latest.historyPath.length - 2] ?? null;
        const matchesOurTransition =
          priorVisited === fromNode.id && lastVisited === nextNodeId;
        if (matchesOurTransition) {
          effectiveProgress = latest;
        } else {
          throw new DialogueInvalidOption(
            `cannot advance: session no longer at node '${fromNode.id}'`,
          );
        }
      }

      // Grant rewards. Both grants are idempotent via item_grant_logs
      // lookup, so repeating this block on a safe retry is harmless.
      const granted: DialogueRewardGrant[] = [];

      if (chosenOption && (chosenOption.rewards ?? []).length > 0) {
        const rewards = chosenOption.rewards!;
        const didGrant = await grantIfNew(
          organizationId,
          endUserId,
          rewards,
          SOURCE_OPTION,
          optionSourceId(
            script.id,
            endUserId,
            fromNode.id,
            chosenOption.id,
          ),
        );
        if (didGrant) {
          granted.push({
            origin: "option",
            nodeId: fromNode.id,
            optionId: chosenOption.id,
            rewards,
          });
        }
      }

      if (nextNodeId) {
        const nextNode = findNode(script, nextNodeId);
        const enterRewards = nextNode.onEnter?.rewards ?? [];
        if (enterRewards.length > 0) {
          const didGrant = await grantIfNew(
            organizationId,
            endUserId,
            enterRewards,
            SOURCE_ENTER,
            enterSourceId(script.id, endUserId, nextNodeId),
          );
          if (didGrant) {
            granted.push({
              origin: "enter",
              nodeId: nextNodeId,
              rewards: enterRewards,
            });
          }
        }
      }

      return buildSessionView(script, effectiveProgress, granted);
    },

    /**
     * Reset a completed or in-progress session back to the startNode.
     *
     * Only allowed when the script has `repeatable=true`. Does NOT
     * re-grant rewards — see file header.
     */
    async reset(
      organizationId: string,
      endUserId: string,
      alias: string,
    ): Promise<DialogueSessionView> {
      const script = await loadScriptByAlias(organizationId, alias);
      if (!script.repeatable) throw new DialogueNotRepeatable(alias);

      const progress = await loadProgress(
        organizationId,
        endUserId,
        script.id,
      );
      if (!progress) {
        // No progress yet — calling reset is effectively a no-op; fall
        // through to a normal start so clients don't have to branch.
        return this.start(organizationId, endUserId, alias);
      }

      const [row] = await db
        .update(dialogueProgress)
        .set({
          currentNodeId: script.startNodeId,
          historyPath: [script.startNodeId],
          completedAt: null,
        })
        .where(eq(dialogueProgress.id, progress.id))
        .returning();
      if (!row) {
        throw new DialogueProgressNotFound(alias, endUserId);
      }

      return buildSessionView(script, row, []);
    },
  };
}

export type DialogueService = ReturnType<typeof createDialogueService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
