/**
 * Badge service — protocol-agnostic business logic for the red-dot
 * (notification-badge) system.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP
 * concepts. Per CLAUDE.md § "Service layer purity". Takes
 * `Pick<AppDeps, "db" | "redis">` — no business-module deps.
 *
 * ---------------------------------------------------------------------
 * Data flow summary
 * ---------------------------------------------------------------------
 *
 * Write side:
 *   signal() / signalBatch() — customer UPSERTs counter rows. Three
 *     modes (set/add/clear) map to a single atomic INSERT ... ON
 *     CONFLICT ... DO UPDATE statement per row. After writes, the
 *     per-user cacheVersion is bumped so the next /tree read will
 *     miss and recompute.
 *
 * Read side:
 *   getTree() — pulls the user's signals + dismissals in two single-
 *     table scans, assembles the tree in memory via `tree.ts`, writes
 *     the result to Redis under the current cacheVersion. Cold cache
 *     p95 is dominated by the two SELECTs (single-table, indexed).
 *
 * Tree mutation (Admin):
 *   createNode / updateNode / deleteNode / preview / ...
 *     These go through the same `db` connection and cascade-soft-delete
 *     children on parent removal. Nothing touches Redis here — Admin
 *     mutations don't need to invalidate per-user caches because the
 *     node set is a *template*: a changed node only affects a
 *     subsequent /tree response, and per-user bumps happen naturally
 *     on the next signal write or can be triggered by a bulk rebuild
 *     job if the change is large enough to matter.
 */

import { and, asc, desc, eq, isNull, inArray, like, or, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { type MoveBody, appendKey, moveAndReturn } from "../../lib/fractional-order";
import {
  badgeDismissals,
  badgeNodes,
  badgeSignalRegistry,
  badgeSignals,
  type BadgeDismissal,
  type BadgeNode,
  type BadgeSignal,
  type BadgeSignalRegistryEntry,
} from "../../schema/badge";
import { createBadgeCache } from "./cache";
import {
  BadgeDismissNotAllowed,
  BadgeInvalidDismissConfig,
  BadgeInvalidSignalBinding,
  BadgeNodeCycle,
  BadgeNodeKeyConflict,
  BadgeNodeNotFound,
  BadgeSignalInvalidInput,
  BadgeSignalRegistryConflict,
  BadgeTemplateNotFound,
} from "./errors";
import { BADGE_TEMPLATES, findBadgeTemplate } from "./templates";
import { assembleTree } from "./tree";
import type { BadgeDismissMode, BadgeTreeNode, SignalInput } from "./types";
import type {
  CreateNodeInput,
  FromTemplateInputSchema,
  UpdateNodeInput,
} from "./validators";
import type { z } from "@hono/zod-openapi";

type BadgeDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "redis">>;

type FromTemplateInput = z.infer<typeof FromTemplateInputSchema>;

// ─── Helpers ──────────────────────────────────────────────────────

function validateSignalBinding(input: {
  signalMatchMode: string;
  signalKey?: string | null;
  signalKeyPrefix?: string | null;
}): void {
  if (input.signalMatchMode === "exact") {
    if (!input.signalKey) {
      throw new BadgeInvalidSignalBinding(
        "signalKey is required when signalMatchMode='exact'",
      );
    }
    if (input.signalKeyPrefix) {
      throw new BadgeInvalidSignalBinding(
        "signalKeyPrefix must not be set when signalMatchMode='exact'",
      );
    }
  } else if (input.signalMatchMode === "prefix") {
    if (!input.signalKeyPrefix) {
      throw new BadgeInvalidSignalBinding(
        "signalKeyPrefix is required when signalMatchMode='prefix'",
      );
    }
    if (input.signalKey) {
      throw new BadgeInvalidSignalBinding(
        "signalKey must not be set when signalMatchMode='prefix'",
      );
    }
  } else if (input.signalMatchMode === "none") {
    if (input.signalKey || input.signalKeyPrefix) {
      throw new BadgeInvalidSignalBinding(
        "neither signalKey nor signalKeyPrefix allowed when signalMatchMode='none'",
      );
    }
  }
}

function validateDismissConfig(
  mode: BadgeDismissMode,
  config: Record<string, unknown> | null | undefined,
): void {
  switch (mode) {
    case "cooldown": {
      const n = Number(config?.cooldownSec);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadgeInvalidDismissConfig(
          "dismissConfig.cooldownSec (positive number of seconds) is required when dismissMode='cooldown'",
        );
      }
      break;
    }
    case "daily": {
      const periodType = config?.periodType;
      if (
        periodType !== undefined &&
        periodType !== "daily" &&
        periodType !== "weekly" &&
        periodType !== "monthly" &&
        periodType !== "none"
      ) {
        throw new BadgeInvalidDismissConfig(
          "dismissConfig.periodType must be one of 'daily'|'weekly'|'monthly'|'none'",
        );
      }
      break;
    }
    default:
      // no required config for other modes
      break;
  }
}

/**
 * DFS cycle + dangling-parent detection over the org's node set with
 * one pending (create/update) replacement applied.
 */
function findCycle(
  nodes: { key: string; parentKey: string | null }[],
): string[] | null {
  const byKey = new Map(nodes.map((n) => [n.key, n.parentKey ?? null]));
  for (const start of nodes) {
    const seen: string[] = [];
    let cursor: string | null = start.key;
    while (cursor != null) {
      if (seen.includes(cursor)) {
        return [...seen, cursor];
      }
      seen.push(cursor);
      const parent = byKey.get(cursor);
      cursor = parent ?? null;
    }
  }
  return null;
}

function serializeNode(row: BadgeNode) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    parentKey: row.parentKey,
    displayType: row.displayType,
    displayLabelKey: row.displayLabelKey,
    signalMatchMode: row.signalMatchMode,
    signalKey: row.signalKey,
    signalKeyPrefix: row.signalKeyPrefix,
    aggregation: row.aggregation,
    dismissMode: row.dismissMode,
    dismissConfig: (row.dismissConfig as Record<string, unknown> | null) ?? null,
    visibilityRule:
      (row.visibilityRule as Record<string, unknown> | null) ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSignalWrite(row: BadgeSignal) {
  return {
    endUserId: row.endUserId,
    signalKey: row.signalKey,
    count: row.count,
    version: row.version,
    firstAppearedAt: row.firstAppearedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRegistry(row: BadgeSignalRegistryEntry) {
  return {
    tenantId: row.tenantId,
    keyPattern: row.keyPattern,
    isDynamic: row.isDynamic,
    label: row.label,
    description: row.description,
    exampleMeta:
      (row.exampleMeta as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Factory ──────────────────────────────────────────────────────

export function createBadgeService(d: BadgeDeps) {
  const { db } = d;
  const cache = createBadgeCache(d.redis ?? null);

  // ─── Node CRUD ────────────────────────────────────────────────

  async function loadLiveNodes(tenantId: string): Promise<BadgeNode[]> {
    return db
      .select()
      .from(badgeNodes)
      .where(
        and(
          eq(badgeNodes.tenantId, tenantId),
          isNull(badgeNodes.deletedAt),
        ),
      )
      .orderBy(asc(badgeNodes.sortOrder), asc(badgeNodes.key));
  }

  async function ensureNodeByKey(
    tenantId: string,
    key: string,
  ): Promise<BadgeNode> {
    const [row] = await db
      .select()
      .from(badgeNodes)
      .where(
        and(
          eq(badgeNodes.tenantId, tenantId),
          eq(badgeNodes.key, key),
          isNull(badgeNodes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new BadgeNodeNotFound(key);
    return row;
  }

  async function ensureNodeById(
    tenantId: string,
    id: string,
  ): Promise<BadgeNode> {
    const [row] = await db
      .select()
      .from(badgeNodes)
      .where(
        and(
          eq(badgeNodes.id, id),
          eq(badgeNodes.tenantId, tenantId),
          isNull(badgeNodes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new BadgeNodeNotFound(id);
    return row;
  }

  async function assertNoCycleOnWrite(
    tenantId: string,
    pending: { key: string; parentKey: string | null },
  ) {
    const existing = await loadLiveNodes(tenantId);
    const projection = existing.map((n) => ({
      key: n.key,
      parentKey: n.parentKey,
    }));
    const idx = projection.findIndex((n) => n.key === pending.key);
    if (idx >= 0) projection[idx] = pending;
    else projection.push(pending);
    const cycle = findCycle(projection);
    if (cycle) throw new BadgeNodeCycle(cycle);
  }

  async function createNode(
    tenantId: string,
    input: CreateNodeInput,
  ): Promise<BadgeNode> {
    validateSignalBinding({
      signalMatchMode: input.signalMatchMode,
      signalKey: input.signalKey ?? null,
      signalKeyPrefix: input.signalKeyPrefix ?? null,
    });
    validateDismissConfig(
      input.dismissMode as BadgeDismissMode,
      input.dismissConfig ?? null,
    );
    await assertNoCycleOnWrite(tenantId, {
      key: input.key,
      parentKey: input.parentKey ?? null,
    });

    const sortOrder = await appendKey(db, {
      table: badgeNodes,
      sortColumn: badgeNodes.sortOrder,
      scopeWhere: and(
        eq(badgeNodes.tenantId, tenantId),
        isNull(badgeNodes.deletedAt),
      )!,
    });

    try {
      const [row] = await db
        .insert(badgeNodes)
        .values({
          tenantId,
          key: input.key,
          parentKey: input.parentKey ?? null,
          displayType: input.displayType,
          displayLabelKey: input.displayLabelKey ?? null,
          signalMatchMode: input.signalMatchMode,
          signalKey: input.signalKey ?? null,
          signalKeyPrefix: input.signalKeyPrefix ?? null,
          aggregation: input.aggregation,
          dismissMode: input.dismissMode,
          dismissConfig: input.dismissConfig ?? null,
          visibilityRule: input.visibilityRule ?? null,
          sortOrder,
          isActive: input.isActive,
        })
        .returning();
      if (!row) throw new Error("badge node insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadgeNodeKeyConflict(input.key);
      }
      throw err;
    }
  }

  async function updateNode(
    tenantId: string,
    id: string,
    input: UpdateNodeInput,
  ): Promise<BadgeNode> {
    const existing = await ensureNodeById(tenantId, id);

    const next = {
      signalMatchMode: input.signalMatchMode ?? existing.signalMatchMode,
      signalKey:
        input.signalKey === undefined ? existing.signalKey : input.signalKey,
      signalKeyPrefix:
        input.signalKeyPrefix === undefined
          ? existing.signalKeyPrefix
          : input.signalKeyPrefix,
    };
    validateSignalBinding(next);
    const nextDismissMode = (input.dismissMode ??
      existing.dismissMode) as BadgeDismissMode;
    const nextDismissConfig =
      input.dismissConfig === undefined
        ? ((existing.dismissConfig as Record<string, unknown> | null) ?? null)
        : (input.dismissConfig ?? null);
    validateDismissConfig(nextDismissMode, nextDismissConfig);

    if (input.parentKey !== undefined) {
      await assertNoCycleOnWrite(tenantId, {
        key: existing.key,
        parentKey: input.parentKey ?? null,
      });
    }

    const [row] = await db
      .update(badgeNodes)
      .set({
        parentKey:
          input.parentKey === undefined ? existing.parentKey : input.parentKey,
        displayType: input.displayType ?? existing.displayType,
        displayLabelKey:
          input.displayLabelKey === undefined
            ? existing.displayLabelKey
            : input.displayLabelKey,
        signalMatchMode: next.signalMatchMode,
        signalKey: next.signalKey,
        signalKeyPrefix: next.signalKeyPrefix,
        aggregation: input.aggregation ?? existing.aggregation,
        dismissMode: nextDismissMode,
        dismissConfig: nextDismissConfig,
        visibilityRule:
          input.visibilityRule === undefined
            ? existing.visibilityRule
            : input.visibilityRule,
        isActive:
          input.isActive === undefined ? existing.isActive : input.isActive,
      })
      .where(
        and(
          eq(badgeNodes.id, id),
          eq(badgeNodes.tenantId, tenantId),
          isNull(badgeNodes.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new BadgeNodeNotFound(id);
    return row;
  }

  async function moveNode(
    tenantId: string,
    id: string,
    body: MoveBody,
  ): Promise<BadgeNode> {
    await ensureNodeById(tenantId, id);
    return moveAndReturn<BadgeNode>(db, {
      table: badgeNodes,
      sortColumn: badgeNodes.sortOrder,
      idColumn: badgeNodes.id,
      partitionWhere: and(
        eq(badgeNodes.tenantId, tenantId),
        isNull(badgeNodes.deletedAt),
      )!,
      id,
      body,
      notFound: (sid) => new BadgeNodeNotFound(sid),
    });
  }

  /**
   * Soft-delete the target node AND all descendants by key. The
   * partial unique index on `(orgId, key) WHERE deletedAt IS NULL`
   * lets the customer later re-create a node at the same key.
   */
  async function deleteNode(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const target = await ensureNodeById(tenantId, id);
    const allNodes = await loadLiveNodes(tenantId);

    // Collect descendant keys
    const toDelete = new Set<string>([target.key]);
    let added = true;
    while (added) {
      added = false;
      for (const n of allNodes) {
        if (
          n.parentKey &&
          toDelete.has(n.parentKey) &&
          !toDelete.has(n.key)
        ) {
          toDelete.add(n.key);
          added = true;
        }
      }
    }

    await db
      .update(badgeNodes)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(badgeNodes.tenantId, tenantId),
          inArray(badgeNodes.key, Array.from(toDelete)),
          isNull(badgeNodes.deletedAt),
        ),
      );
  }

  // ─── Signal write ─────────────────────────────────────────────

  async function writeSignal(
    tenantId: string,
    input: SignalInput,
    now: Date,
  ): Promise<BadgeSignal> {
    if (input.mode !== "clear") {
      if (
        typeof input.count !== "number" ||
        !Number.isFinite(input.count)
      ) {
        throw new BadgeSignalInvalidInput(
          "count is required and must be a finite number when mode!='clear'",
        );
      }
    }
    const count = input.mode === "clear" ? 0 : Math.trunc(input.count!);

    // One atomic UPSERT per input. `firstAppearedAt` is set when the
    // row transitions 0 → >0, which we encode in the DO UPDATE SET
    // expression with CASE/COALESCE.
    const meta = input.meta ?? null;
    const version = input.version ?? null;
    const tooltipKey = input.tooltipKey ?? null;
    const expiresAt = input.expiresAt ?? null;

    // For 'add' we need to do `count = badge_signals.count + EXCLUDED.count`.
    // For 'set' or 'clear' we overwrite to EXCLUDED.count.
    const countExpr =
      input.mode === "add"
        ? sql`${badgeSignals.count} + EXCLUDED.${sql.identifier("count")}`
        : sql`EXCLUDED.${sql.identifier("count")}`;

    // firstAppearedAt: keep existing if already set; otherwise set to
    // now when the resulting count transitions to > 0.
    const firstAppearedExpr = sql`
      CASE
        WHEN ${badgeSignals.firstAppearedAt} IS NOT NULL
          AND (${countExpr}) > 0 THEN ${badgeSignals.firstAppearedAt}
        WHEN (${countExpr}) > 0 THEN ${now}
        ELSE ${badgeSignals.firstAppearedAt}
      END
    `;

    const [row] = await db
      .insert(badgeSignals)
      .values({
        tenantId,
        endUserId: input.endUserId,
        signalKey: input.signalKey,
        count,
        version,
        firstAppearedAt: count > 0 ? now : null,
        expiresAt,
        meta: meta as Record<string, unknown> | null,
        tooltipKey,
      })
      .onConflictDoUpdate({
        target: [
          badgeSignals.tenantId,
          badgeSignals.endUserId,
          badgeSignals.signalKey,
        ],
        set: {
          count: countExpr,
          version:
            input.version !== undefined
              ? version
              : sql`${badgeSignals.version}`,
          firstAppearedAt: firstAppearedExpr,
          expiresAt:
            input.expiresAt !== undefined
              ? expiresAt
              : sql`${badgeSignals.expiresAt}`,
          meta:
            input.meta !== undefined
              ? (meta as Record<string, unknown> | null)
              : sql`${badgeSignals.meta}`,
          tooltipKey:
            input.tooltipKey !== undefined
              ? tooltipKey
              : sql`${badgeSignals.tooltipKey}`,
          updatedAt: now,
        },
      })
      .returning();
    if (!row) throw new Error("badge signal UPSERT returned no row");
    return row;
  }

  /**
   * Single signal push. Returns the row as seen after the UPSERT.
   * Bumps the per-user cacheVersion so the next /tree read is fresh.
   */
  async function signal(
    tenantId: string,
    input: SignalInput,
  ): Promise<BadgeSignal> {
    const now = new Date();
    const row = await writeSignal(tenantId, input, now);
    // Best-effort cache bump. Errors don't affect the write.
    void cache.bumpVersion(tenantId, input.endUserId);
    return row;
  }

  async function signalBatch(
    tenantId: string,
    inputs: SignalInput[],
  ): Promise<BadgeSignal[]> {
    if (inputs.length === 0) return [];
    const now = new Date();
    const results: BadgeSignal[] = [];
    // Serialized atomic UPSERTs — partial success is acceptable; callers
    // that need atomic batches can retry the failed ones.
    for (const input of inputs) {
      results.push(await writeSignal(tenantId, input, now));
    }
    // Bump once per (org, user) pair to minimize Redis writes.
    const bumped = new Set<string>();
    for (const input of inputs) {
      const key = `${tenantId}:${input.endUserId}`;
      if (bumped.has(key)) continue;
      bumped.add(key);
      void cache.bumpVersion(tenantId, input.endUserId);
    }
    return results;
  }

  // ─── Tree read ────────────────────────────────────────────────

  async function loadSignalsForUser(
    tenantId: string,
    endUserId: string,
    exactKeys: string[],
    prefixes: string[],
  ): Promise<BadgeSignal[]> {
    const filters = [
      eq(badgeSignals.tenantId, tenantId),
      eq(badgeSignals.endUserId, endUserId),
    ];
    // We narrow by signalKey to avoid pulling unrelated signals.
    const keyConditions = [];
    if (exactKeys.length > 0) {
      keyConditions.push(inArray(badgeSignals.signalKey, exactKeys));
    }
    for (const prefix of prefixes) {
      keyConditions.push(like(badgeSignals.signalKey, `${prefix}%`));
    }
    if (keyConditions.length === 0) return [];
    const finalWhere = and(...filters, or(...keyConditions));
    return db.select().from(badgeSignals).where(finalWhere);
  }

  async function loadDismissalsForUser(
    tenantId: string,
    endUserId: string,
    nodeKeys: string[],
  ): Promise<BadgeDismissal[]> {
    if (nodeKeys.length === 0) return [];
    return db
      .select()
      .from(badgeDismissals)
      .where(
        and(
          eq(badgeDismissals.tenantId, tenantId),
          eq(badgeDismissals.endUserId, endUserId),
          inArray(badgeDismissals.nodeKey, nodeKeys),
        ),
      );
  }

  async function loadTreeFromDb(
    tenantId: string,
    endUserId: string,
    rootKey: string | null,
    opts: {
      explain?: boolean;
      currentSessionId?: string | null;
      playerContext?: Record<string, unknown> | null;
    },
  ) {
    const nodes = await loadLiveNodes(tenantId);

    // Collect signalKeys / prefixes to query.
    const exactKeys: string[] = [];
    const prefixes: string[] = [];
    for (const n of nodes) {
      if (n.signalMatchMode === "exact" && n.signalKey)
        exactKeys.push(n.signalKey);
      else if (n.signalMatchMode === "prefix" && n.signalKeyPrefix)
        prefixes.push(n.signalKeyPrefix);
    }
    const nodeKeys = nodes.map((n) => n.key);

    const [signalsRows, dismissalRows] = await Promise.all([
      loadSignalsForUser(tenantId, endUserId, exactKeys, prefixes),
      loadDismissalsForUser(tenantId, endUserId, nodeKeys),
    ]);

    const assembled = assembleTree({
      nodes,
      signals: signalsRows,
      dismissals: dismissalRows,
      now: new Date(),
      explain: opts.explain ?? false,
      currentSessionId: opts.currentSessionId,
      playerContext: opts.playerContext,
      rootKey,
    });

    return { nodes, signals: signalsRows, dismissals: dismissalRows, assembled };
  }

  async function getTree(
    tenantId: string,
    endUserId: string,
    rootKey: string | null,
    opts: {
      currentSessionId?: string | null;
      playerContext?: Record<string, unknown> | null;
    } = {},
  ): Promise<{
    rootKey: string | null;
    serverTimestamp: string;
    nodes: BadgeTreeNode[];
  }> {
    // Try cache first. Only safe when no player-context gate is set,
    // because visibility depends on the caller's context (which the
    // cache key doesn't embed).
    const canCache = !opts.playerContext;
    if (canCache) {
      const cached = await cache.readTree(tenantId, endUserId, rootKey);
      if (cached) {
        return {
          rootKey,
          serverTimestamp: cached.serverTimestamp,
          nodes: cached.nodes,
        };
      }
    }

    const { assembled } = await loadTreeFromDb(
      tenantId,
      endUserId,
      rootKey,
      { explain: false, ...opts },
    );
    const payload = {
      rootKey,
      serverTimestamp: new Date().toISOString(),
      nodes: assembled,
    };

    if (canCache) {
      void cache.writeTree(tenantId, endUserId, rootKey, {
        serverTimestamp: payload.serverTimestamp,
        nodes: payload.nodes,
      });
    }

    return payload;
  }

  async function preview(
    tenantId: string,
    endUserId: string,
    rootKey: string | null,
    explain: boolean,
  ) {
    const { signals, dismissals, assembled } = await loadTreeFromDb(
      tenantId,
      endUserId,
      rootKey,
      { explain },
    );
    return {
      rootKey,
      serverTimestamp: new Date().toISOString(),
      nodes: assembled,
      rawSignals: signals.map((s) => ({
        signalKey: s.signalKey,
        count: s.count,
        version: s.version,
        firstAppearedAt: s.firstAppearedAt?.toISOString() ?? null,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        meta: (s.meta as Record<string, unknown> | null) ?? null,
        updatedAt: s.updatedAt.toISOString(),
      })),
      rawDismissals: dismissals.map((d) => ({
        nodeKey: d.nodeKey,
        dismissedAt: d.dismissedAt.toISOString(),
        dismissedVersion: d.dismissedVersion,
        periodKey: d.periodKey,
        sessionId: d.sessionId,
      })),
    };
  }

  // ─── Dismiss ──────────────────────────────────────────────────

  async function dismiss(
    tenantId: string,
    endUserId: string,
    input: {
      nodeKey: string;
      version?: string | null;
      sessionId?: string | null;
    },
    now: Date,
  ): Promise<{
    nodeKey: string;
    dismissedAt: string;
    dismissedVersion: string | null;
  }> {
    const node = await ensureNodeByKey(tenantId, input.nodeKey);
    const mode = node.dismissMode as BadgeDismissMode;
    if (mode === "auto") {
      throw new BadgeDismissNotAllowed(input.nodeKey);
    }

    // Compute periodKey for daily mode.
    const config = (node.dismissConfig as Record<string, unknown> | null) ?? null;
    let periodKey: string | null = null;
    if (mode === "daily") {
      const periodType =
        (config?.periodType as string | undefined) ?? "daily";
      const timezone = (config?.timezone as string | undefined) ?? "UTC";
      const { computePeriodKey } = await import("./tree");
      periodKey = computePeriodKey(periodType, now, timezone);
    }

    const dismissedVersion =
      mode === "version" ? (input.version ?? null) : null;
    const sessionId = mode === "session" ? (input.sessionId ?? null) : null;

    await db
      .insert(badgeDismissals)
      .values({
        tenantId,
        endUserId,
        nodeKey: input.nodeKey,
        dismissedAt: now,
        dismissedVersion,
        periodKey,
        sessionId,
      })
      .onConflictDoUpdate({
        target: [
          badgeDismissals.tenantId,
          badgeDismissals.endUserId,
          badgeDismissals.nodeKey,
        ],
        set: {
          dismissedAt: now,
          dismissedVersion,
          periodKey,
          sessionId,
        },
      });

    void cache.bumpVersion(tenantId, endUserId);

    return {
      nodeKey: input.nodeKey,
      dismissedAt: now.toISOString(),
      dismissedVersion,
    };
  }

  /**
   * Wipe all session-mode dismissals for this user. Called when the
   * player establishes a new session (login). Other dismissal modes
   * are untouched.
   */
  async function resetSession(
    tenantId: string,
    endUserId: string,
  ): Promise<void> {
    // Narrow to nodeKeys whose node has dismissMode='session'. Cheaper
    // than scanning every row and lets us keep the index usage tight.
    const sessionNodes = await db
      .select({ key: badgeNodes.key })
      .from(badgeNodes)
      .where(
        and(
          eq(badgeNodes.tenantId, tenantId),
          eq(badgeNodes.dismissMode, "session"),
          isNull(badgeNodes.deletedAt),
        ),
      );
    const keys = sessionNodes.map((n) => n.key);
    if (keys.length === 0) return;
    await db
      .delete(badgeDismissals)
      .where(
        and(
          eq(badgeDismissals.tenantId, tenantId),
          eq(badgeDismissals.endUserId, endUserId),
          inArray(badgeDismissals.nodeKey, keys),
        ),
      );
    void cache.bumpVersion(tenantId, endUserId);
  }

  // ─── Templates ────────────────────────────────────────────────

  function listTemplates() {
    return BADGE_TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      displayType: t.defaults.displayType,
      aggregation: t.defaults.aggregation,
      dismissMode: t.defaults.dismissMode,
      signalMatchMode: t.defaults.signalMatchMode,
      requires: t.requires,
    }));
  }

  async function createFromTemplate(
    tenantId: string,
    input: FromTemplateInput,
  ): Promise<BadgeNode> {
    const tpl = findBadgeTemplate(input.templateId);
    if (!tpl) throw new BadgeTemplateNotFound(input.templateId);

    // Validate that the required field was supplied.
    for (const req of tpl.requires) {
      if (req === "signalKey" && !input.signalKey) {
        throw new BadgeInvalidSignalBinding(
          `template '${tpl.id}' requires signalKey`,
        );
      }
      if (req === "signalKeyPrefix" && !input.signalKeyPrefix) {
        throw new BadgeInvalidSignalBinding(
          `template '${tpl.id}' requires signalKeyPrefix`,
        );
      }
    }

    return createNode(tenantId, {
      key: input.key,
      parentKey: input.parentKey ?? null,
      displayType: tpl.defaults.displayType,
      displayLabelKey: input.displayLabelKey ?? null,
      signalMatchMode: tpl.defaults.signalMatchMode,
      signalKey: input.signalKey ?? null,
      signalKeyPrefix: input.signalKeyPrefix ?? null,
      aggregation: tpl.defaults.aggregation,
      dismissMode: tpl.defaults.dismissMode,
      dismissConfig:
        (tpl.defaults as unknown as { dismissConfig?: Record<string, unknown> })
          .dismissConfig ?? null,
      visibilityRule: null,
      isActive: tpl.defaults.isActive,
    });
  }

  // ─── Validate tree ────────────────────────────────────────────

  async function validateTree(tenantId: string) {
    const nodes = await loadLiveNodes(tenantId);
    const errors: {
      kind: "cycle" | "dangling_parent" | "invalid_binding";
      nodeKey: string;
      message: string;
    }[] = [];

    const byKey = new Set(nodes.map((n) => n.key));
    for (const n of nodes) {
      if (n.parentKey && !byKey.has(n.parentKey)) {
        errors.push({
          kind: "dangling_parent",
          nodeKey: n.key,
          message: `parentKey '${n.parentKey}' does not exist in the tree`,
        });
      }
      try {
        validateSignalBinding({
          signalMatchMode: n.signalMatchMode,
          signalKey: n.signalKey,
          signalKeyPrefix: n.signalKeyPrefix,
        });
      } catch (err) {
        if (err instanceof BadgeInvalidSignalBinding) {
          errors.push({
            kind: "invalid_binding",
            nodeKey: n.key,
            message: err.message,
          });
        } else {
          throw err;
        }
      }
    }
    const cycle = findCycle(
      nodes.map((n) => ({ key: n.key, parentKey: n.parentKey ?? null })),
    );
    if (cycle) {
      errors.push({
        kind: "cycle",
        nodeKey: cycle[0] ?? "",
        message: `cycle detected: ${cycle.join(" -> ")}`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Signal registry ──────────────────────────────────────────

  async function upsertSignalRegistry(
    tenantId: string,
    input: {
      keyPattern: string;
      isDynamic?: boolean;
      label: string;
      description?: string | null;
      exampleMeta?: Record<string, unknown> | null;
    },
  ): Promise<BadgeSignalRegistryEntry> {
    const [row] = await db
      .insert(badgeSignalRegistry)
      .values({
        tenantId,
        keyPattern: input.keyPattern,
        isDynamic: input.isDynamic ?? false,
        label: input.label,
        description: input.description ?? null,
        exampleMeta:
          (input.exampleMeta as Record<string, unknown> | null) ?? null,
      })
      .onConflictDoUpdate({
        target: [
          badgeSignalRegistry.tenantId,
          badgeSignalRegistry.keyPattern,
        ],
        set: {
          isDynamic: input.isDynamic ?? false,
          label: input.label,
          description: input.description ?? null,
          exampleMeta:
            (input.exampleMeta as Record<string, unknown> | null) ?? null,
        },
      })
      .returning();
    if (!row) throw new Error("signal registry UPSERT returned no row");
    return row;
  }

  async function listSignalRegistry(
    tenantId: string,
  ): Promise<BadgeSignalRegistryEntry[]> {
    return db
      .select()
      .from(badgeSignalRegistry)
      .where(eq(badgeSignalRegistry.tenantId, tenantId))
      .orderBy(asc(badgeSignalRegistry.keyPattern));
  }

  async function deleteSignalRegistry(
    tenantId: string,
    keyPattern: string,
  ): Promise<void> {
    await db
      .delete(badgeSignalRegistry)
      .where(
        and(
          eq(badgeSignalRegistry.tenantId, tenantId),
          eq(badgeSignalRegistry.keyPattern, keyPattern),
        ),
      );
  }

  // ─── Public API ───────────────────────────────────────────────
  return {
    // node CRUD
    createNode,
    updateNode,
    moveNode,
    deleteNode,
    listNodes: loadLiveNodes,
    getNode: ensureNodeByKey,
    // signal write
    signal,
    signalBatch,
    // tree read
    getTree,
    preview,
    dismiss,
    resetSession,
    // templates
    listTemplates,
    createFromTemplate,
    // validation / registry
    validateTree,
    upsertSignalRegistry,
    listSignalRegistry,
    deleteSignalRegistry,
    // serializers (used by routes.ts)
    _serializeNode: serializeNode,
    _serializeSignalWrite: serializeSignalWrite,
    _serializeRegistry: serializeRegistry,
  };
}

export type BadgeService = ReturnType<typeof createBadgeService>;

// ─── Helpers ──────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  return (
    code === "23505" ||
    (typeof message === "string" && message.toLowerCase().includes("unique"))
  );
}

export type { SignalInput } from "./types";
