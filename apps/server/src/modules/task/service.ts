/**
 * Task service — protocol-agnostic business logic for the task / quest /
 * achievement module.
 *
 * This file MUST NOT import Hono or any HTTP concepts. Its only view of
 * the outside world is a typed `AppDeps` object.
 *
 * Phase 1: Admin CRUD for categories + definitions.
 * Phase 2: Event processing, progress tracking, reward claiming.
 */

import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { type MoveBody, appendKey, moveAndReturn } from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { getTraceId } from "../../lib/request-context";
import {
  taskCategories,
  taskDefinitions,
  taskUserAssignments,
  taskUserMilestoneClaims,
  taskUserProgress,
  type TaskRewardTier,
} from "../../schema/task";
import type { RewardEntry } from "../../lib/rewards";
import { grantRewards, type RewardServices } from "../../lib/rewards";
import { assertActivityClaimable, getActivityPhases, isWritablePhase } from "../activity/gate";
import type { MailService } from "../mail/service";
import { compileTaskFilter, type TaskFilterFn } from "./filter";
import {
  TaskAliasConflict,
  TaskAlreadyClaimed,
  TaskAssignmentBatchTooLarge,
  TaskAssignmentNotFound,
  TaskAutoClaimOnly,
  TaskCategoryNotFound,
  TaskDefinitionNotFound,
  TaskInvalidEventBinding,
  TaskInvalidInput,
  TaskNestingTooDeep,
  TaskNotAssignable,
  TaskNotCompleted,
  TaskPrerequisitesNotMet,
  TaskTierNotFound,
  TaskTierNotReached,
} from "./errors";
import type {
  TaskAssignmentSource,
  TaskCategory,
  TaskDefinition,
  TaskUserAssignment,
  TaskUserProgress,
} from "./types";
import {
  ASSIGNMENT_BATCH_MAX,
  taskCategoryFilters,
  taskDefinitionFilters,
} from "./validators";
import type {
  CreateCategoryInput,
  CreateDefinitionInput,
  UpdateCategoryInput,
  UpdateDefinitionInput,
} from "./validators";
import { computePeriodKey, isPeriodStale } from "./time";
import { logger } from "../../lib/logger";

// `events` / `eventCatalog` are optional so existing tests that pass only
// { db } keep compiling. In production wiring (barrel index.ts) we always
// supply them from `deps`.
type TaskDeps = Pick<AppDeps, "db"> &
  Partial<Pick<AppDeps, "events" | "eventCatalog" | "analytics">>;

// Extend the in-runtime event-bus type map with task-domain events.
// Subscribers (leaderboard, analytics, ...) register handlers on
// their own barrel.
declare module "../../lib/event-bus" {
  interface EventMap {
    "task.claimed": {
      tenantId: string;
      endUserId: string;
      taskId: string;
      taskAlias: string | null;
      categoryId: string | null;
      progressValue: number;
      rewards: RewardEntry[];
      periodKey: string;
      claimedAt: Date;
    };
    "task.completed": {
      tenantId: string;
      endUserId: string;
      taskId: string;
      taskAlias: string | null;
      progressValue: number;
      completedAt: Date;
    };
    "task.tier.claimed": {
      tenantId: string;
      endUserId: string;
      taskId: string;
      taskAlias: string | null;
      tierAlias: string;
      threshold: number;
      progressValue: number;
      rewards: RewardEntry[];
      periodKey: string;
      claimedAt: Date;
    };
  }
}

/** Extract a numeric value from eventData using a dot-path. */
function extractValue(
  data: Record<string, unknown>,
  path: string,
): number {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return 0;
    cur = (cur as Record<string, unknown>)[p];
  }
  const num = Number(cur);
  return Number.isFinite(num) ? num : 0;
}

const SOURCE_PREFIX = "task.";
const CLAIM_SOURCE = `${SOURCE_PREFIX}claim`;
const AUTOCLAIM_SOURCE = `${SOURCE_PREFIX}complete`;
const TIER_CLAIM_SOURCE = `${SOURCE_PREFIX}tier.claim`;
const TIER_AUTOCLAIM_SOURCE = `${SOURCE_PREFIX}tier`;

export function createTaskService(
  d: TaskDeps,
  rewardServices: RewardServices,
  mailSvcGetter: () => MailService | undefined,
) {
  const { db, events, eventCatalog, analytics } = d;

  // ─── Filter expression cache ──────────────────────────────────
  //
  // Compile filtrex expressions once per (taskId + expression) and reuse the
  // resulting function across events. Bound to this factory closure, so each
  // Workers isolate gets its own cache. The key embeds the expression itself
  // so that updating a definition's filter transparently invalidates the old
  // compiled function without needing a manual purge step.
  const filterCache = new Map<string, TaskFilterFn>();

  function getCompiledFilter(
    taskId: string,
    expression: string,
  ): TaskFilterFn | null {
    const key = `${taskId}:${expression}`;
    const cached = filterCache.get(key);
    if (cached) return cached;
    try {
      const fn = compileTaskFilter(expression);
      filterCache.set(key, fn);
      return fn;
    } catch (err) {
      // Malformed filter reached runtime (e.g. definition written via raw SQL
      // bypassing the validator). Log and fail-closed — the task is skipped
      // but other tasks in the dispatch loop keep processing.
      logger.error("task: filter compile failed", {
        taskId,
        expression,
        err,
      });
      return null;
    }
  }

  function matchesFilter(
    def: TaskDefinition,
    eventData: Record<string, unknown>,
  ): boolean {
    if (!def.filter) return true;
    const fn = getCompiledFilter(def.id, def.filter);
    if (!fn) return false;
    let result: unknown;
    try {
      result = fn(eventData);
    } catch (err) {
      logger.error("task: filter evaluation failed", {
        taskId: def.id,
        err,
      });
      return false;
    }
    // filtrex wraps its compiled function in `try { ... } catch (e) { return e }`
    // — runtime errors (e.g. UnknownPropertyError when a referenced field is
    // missing from eventData) come back as Error instances rather than
    // thrown exceptions. An Error return counts as "filter did not match",
    // keeping the fail-closed contract even for missing-field cases.
    if (result instanceof Error) {
      return false;
    }
    return Boolean(result);
  }

  // ─── Load helpers ─────────────────────────────────────────────

  async function loadCategoryById(
    tenantId: string,
    id: string,
  ): Promise<TaskCategory> {
    const rows = await db
      .select()
      .from(taskCategories)
      .where(
        and(
          eq(taskCategories.tenantId, tenantId),
          eq(taskCategories.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new TaskCategoryNotFound(id);
    return row;
  }

  async function loadDefinitionByKey(
    tenantId: string,
    key: string,
  ): Promise<TaskDefinition> {
    const where = looksLikeId(key)
      ? and(
          eq(taskDefinitions.tenantId, tenantId),
          eq(taskDefinitions.id, key),
        )
      : and(
          eq(taskDefinitions.tenantId, tenantId),
          eq(taskDefinitions.alias, key),
        );
    const rows = await db
      .select()
      .from(taskDefinitions)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new TaskDefinitionNotFound(key);
    return row;
  }

  // ─── Category CRUD ────────────────────────────────────────────

  async function listCategories(
    tenantId: string,
    params: PageParams = {},
  ): Promise<Page<TaskCategory>> {
    const limit = clampLimit(params.limit);
    const where = and(
      eq(taskCategories.tenantId, tenantId),
      taskCategoryFilters.where(params as Record<string, unknown>),
      cursorWhere(params.cursor, taskCategories.createdAt, taskCategories.id),
    );
    const rows = await db
      .select()
      .from(taskCategories)
      .where(where)
      .orderBy(asc(taskCategories.sortOrder), asc(taskCategories.createdAt))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getCategory(
    tenantId: string,
    id: string,
  ): Promise<TaskCategory> {
    return loadCategoryById(tenantId, id);
  }

  async function createCategory(
    tenantId: string,
    input: CreateCategoryInput,
  ): Promise<TaskCategory> {
    try {
      const __sortKey = await appendKey(db, { table: taskCategories, sortColumn: taskCategories.sortOrder, scopeWhere: eq(taskCategories.tenantId, tenantId)! });
      const [row] = await db
        .insert(taskCategories)
        .values({
          tenantId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          icon: input.icon ?? null,
          scope: input.scope ?? "task",
          sortOrder: __sortKey,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new TaskAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function updateCategory(
    tenantId: string,
    id: string,
    patch: UpdateCategoryInput,
  ): Promise<TaskCategory> {
    const existing = await loadCategoryById(tenantId, id);
    const values: Partial<typeof taskCategories.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.scope !== undefined) values.scope = patch.scope;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) return existing;

    try {
      const [row] = await db
        .update(taskCategories)
        .set(values)
        .where(
          and(
            eq(taskCategories.id, existing.id),
            eq(taskCategories.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new TaskCategoryNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new TaskAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function moveCategory(
    tenantId: string,
    id: string,
    body: MoveBody,
  ): Promise<TaskCategory> {
    const existing = await loadCategoryById(tenantId, id);
    return moveAndReturn<TaskCategory>(db, {
      table: taskCategories,
      sortColumn: taskCategories.sortOrder,
      idColumn: taskCategories.id,
      partitionWhere: eq(taskCategories.tenantId, tenantId)!,
      id: existing.id,
      body,
      notFound: (sid) => new TaskCategoryNotFound(sid),
    });
  }

  async function deleteCategory(
    tenantId: string,
    id: string,
  ): Promise<void> {
    await loadCategoryById(tenantId, id);
    await db
      .delete(taskCategories)
      .where(
        and(
          eq(taskCategories.id, id),
          eq(taskCategories.tenantId, tenantId),
        ),
      );
  }

  // ─── Definition CRUD ──────────────────────────────────────────

  async function listDefinitions(
    tenantId: string,
    filters: PageParams & {
      categoryId?: string;
      period?: string;
      parentId?: string | null;
      /**
       * Activity scoping. Defaults to "standalone only" so the main
       * task admin page isn't polluted by per-activity copies.
       *   - activityId set        → only that activity's tasks
       *   - includeActivity true  → standalone + all activity tasks
       *   - neither set           → activityId IS NULL (standalone only)
       */
      activityId?: string;
      includeActivity?: boolean;
    } = {},
  ): Promise<Page<TaskDefinition>> {
    const limit = clampLimit(filters.limit);
    // Normalise legacy callers (parentId: null, includeActivity true,
    // activityId undefined "standalone only") to the DSL's flat string
    // sentinels so the same WHERE branches fire from either entry point.
    const filterInput: Record<string, unknown> = { ...filters };
    if (filters.parentId === null) filterInput.parentId = "null";
    if (!filters.activityId && !filters.includeActivity) {
      filterInput.activityId = "null";
    }
    delete filterInput.includeActivity;
    const where = and(
      eq(taskDefinitions.tenantId, tenantId),
      taskDefinitionFilters.where(filterInput),
      cursorWhere(
        filters.cursor,
        taskDefinitions.createdAt,
        taskDefinitions.id,
      ),
    );
    const rows = await db
      .select()
      .from(taskDefinitions)
      .where(where)
      .orderBy(asc(taskDefinitions.sortOrder), asc(taskDefinitions.createdAt))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getDefinition(
    tenantId: string,
    key: string,
  ): Promise<TaskDefinition> {
    return loadDefinitionByKey(tenantId, key);
  }

  async function createDefinition(
    tenantId: string,
    input: CreateDefinitionInput,
  ): Promise<TaskDefinition> {
    // Validate parent nesting depth: only one level allowed
    if (input.parentId) {
      const parent = await loadDefinitionByKey(tenantId, input.parentId);
      if (parent.parentId) {
        throw new TaskNestingTooDeep();
      }
    }

    // Validate eventName is a bindable (task-trigger) event if provided.
    // When `eventCatalog` dep is absent (unit tests that stub only { db }),
    // fall open — the existing test suite doesn't simulate the catalog.
    if (input.eventName && eventCatalog) {
      const ok = await eventCatalog.hasCapability(
        tenantId,
        input.eventName,
        "task-trigger",
      );
      if (!ok) throw new TaskInvalidEventBinding(input.eventName);
    }

    try {
      const __sortKey = await appendKey(db, { table: taskDefinitions, sortColumn: taskDefinitions.sortOrder, scopeWhere: eq(taskDefinitions.tenantId, tenantId)! });
      const [row] = await db
        .insert(taskDefinitions)
        .values({
          tenantId,
          categoryId: input.categoryId ?? null,
          parentId: input.parentId ?? null,
          alias: input.alias ?? null,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          period: input.period,
          timezone: input.timezone ?? "UTC",
          weekStartsOn: input.weekStartsOn ?? 1,
          countingMethod: input.countingMethod,
          eventName: input.eventName ?? null,
          eventValueField: input.eventValueField ?? null,
          filter: input.filter ?? null,
          targetValue: input.targetValue,
          parentProgressValue: input.parentProgressValue ?? 1,
          prerequisiteTaskIds: input.prerequisiteTaskIds ?? [],
          rewards: input.rewards,
          rewardTiers: input.rewardTiers ?? [],
          autoClaim: input.autoClaim ?? false,
          navigation: input.navigation ?? null,
          isActive: input.isActive ?? true,
          isHidden: input.isHidden ?? false,
          visibility: input.visibility ?? "broadcast",
          defaultAssignmentTtlSeconds: input.defaultAssignmentTtlSeconds ?? null,
          sortOrder: __sortKey,
          activityId: input.activityId ?? null,
          activityNodeId: input.activityNodeId ?? null,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new TaskAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function updateDefinition(
    tenantId: string,
    key: string,
    patch: UpdateDefinitionInput,
  ): Promise<TaskDefinition> {
    const existing = await loadDefinitionByKey(tenantId, key);

    // Validate parent nesting if changing parentId
    if (patch.parentId !== undefined && patch.parentId !== null) {
      const parent = await loadDefinitionByKey(tenantId, patch.parentId);
      if (parent.parentId) {
        throw new TaskNestingTooDeep();
      }
      // Prevent setting parentId to self
      if (parent.id === existing.id) {
        throw new TaskInvalidInput("a task cannot be its own parent");
      }
    }

    // Reject filter + child_completion. The update validator can't enforce
    // this alone because a caller may be patching only `filter` or only
    // `countingMethod`; the conflict is only visible once merged with the
    // existing row.
    const effectiveCountingMethod =
      patch.countingMethod ?? existing.countingMethod;
    const effectiveFilter =
      patch.filter !== undefined ? patch.filter : existing.filter;
    if (effectiveFilter && effectiveCountingMethod === "child_completion") {
      throw new TaskInvalidInput(
        "filter must not be set when countingMethod='child_completion'",
      );
    }

    // Cross-check tier thresholds against the merged targetValue. The
    // update validator only sees what was patched — if the caller
    // bumps targetValue down or edits only rewardTiers, the check
    // needs the post-merge view.
    const effectiveTargetValue = patch.targetValue ?? existing.targetValue;
    const effectiveRewardTiers = patch.rewardTiers ?? existing.rewardTiers;
    if (effectiveRewardTiers && effectiveRewardTiers.length > 0) {
      for (const t of effectiveRewardTiers) {
        if (t.threshold > effectiveTargetValue) {
          throw new TaskInvalidInput(
            `tier threshold (${t.threshold}) must be <= targetValue (${effectiveTargetValue})`,
          );
        }
      }
    }

    // Validate the new eventName (if the caller is changing it) is a
    // bindable (task-trigger) event. Skip if the patch is clearing it
    // (null) or leaving it unchanged (undefined).
    if (patch.eventName && eventCatalog) {
      const ok = await eventCatalog.hasCapability(
        tenantId,
        patch.eventName,
        "task-trigger",
      );
      if (!ok) throw new TaskInvalidEventBinding(patch.eventName);
    }

    const values: Partial<typeof taskDefinitions.$inferInsert> = {};
    if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
    if (patch.parentId !== undefined) values.parentId = patch.parentId;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.period !== undefined) values.period = patch.period;
    if (patch.timezone !== undefined) values.timezone = patch.timezone;
    if (patch.weekStartsOn !== undefined)
      values.weekStartsOn = patch.weekStartsOn;
    if (patch.countingMethod !== undefined)
      values.countingMethod = patch.countingMethod;
    if (patch.eventName !== undefined) values.eventName = patch.eventName;
    if (patch.eventValueField !== undefined)
      values.eventValueField = patch.eventValueField;
    if (patch.filter !== undefined) values.filter = patch.filter;
    if (patch.targetValue !== undefined) values.targetValue = patch.targetValue;
    if (patch.parentProgressValue !== undefined)
      values.parentProgressValue = patch.parentProgressValue;
    if (patch.prerequisiteTaskIds !== undefined)
      values.prerequisiteTaskIds = patch.prerequisiteTaskIds;
    if (patch.rewards !== undefined) values.rewards = patch.rewards;
    if (patch.rewardTiers !== undefined) values.rewardTiers = patch.rewardTiers;
    if (patch.autoClaim !== undefined) values.autoClaim = patch.autoClaim;
    if (patch.navigation !== undefined) values.navigation = patch.navigation;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.isHidden !== undefined) values.isHidden = patch.isHidden;
    if (patch.activityId !== undefined) values.activityId = patch.activityId;
    if (patch.activityNodeId !== undefined)
      values.activityNodeId = patch.activityNodeId;
    if (patch.visibility !== undefined) values.visibility = patch.visibility;
    if (patch.defaultAssignmentTtlSeconds !== undefined)
      values.defaultAssignmentTtlSeconds = patch.defaultAssignmentTtlSeconds;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) return existing;

    try {
      const [row] = await db
        .update(taskDefinitions)
        .set(values)
        .where(
          and(
            eq(taskDefinitions.id, existing.id),
            eq(taskDefinitions.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new TaskDefinitionNotFound(key);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new TaskAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function moveDefinition(
    tenantId: string,
    key: string,
    body: MoveBody,
  ): Promise<TaskDefinition> {
    const existing = await loadDefinitionByKey(tenantId, key);
    return moveAndReturn<TaskDefinition>(db, {
      table: taskDefinitions,
      sortColumn: taskDefinitions.sortOrder,
      idColumn: taskDefinitions.id,
      partitionWhere: eq(taskDefinitions.tenantId, tenantId)!,
      id: existing.id,
      body,
      notFound: (sid) => new TaskDefinitionNotFound(sid),
    });
  }

  async function deleteDefinition(
    tenantId: string,
    key: string,
  ): Promise<void> {
    const existing = await loadDefinitionByKey(tenantId, key);
    await db
      .delete(taskDefinitions)
      .where(
        and(
          eq(taskDefinitions.id, existing.id),
          eq(taskDefinitions.tenantId, tenantId),
        ),
      );
  }

  // ─── Phase 2: Event processing ────────────────────────────────

  /**
   * Process a business event and update matching task progress.
   * Returns the number of task definitions that were processed.
   */
  async function processEvent(
    tenantId: string,
    endUserId: string,
    eventName: string,
    eventData: Record<string, unknown>,
    now?: Date,
  ): Promise<number> {
    const ts = now ?? new Date();

    // 0. Record to event-catalog (auto field inference / sample refresh).
    //    Awaited but error-swallowing — catalog failures are logged and
    //    must not abort task dispatch, but we don't want a dangling
    //    promise outliving this request in Workers runtime (would need
    //    ctx.waitUntil to be reliable). TTL dedup inside the service makes
    //    the extra latency cheap for hot events: after the first write in
    //    a 5-min window every subsequent call is a Map lookup.
    if (eventCatalog) {
      try {
        await eventCatalog.recordExternalEvent(
          tenantId,
          eventName,
          eventData,
          ts,
        );
      } catch (err) {
        logger.error("task: recordExternalEvent failed", err);
      }
    }

    // 1. Find all active definitions matching this eventName
    const defs = await db
      .select()
      .from(taskDefinitions)
      .where(
        and(
          eq(taskDefinitions.tenantId, tenantId),
          eq(taskDefinitions.eventName, eventName),
          eq(taskDefinitions.isActive, true),
        ),
      );

    if (defs.length === 0) return 0;

    // 1b. Activity-phase gate — for defs bound to an activity, batch-resolve
    //     the live phase once and silently drop events whose activity is not
    //     in the writable phase ('active'). Silent because processEvent is
    //     a backend stream: throwing would surface as 4xx to upstream game
    //     services. Idempotent — re-firing the same event after the activity
    //     becomes active will naturally start counting (we never wrote a
    //     "dropped" marker). reset_mode/period independence is preserved
    //     because the gate is the OUTER filter.
    const boundActivityIds = [
      ...new Set(
        defs.map((d) => d.activityId).filter((x): x is string => !!x),
      ),
    ];
    const activityPhaseMap = await getActivityPhases(
      db,
      boundActivityIds,
      ts,
    );

    let processed = 0;

    for (const def of defs) {
      // 2. Compute current period key
      const currentPeriodKey = computePeriodKey(
        def.period as "daily" | "weekly" | "monthly" | "none",
        def.timezone,
        def.weekStartsOn,
        ts,
      );

      // 2b. Activity gate (silent skip — see batch resolution above).
      if (
        def.activityId &&
        !isWritablePhase(activityPhaseMap.get(def.activityId))
      ) {
        continue;
      }

      // 3. Visibility gate — 'assigned' tasks must NOT accumulate
      //    progress for unassigned users, otherwise the list-side
      //    filter is only cosmetic and autoClaim tasks would still
      //    mail rewards to everyone who fires the event. See
      //    getActiveAssignment for expiry semantics.
      if (def.visibility === "assigned") {
        const assignment = await getActiveAssignment(
          tenantId,
          endUserId,
          def.id,
          ts,
        );
        if (!assignment) continue;
      }

      // 4. Check prerequisites
      if (def.prerequisiteTaskIds.length > 0) {
        const prereqsMet = await checkPrerequisites(
          tenantId,
          endUserId,
          def.prerequisiteTaskIds,
          ts,
        );
        if (!prereqsMet) continue;
      }

      // 5. Apply filter expression (if configured). Runs in-memory against
      //    eventData. Fail-closed on compile/eval errors — a broken filter
      //    on one task must not poison dispatch for the rest.
      if (!matchesFilter(def, eventData)) continue;

      // 5. Compute increment
      let increment = 1;
      if (def.countingMethod === "event_value" && def.eventValueField) {
        increment = extractValue(eventData, def.eventValueField);
        if (increment <= 0) continue;
      }

      // 5. Atomic upsert progress
      const result = await db
        .insert(taskUserProgress)
        .values({
          taskId: def.id,
          endUserId,
          tenantId,
          periodKey: currentPeriodKey,
          currentValue: increment,
          isCompleted: increment >= def.targetValue,
          completedAt: increment >= def.targetValue ? ts : null,
        })
        .onConflictDoUpdate({
          target: [taskUserProgress.taskId, taskUserProgress.endUserId],
          set: {
            periodKey: currentPeriodKey,
            currentValue: sql`CASE
              WHEN ${taskUserProgress.periodKey} IS DISTINCT FROM ${currentPeriodKey}
                THEN ${increment}
              WHEN ${taskUserProgress.isCompleted}
                THEN ${taskUserProgress.currentValue}
              ELSE ${taskUserProgress.currentValue} + ${increment}
            END`,
            isCompleted: sql`CASE
              WHEN ${taskUserProgress.periodKey} IS DISTINCT FROM ${currentPeriodKey}
                THEN ${increment} >= ${def.targetValue}
              WHEN ${taskUserProgress.isCompleted}
                THEN true
              ELSE (${taskUserProgress.currentValue} + ${increment}) >= ${def.targetValue}
            END`,
            completedAt: sql`CASE
              WHEN ${taskUserProgress.isCompleted}
                AND ${taskUserProgress.periodKey} IS NOT DISTINCT FROM ${currentPeriodKey}
                THEN ${taskUserProgress.completedAt}
              WHEN CASE
                WHEN ${taskUserProgress.periodKey} IS DISTINCT FROM ${currentPeriodKey}
                  THEN ${increment} >= ${def.targetValue}
                ELSE (${taskUserProgress.currentValue} + ${increment}) >= ${def.targetValue}
              END
                THEN ${ts}
              ELSE NULL
            END`,
            claimedAt: sql`CASE
              WHEN ${taskUserProgress.periodKey} IS DISTINCT FROM ${currentPeriodKey}
                THEN NULL
              ELSE ${taskUserProgress.claimedAt}
            END`,
            updatedAt: ts,
          },
        })
        .returning();

      const row = result[0];
      if (!row) continue;

      processed++;

      // Pure observational analytics: every progress tick landed is a
      // `task.progress_reported` row in Tinybird. No business module
      // subscribes — routing through the event bus would be pure
      // overhead — so we write directly via the analytics writer.
      if (analytics) {
        void analytics.writer.logEvent({
          ts,
          orgId: tenantId,
          endUserId,
          traceId: getTraceId(),
          event: "task.progress_reported",
          source: "task",
          amount: increment,
          eventData: {
            taskId: def.id,
            taskAlias: def.alias,
            progressValue: row.currentValue,
            targetValue: def.targetValue,
            isCompleted: row.isCompleted,
            periodKey: currentPeriodKey,
          },
        });
      }

      // 6a. Tier (阶段) rewards fire on every progress bump — a tier
      // can be crossed before the task as a whole is completed, and
      // one big event can cross multiple tiers in a single step.
      // Idempotency is enforced by the ledger's unique PK, so calling
      // this on a stale/no-change update is safe.
      try {
        await evaluateAndDispatchTiers(tenantId, endUserId, def, row, ts);
      } catch (err) {
        logger.error("task: evaluateAndDispatchTiers failed", err);
      }

      // 6b. If task is completed and unclaimed, fire side-effects.
      // Both propagateToParent and handleAutoClaim are idempotent, so
      // re-running them on an already-completed task is safe and avoids
      // the timestamp-precision problem of detecting "just completed".
      if (row.isCompleted && !row.claimedAt) {
        // Propagate to parent
        if (def.parentId) {
          try {
            await propagateToParent(tenantId, endUserId, def, ts);
          } catch (err) {
            logger.error("task: propagateToParent failed", err);
          }
        }

        // Auto-claim via mail
        if (def.autoClaim) {
          try {
            await handleAutoClaim(tenantId, endUserId, def, row, ts);
          } catch (err) {
            logger.error("task: handleAutoClaim failed", err);
          }
        }
      }

      // Domain event: fire `task.completed` on the first-reach-target
      // transition only. `row.completedAt === ts` means this write is
      // the one that flipped `isCompleted` to true (the CASE expression
      // above preserves the original completedAt on subsequent writes
      // in the same period).
      if (
        events &&
        row.isCompleted &&
        row.completedAt?.getTime() === ts.getTime()
      ) {
        await events.emit("task.completed", {
          tenantId,
          endUserId,
          taskId: def.id,
          taskAlias: def.alias,
          progressValue: row.currentValue,
          completedAt: row.completedAt,
        });
      }
    }

    return processed;
  }

  /**
   * Check whether all prerequisite tasks are completed for this user.
   */
  async function checkPrerequisites(
    tenantId: string,
    endUserId: string,
    prereqIds: string[],
    now: Date,
  ): Promise<boolean> {
    if (prereqIds.length === 0) return true;

    // Load all prereq definitions to compute their periodKeys
    const prereqDefs = await db
      .select()
      .from(taskDefinitions)
      .where(
        and(
          eq(taskDefinitions.tenantId, tenantId),
          inArray(taskDefinitions.id, prereqIds),
        ),
      );

    if (prereqDefs.length !== prereqIds.length) return false;

    // Load progress rows for these tasks
    const progressRows = await db
      .select()
      .from(taskUserProgress)
      .where(
        and(
          eq(taskUserProgress.endUserId, endUserId),
          inArray(taskUserProgress.taskId, prereqIds),
        ),
      );

    const progressMap = new Map(
      progressRows.map((r) => [r.taskId, r]),
    );

    for (const def of prereqDefs) {
      const progress = progressMap.get(def.id);
      if (!progress) return false;
      if (!progress.isCompleted) return false;

      // Check if progress is stale (period rolled)
      const currentKey = computePeriodKey(
        def.period as "daily" | "weekly" | "monthly" | "none",
        def.timezone,
        def.weekStartsOn,
        now,
      );
      if (isPeriodStale(progress.periodKey, currentKey)) return false;
    }

    return true;
  }

  /**
   * Propagate child completion to parent task.
   * Uses SUM(parentProgressValue) of completed children — idempotent.
   */
  async function propagateToParent(
    tenantId: string,
    endUserId: string,
    childDef: TaskDefinition,
    now: Date,
  ): Promise<void> {
    if (!childDef.parentId) return;

    const parentDef = await loadDefinitionByKey(
      tenantId,
      childDef.parentId,
    );

    // Compute current period key for parent
    const parentPeriodKey = computePeriodKey(
      parentDef.period as "daily" | "weekly" | "monthly" | "none",
      parentDef.timezone,
      parentDef.weekStartsOn,
      now,
    );

    // Get all children of this parent
    const children = await db
      .select()
      .from(taskDefinitions)
      .where(
        and(
          eq(taskDefinitions.tenantId, tenantId),
          eq(taskDefinitions.parentId, parentDef.id),
        ),
      );

    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) return;

    // Load progress for all children
    const childProgress = await db
      .select()
      .from(taskUserProgress)
      .where(
        and(
          eq(taskUserProgress.endUserId, endUserId),
          inArray(taskUserProgress.taskId, childIds),
        ),
      );

    // SUM(parentProgressValue) of completed children whose periodKey is current
    let totalValue = 0;
    for (const cp of childProgress) {
      if (!cp.isCompleted) continue;
      const childDef2 = children.find((c) => c.id === cp.taskId);
      if (!childDef2) continue;

      // Check if child progress is current (not stale)
      const childPeriodKey = computePeriodKey(
        childDef2.period as "daily" | "weekly" | "monthly" | "none",
        childDef2.timezone,
        childDef2.weekStartsOn,
        now,
      );
      if (isPeriodStale(cp.periodKey, childPeriodKey)) continue;

      totalValue += childDef2.parentProgressValue;
    }

    const completed = totalValue >= parentDef.targetValue;

    // Upsert parent progress
    const result = await db
      .insert(taskUserProgress)
      .values({
        taskId: parentDef.id,
        endUserId,
        tenantId,
        periodKey: parentPeriodKey,
        currentValue: totalValue,
        isCompleted: completed,
        completedAt: completed ? now : null,
      })
      .onConflictDoUpdate({
        target: [taskUserProgress.taskId, taskUserProgress.endUserId],
        set: {
          periodKey: parentPeriodKey,
          currentValue: totalValue,
          isCompleted: completed,
          completedAt: sql`CASE
            WHEN ${taskUserProgress.isCompleted}
              AND ${taskUserProgress.periodKey} IS NOT DISTINCT FROM ${parentPeriodKey}
              THEN ${taskUserProgress.completedAt}
            WHEN ${completed}
              THEN ${now}
            ELSE NULL
          END`,
          claimedAt: sql`CASE
            WHEN ${taskUserProgress.periodKey} IS DISTINCT FROM ${parentPeriodKey}
              THEN NULL
            ELSE ${taskUserProgress.claimedAt}
          END`,
          updatedAt: now,
        },
      })
      .returning();

    const row = result[0];
    if (!row) return;

    // Tier evaluation on the parent — this is what closes the gap
    // where a subtask completing (and only a subtask) would let the
    // parent cross a staged-reward threshold without the tier
    // firing. Runs regardless of whether the parent itself is
    // completed.
    try {
      await evaluateAndDispatchTiers(
        tenantId,
        endUserId,
        parentDef,
        row,
        now,
      );
    } catch (err) {
      logger.error("task: parent evaluateAndDispatchTiers failed", err);
    }

    if (
      row.isCompleted &&
      !row.claimedAt &&
      row.completedAt?.getTime() === now.getTime() &&
      parentDef.autoClaim
    ) {
      try {
        await handleAutoClaim(tenantId, endUserId, parentDef, row, now);
      } catch (err) {
        logger.error("task: parent handleAutoClaim failed", err);
      }
    }

    // Domain event on the parent's own first-reach-target transition.
    if (
      events &&
      row.isCompleted &&
      row.completedAt?.getTime() === now.getTime()
    ) {
      await events.emit("task.completed", {
        tenantId,
        endUserId,
        taskId: parentDef.id,
        taskAlias: parentDef.alias,
        progressValue: row.currentValue,
        completedAt: row.completedAt,
      });
    }
  }

  /**
   * Load the set of tier aliases already claimed this period for a
   * given (task, endUser). Rows from past periods are excluded —
   * period reset is lazy, so a stale row for yesterday must not shadow
   * a fresh unlock today.
   */
  async function loadClaimedTierAliases(
    taskId: string,
    endUserId: string,
    periodKey: string,
  ): Promise<Set<string>> {
    const rows = await db
      .select({ tierAlias: taskUserMilestoneClaims.tierAlias })
      .from(taskUserMilestoneClaims)
      .where(
        and(
          eq(taskUserMilestoneClaims.taskId, taskId),
          eq(taskUserMilestoneClaims.endUserId, endUserId),
          eq(taskUserMilestoneClaims.periodKey, periodKey),
        ),
      );
    return new Set(rows.map((r) => r.tierAlias));
  }

  /**
   * Evaluate reward tiers against the latest `progress.currentValue`.
   * Used from both the event-update path (`processEvent`) and the
   * subtask → parent propagation path (`propagateToParent`), so a
   * child task completing and bumping its parent's progress past a
   * parent tier triggers that tier just like a direct event would.
   *
   * For `autoClaim=true` tasks the tier is dispatched immediately via
   * mail (idempotent through the ledger's primary-key unique
   * constraint). For manual tasks the tier is left unclaimed — it
   * surfaces in `getTasksForUser` and the player calls `claimTier`.
   *
   * Not using a `previousValue` comparison: piecing it together from
   * RETURNING diffs would be race-prone, and wrapping the whole flow in
   * `db.transaction()` would pin a Hyperdrive pooled connection across
   * the mail/grant fan-out. Instead the ledger itself is the source of
   * truth — any tier whose threshold fits the current progress and
   * has no ledger row is eligible. `currentValue` is monotonically
   * non-decreasing within a period, so no tier can become eligible
   * and then lose eligibility.
   */
  async function evaluateAndDispatchTiers(
    tenantId: string,
    endUserId: string,
    def: TaskDefinition,
    progress: TaskUserProgress,
    now: Date,
  ): Promise<{ crossedTierAliases: string[] }> {
    const tiers = def.rewardTiers;
    if (!tiers || tiers.length === 0) return { crossedTierAliases: [] };

    const alreadyClaimed = await loadClaimedTierAliases(
      def.id,
      endUserId,
      progress.periodKey,
    );

    const crossed: string[] = [];
    const mailSvc = def.autoClaim ? mailSvcGetter() : undefined;

    for (const tier of tiers) {
      if (tier.threshold > progress.currentValue) continue;
      if (alreadyClaimed.has(tier.alias)) continue;
      crossed.push(tier.alias);

      if (!def.autoClaim) continue;

      // autoClaim path: insert the ledger row first (idempotency
      // gate), then send the mail. The unique-PK violation path is
      // the concurrent-call "already dispatched" branch.
      try {
        const [inserted] = await db
          .insert(taskUserMilestoneClaims)
          .values({
            taskId: def.id,
            endUserId,
            tenantId,
            periodKey: progress.periodKey,
            tierAlias: tier.alias,
            claimedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted) continue;
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        logger.error("task: tier ledger insert failed", err);
        continue;
      }

      if (!mailSvc) continue;
      try {
        await mailSvc.createMessage(tenantId, {
          title: def.name,
          content: `Task tier reached: ${def.name} (${tier.alias})`,
          rewards: tier.rewards,
          targetType: "multicast",
          targetUserIds: [endUserId],
          originSource: TIER_AUTOCLAIM_SOURCE,
          originSourceId: `${def.id}:${endUserId}:${progress.periodKey}:${tier.alias}`,
        });
      } catch (err) {
        logger.error("task: tier auto-claim mail failed", err);
      }
    }

    return { crossedTierAliases: crossed };
  }

  /**
   * Handle auto-claim: send rewards via mail.
   */
  async function handleAutoClaim(
    tenantId: string,
    endUserId: string,
    def: TaskDefinition,
    progress: TaskUserProgress,
    now: Date,
  ): Promise<void> {
    const mailSvc = mailSvcGetter();
    if (!mailSvc) return;

    // Mark as claimed first (atomic gate)
    const [updated] = await db
      .update(taskUserProgress)
      .set({ claimedAt: now })
      .where(
        and(
          eq(taskUserProgress.taskId, def.id),
          eq(taskUserProgress.endUserId, endUserId),
          isNull(taskUserProgress.claimedAt),
          eq(taskUserProgress.isCompleted, true),
        ),
      )
      .returning();

    if (!updated) return; // Already claimed by concurrent request

    // Send mail with rewards
    const originSourceId = `${def.id}:${endUserId}:${progress.periodKey}`;
    await mailSvc.createMessage(tenantId, {
      title: def.name,
      content: `Task completed: ${def.name}`,
      rewards: def.rewards,
      targetType: "multicast",
      targetUserIds: [endUserId],
      originSource: AUTOCLAIM_SOURCE,
      originSourceId,
    });
  }

  // ─── Player-facing methods ────────────────────────────────────

  /**
   * Get all tasks with progress for a player.
   */
  async function getTasksForUser(
    tenantId: string,
    endUserId: string,
    filters?: {
      categoryId?: string;
      period?: string;
      includeHidden?: boolean;
    },
    now?: Date,
  ) {
    const ts = now ?? new Date();

    // Load definitions
    const conditions = [
      eq(taskDefinitions.tenantId, tenantId),
      eq(taskDefinitions.isActive, true),
    ];
    if (filters?.categoryId) {
      conditions.push(eq(taskDefinitions.categoryId, filters.categoryId));
    }
    if (filters?.period) {
      conditions.push(eq(taskDefinitions.period, filters.period));
    }

    const defs = await db
      .select()
      .from(taskDefinitions)
      .where(and(...conditions))
      .orderBy(taskDefinitions.sortOrder);

    if (defs.length === 0) return [];

    // Batch-load active assignments for any 'assigned'-visibility
    // tasks this user might see. Broadcast tasks never consult the
    // assignment map — legacy behaviour preserved.
    const assignedDefIds = defs
      .filter((d) => d.visibility === "assigned")
      .map((d) => d.id);
    const assignmentMap = new Map<string, TaskUserAssignment>();
    if (assignedDefIds.length > 0) {
      const rows = await db
        .select()
        .from(taskUserAssignments)
        .where(
          and(
            eq(taskUserAssignments.tenantId, tenantId),
            eq(taskUserAssignments.endUserId, endUserId),
            inArray(taskUserAssignments.taskId, assignedDefIds),
            isNull(taskUserAssignments.revokedAt),
          ),
        );
      for (const row of rows) {
        if (row.expiresAt && row.expiresAt.getTime() <= ts.getTime()) continue;
        assignmentMap.set(row.taskId, row);
      }
    }

    // Load all progress rows for this user
    const defIds = defs.map((d) => d.id);
    const progressRows = await db
      .select()
      .from(taskUserProgress)
      .where(
        and(
          eq(taskUserProgress.endUserId, endUserId),
          eq(taskUserProgress.tenantId, tenantId),
          inArray(taskUserProgress.taskId, defIds),
        ),
      );

    const progressMap = new Map(
      progressRows.map((r) => [r.taskId, r]),
    );

    // Batch-load tier claims for any task that has tiers configured.
    // One query covers every task in the result set. Past-period rows
    // are filtered out in-memory below against each def's current
    // periodKey so the query itself stays a simple inArray lookup.
    const tieredDefIds = defs
      .filter((d) => (d.rewardTiers?.length ?? 0) > 0)
      .map((d) => d.id);
    const tierClaimsByTask = new Map<string, Map<string, string[]>>();
    if (tieredDefIds.length > 0) {
      const claimRows = await db
        .select({
          taskId: taskUserMilestoneClaims.taskId,
          periodKey: taskUserMilestoneClaims.periodKey,
          tierAlias: taskUserMilestoneClaims.tierAlias,
        })
        .from(taskUserMilestoneClaims)
        .where(
          and(
            eq(taskUserMilestoneClaims.endUserId, endUserId),
            eq(taskUserMilestoneClaims.tenantId, tenantId),
            inArray(taskUserMilestoneClaims.taskId, tieredDefIds),
          ),
        );
      for (const row of claimRows) {
        let byPeriod = tierClaimsByTask.get(row.taskId);
        if (!byPeriod) {
          byPeriod = new Map();
          tierClaimsByTask.set(row.taskId, byPeriod);
        }
        const list = byPeriod.get(row.periodKey) ?? [];
        list.push(row.tierAlias);
        byPeriod.set(row.periodKey, list);
      }
    }

    // Check prerequisites for hidden tasks
    const allPrereqIds = new Set<string>();
    for (const def of defs) {
      for (const pid of def.prerequisiteTaskIds) {
        allPrereqIds.add(pid);
      }
    }

    let prereqProgress: Map<string, TaskUserProgress> = new Map();
    let prereqDefs: Map<string, TaskDefinition> = new Map();
    if (allPrereqIds.size > 0) {
      const prereqDefRows = await db
        .select()
        .from(taskDefinitions)
        .where(
          and(
            eq(taskDefinitions.tenantId, tenantId),
            inArray(taskDefinitions.id, [...allPrereqIds]),
          ),
        );
      prereqDefs = new Map(prereqDefRows.map((d) => [d.id, d]));

      const prereqProgressRows = await db
        .select()
        .from(taskUserProgress)
        .where(
          and(
            eq(taskUserProgress.endUserId, endUserId),
            inArray(taskUserProgress.taskId, [...allPrereqIds]),
          ),
        );
      prereqProgress = new Map(
        prereqProgressRows.map((r) => [r.taskId, r]),
      );
    }

    const results = [];

    for (const def of defs) {
      // Visibility gate — drop 'assigned' tasks the user has no
      // active assignment for. Broadcast tasks fall through.
      const activeAssignment =
        def.visibility === "assigned"
          ? assignmentMap.get(def.id) ?? null
          : null;
      if (def.visibility === "assigned" && !activeAssignment) continue;

      // Check prerequisites
      let prerequisitesMet = true;
      if (def.prerequisiteTaskIds.length > 0) {
        for (const pid of def.prerequisiteTaskIds) {
          const pDef = prereqDefs.get(pid);
          const pProgress = prereqProgress.get(pid);
          if (!pDef || !pProgress || !pProgress.isCompleted) {
            prerequisitesMet = false;
            break;
          }
          // Check staleness
          const pKey = computePeriodKey(
            pDef.period as "daily" | "weekly" | "monthly" | "none",
            pDef.timezone,
            pDef.weekStartsOn,
            ts,
          );
          if (isPeriodStale(pProgress.periodKey, pKey)) {
            prerequisitesMet = false;
            break;
          }
        }
      }

      // Skip hidden tasks whose prereqs are not met
      if (!prerequisitesMet && def.isHidden && !filters?.includeHidden) {
        continue;
      }

      // Compute current progress (with lazy reset)
      const progress = progressMap.get(def.id);
      const currentPeriodKey = computePeriodKey(
        def.period as "daily" | "weekly" | "monthly" | "none",
        def.timezone,
        def.weekStartsOn,
        ts,
      );

      let currentValue = 0;
      let isCompleted = false;
      let completedAt: Date | null = null;
      let claimedAt: Date | null = null;

      if (progress && !isPeriodStale(progress.periodKey, currentPeriodKey)) {
        currentValue = progress.currentValue;
        isCompleted = progress.isCompleted;
        completedAt = progress.completedAt;
        claimedAt = progress.claimedAt;
      }

      const claimedTierAliases =
        tierClaimsByTask.get(def.id)?.get(currentPeriodKey) ?? [];

      results.push({
        id: def.id,
        categoryId: def.categoryId,
        parentId: def.parentId,
        name: def.name,
        description: def.description,
        icon: def.icon,
        period: def.period,
        countingMethod: def.countingMethod,
        targetValue: def.targetValue,
        rewards: def.rewards,
        rewardTiers: def.rewardTiers ?? [],
        autoClaim: def.autoClaim,
        navigation: def.navigation,
        sortOrder: def.sortOrder,
        currentValue,
        isCompleted,
        completedAt: completedAt?.toISOString() ?? null,
        claimedAt: claimedAt?.toISOString() ?? null,
        claimedTierAliases,
        prerequisitesMet,
        assignment: activeAssignment
          ? {
              assignedAt: activeAssignment.assignedAt.toISOString(),
              expiresAt: activeAssignment.expiresAt?.toISOString() ?? null,
              source: activeAssignment.source,
            }
          : null,
      });
    }

    return results;
  }

  /**
   * Manual reward claim for a completed task.
   */
  async function claimReward(
    tenantId: string,
    endUserId: string,
    taskId: string,
    now?: Date,
  ) {
    const ts = now ?? new Date();
    const def = await loadDefinitionByKey(tenantId, taskId);

    if (def.autoClaim) throw new TaskAutoClaimOnly();

    // Activity-phase gate: claims allowed in {active, ended}, blocked
    // in {teasing, archived}. Player-initiated, so we throw a
    // typed error (router maps to 409) instead of silently dropping.
    if (def.activityId) {
      await assertActivityClaimable(db, def.activityId, ts);
    }

    // Load progress
    const rows = await db
      .select()
      .from(taskUserProgress)
      .where(
        and(
          eq(taskUserProgress.taskId, def.id),
          eq(taskUserProgress.endUserId, endUserId),
        ),
      )
      .limit(1);

    const progress = rows[0];
    if (!progress) throw new TaskNotCompleted();

    // Check period staleness
    const currentPeriodKey = computePeriodKey(
      def.period as "daily" | "weekly" | "monthly" | "none",
      def.timezone,
      def.weekStartsOn,
      ts,
    );
    if (isPeriodStale(progress.periodKey, currentPeriodKey)) {
      throw new TaskNotCompleted();
    }
    if (!progress.isCompleted) throw new TaskNotCompleted();
    if (progress.claimedAt) throw new TaskAlreadyClaimed();

    // Atomic claim
    const [updated] = await db
      .update(taskUserProgress)
      .set({ claimedAt: ts })
      .where(
        and(
          eq(taskUserProgress.taskId, def.id),
          eq(taskUserProgress.endUserId, endUserId),
          isNull(taskUserProgress.claimedAt),
          eq(taskUserProgress.isCompleted, true),
        ),
      )
      .returning();

    if (!updated) throw new TaskAlreadyClaimed();

    // Grant rewards
    const sourceId = `${def.id}:${endUserId}:${progress.periodKey}`;
    await grantRewards(
      rewardServices,
      tenantId,
      endUserId,
      def.rewards,
      CLAIM_SOURCE,
      sourceId,
    );

    // Domain event — subscribers (leaderboard, etc.) react without
    // coupling the task service to them. Fire-and-forget inside the
    // bus; a failing handler is logged and does not affect the claim.
    if (events) {
      await events.emit("task.claimed", {
        tenantId,
        endUserId,
        taskId: def.id,
        taskAlias: def.alias,
        categoryId: def.categoryId,
        progressValue: progress.currentValue,
        rewards: def.rewards,
        periodKey: progress.periodKey ?? "",
        claimedAt: ts,
      });
    }

    return {
      taskId: def.id,
      grantedRewards: def.rewards,
      claimedAt: ts.toISOString(),
    };
  }

  /**
   * Manual claim for a single reward tier (阶段性奖励). Rejects if the
   * task is `autoClaim=true` (those tasks deliver tiers via mail
   * automatically), if the tier alias is unknown, or if the player
   * has not reached the tier threshold. Idempotent — re-claiming the
   * same (task, user, period, tier) throws TaskAlreadyClaimed.
   */
  async function claimTier(
    tenantId: string,
    endUserId: string,
    taskId: string,
    tierAlias: string,
    now?: Date,
  ) {
    const ts = now ?? new Date();
    const def = await loadDefinitionByKey(tenantId, taskId);

    if (def.autoClaim) throw new TaskAutoClaimOnly();

    // Activity-phase gate (see claimReward).
    if (def.activityId) {
      await assertActivityClaimable(db, def.activityId, ts);
    }

    const tier: TaskRewardTier | undefined = (def.rewardTiers ?? []).find(
      (t) => t.alias === tierAlias,
    );
    if (!tier) throw new TaskTierNotFound(tierAlias);

    // Load progress
    const rows = await db
      .select()
      .from(taskUserProgress)
      .where(
        and(
          eq(taskUserProgress.taskId, def.id),
          eq(taskUserProgress.endUserId, endUserId),
        ),
      )
      .limit(1);

    const progress = rows[0];
    if (!progress) throw new TaskTierNotReached();

    // Check period staleness — a tier claim uses the same lazy reset
    // semantics as the completion claim; a stale row is treated as
    // zero progress.
    const currentPeriodKey = computePeriodKey(
      def.period as "daily" | "weekly" | "monthly" | "none",
      def.timezone,
      def.weekStartsOn,
      ts,
    );
    if (isPeriodStale(progress.periodKey, currentPeriodKey)) {
      throw new TaskTierNotReached();
    }
    if (progress.currentValue < tier.threshold) {
      throw new TaskTierNotReached();
    }

    // Insert ledger row — unique PK on (task, user, period, alias) is
    // the idempotency gate. Zero rows back = already claimed.
    let inserted: typeof taskUserMilestoneClaims.$inferSelect | undefined;
    try {
      const result = await db
        .insert(taskUserMilestoneClaims)
        .values({
          taskId: def.id,
          endUserId,
          tenantId,
          periodKey: progress.periodKey,
          tierAlias: tier.alias,
          claimedAt: ts,
        })
        .onConflictDoNothing()
        .returning();
      inserted = result[0];
    } catch (err) {
      if (isUniqueViolation(err)) throw new TaskAlreadyClaimed();
      throw err;
    }
    if (!inserted) throw new TaskAlreadyClaimed();

    // Grant rewards via the shared helper — same path as the
    // completion-reward manual claim, just scoped to this tier.
    const sourceId = `${def.id}:${endUserId}:${progress.periodKey}:${tier.alias}`;
    await grantRewards(
      rewardServices,
      tenantId,
      endUserId,
      tier.rewards,
      TIER_CLAIM_SOURCE,
      sourceId,
    );

    if (events) {
      await events.emit("task.tier.claimed", {
        tenantId,
        endUserId,
        taskId: def.id,
        taskAlias: def.alias,
        tierAlias: tier.alias,
        threshold: tier.threshold,
        progressValue: progress.currentValue,
        rewards: tier.rewards,
        periodKey: progress.periodKey ?? "",
        claimedAt: ts,
      });
    }

    return {
      taskId: def.id,
      tierAlias: tier.alias,
      grantedRewards: tier.rewards,
      claimedAt: ts.toISOString(),
    };
  }

  // ─── Assignment (定向分配) ─────────────────────────────────────

  /**
   * Fetch a single user's active assignment for a task, or null.
   *
   * "Active" = the row exists, `revoked_at` is null, and either
   * `expires_at` is null or strictly in the future.
   */
  async function getActiveAssignment(
    tenantId: string,
    endUserId: string,
    taskId: string,
    now: Date,
  ): Promise<TaskUserAssignment | null> {
    const rows = await db
      .select()
      .from(taskUserAssignments)
      .where(
        and(
          eq(taskUserAssignments.tenantId, tenantId),
          eq(taskUserAssignments.endUserId, endUserId),
          eq(taskUserAssignments.taskId, taskId),
          isNull(taskUserAssignments.revokedAt),
          or(
            isNull(taskUserAssignments.expiresAt),
            gt(taskUserAssignments.expiresAt, now),
          ),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  type AssignTaskOptions = {
    source?: TaskAssignmentSource;
    sourceRef?: string | null;
    expiresAt?: Date | null;
    ttlSeconds?: number;
    metadata?: Record<string, unknown> | null;
    allowReassign?: boolean;
    now?: Date;
  };

  /** Resolve the effective expiresAt from call-level options + def default. */
  function resolveExpiresAt(
    def: TaskDefinition,
    options: AssignTaskOptions,
    ts: Date,
  ): Date | null {
    if (options.expiresAt !== undefined) return options.expiresAt;
    if (options.ttlSeconds !== undefined) {
      return new Date(ts.getTime() + options.ttlSeconds * 1000);
    }
    if (def.defaultAssignmentTtlSeconds != null) {
      return new Date(ts.getTime() + def.defaultAssignmentTtlSeconds * 1000);
    }
    return null;
  }

  /**
   * Assign a task to a single end user. Intended as the primary
   * callable for programmatic triggers (activity schedules, other
   * modules, external webhooks via admin API).
   *
   * Idempotency model (driven by the `(task_id, end_user_id)` PK):
   *   - If no row exists → INSERT new active assignment.
   *   - If a row exists AND `revoked_at IS NOT NULL` → revive it
   *     (clear revoked_at, refresh assignedAt/expiresAt/source). This
   *     branch runs regardless of `allowReassign` — a revoked
   *     assignment being explicitly re-assigned is the normal re-enable
   *     flow.
   *   - If an active row exists AND `allowReassign` is true → refresh
   *     assignedAt/expiresAt/source/metadata.
   *   - If an active row exists AND `allowReassign` is false (default)
   *     → keep the existing row as-is (no-op), return the existing
   *     row so callers can still inspect source/expiry.
   *
   * `visibility === 'broadcast'` tasks may still be assigned — the row
   * has no visibility effect there but the audit / source tagging is
   * still useful for mixed-mode definitions. This is called out in the
   * plan doc as "harmless noop on broadcast defs".
   */
  async function assignTask(
    tenantId: string,
    endUserId: string,
    taskKey: string,
    options: AssignTaskOptions = {},
  ): Promise<TaskUserAssignment> {
    if (options.expiresAt && options.ttlSeconds != null) {
      throw new TaskInvalidInput(
        "expiresAt and ttlSeconds are mutually exclusive",
      );
    }

    const ts = options.now ?? new Date();
    const def = await loadDefinitionByKey(tenantId, taskKey);
    if (!def.isActive) {
      throw new TaskNotAssignable("task is inactive");
    }

    const expiresAt = resolveExpiresAt(def, options, ts);
    const source = options.source ?? "manual";
    const sourceRef = options.sourceRef ?? null;
    const metadata = options.metadata ?? null;
    const allowReassign = options.allowReassign ?? false;

    // Branch 1 — caller opted into "refresh existing": unconditional
    // upsert that always overwrites the mutable fields on conflict.
    if (allowReassign) {
      const [row] = await db
        .insert(taskUserAssignments)
        .values({
          taskId: def.id,
          endUserId,
          tenantId,
          assignedAt: ts,
          expiresAt,
          revokedAt: null,
          source,
          sourceRef,
          metadata,
        })
        .onConflictDoUpdate({
          target: [taskUserAssignments.taskId, taskUserAssignments.endUserId],
          set: {
            assignedAt: ts,
            expiresAt,
            revokedAt: null,
            source,
            sourceRef,
            metadata,
            updatedAt: ts,
          },
        })
        .returning();
      if (!row) throw new Error("assign upsert returned no row");
      return row;
    }

    // Branch 2 — default path: INSERT new row, or revive a revoked
    // row if one exists. The WHERE on DO UPDATE ensures an active row
    // is NOT overwritten — we still return the existing row below.
    const inserted = await db
      .insert(taskUserAssignments)
      .values({
        taskId: def.id,
        endUserId,
        tenantId,
        assignedAt: ts,
        expiresAt,
        revokedAt: null,
        source,
        sourceRef,
        metadata,
      })
      .onConflictDoUpdate({
        target: [taskUserAssignments.taskId, taskUserAssignments.endUserId],
        set: {
          assignedAt: ts,
          expiresAt,
          revokedAt: null,
          source,
          sourceRef,
          metadata,
          updatedAt: ts,
        },
        setWhere: sql`${taskUserAssignments.revokedAt} IS NOT NULL`,
      })
      .returning();

    if (inserted[0]) return inserted[0];

    // The upsert updated nothing (active row present). Read it back.
    const existingRows = await db
      .select()
      .from(taskUserAssignments)
      .where(
        and(
          eq(taskUserAssignments.taskId, def.id),
          eq(taskUserAssignments.endUserId, endUserId),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new Error("assign upsert vanished mid-call");
    return existing;
  }

  /**
   * Batch-assign a task to multiple users. Enforces the batch cap so a
   * single HTTP call can't fan out unbounded inserts.
   *
   * Not wrapped in a transaction — individual `assignTask` calls run
   * sequentially. Each call is atomic on its
   * own row; a partial failure leaves earlier rows assigned. Caller
   * logs / retries by diffing the returned `items` against the
   * requested `endUserIds`.
   */
  async function assignTaskToUsers(
    tenantId: string,
    taskKey: string,
    endUserIds: string[],
    options: AssignTaskOptions = {},
  ): Promise<{
    assigned: number;
    skipped: number;
    items: TaskUserAssignment[];
  }> {
    if (endUserIds.length === 0) {
      return { assigned: 0, skipped: 0, items: [] };
    }
    if (endUserIds.length > ASSIGNMENT_BATCH_MAX) {
      throw new TaskAssignmentBatchTooLarge(
        endUserIds.length,
        ASSIGNMENT_BATCH_MAX,
      );
    }

    // Dedupe while preserving caller order — avoids double-counting
    // `skipped` for a duplicate user id in one request.
    const unique = Array.from(new Set(endUserIds));
    const ts = options.now ?? new Date();

    // Resolve the definition once, not N times — `assignTask`'s own
    // load-by-key is correct but wasteful in a batch loop.
    const def = await loadDefinitionByKey(tenantId, taskKey);
    if (!def.isActive) {
      throw new TaskNotAssignable("task is inactive");
    }

    let assigned = 0;
    let skipped = 0;
    const items: TaskUserAssignment[] = [];

    for (const uid of unique) {
      const before = await getActiveAssignment(tenantId, uid, def.id, ts);
      const row = await assignTask(tenantId, uid, def.id, {
        ...options,
        now: ts,
      });
      if (before && !options.allowReassign) {
        skipped++;
      } else {
        assigned++;
      }
      items.push(row);
    }

    return { assigned, skipped, items };
  }

  /**
   * Revoke an assignment (soft delete). Idempotent: revoking an
   * already-revoked / non-existent assignment throws
   * `TaskAssignmentNotFound`. The row is kept for audit; progress
   * rows are untouched so a future re-assign resumes where the user
   * left off (subject to period reset).
   */
  async function revokeAssignment(
    tenantId: string,
    endUserId: string,
    taskKey: string,
    options?: { now?: Date },
  ): Promise<void> {
    const ts = options?.now ?? new Date();
    const def = await loadDefinitionByKey(tenantId, taskKey);

    const [row] = await db
      .update(taskUserAssignments)
      .set({ revokedAt: ts, updatedAt: ts })
      .where(
        and(
          eq(taskUserAssignments.taskId, def.id),
          eq(taskUserAssignments.endUserId, endUserId),
          eq(taskUserAssignments.tenantId, tenantId),
          isNull(taskUserAssignments.revokedAt),
        ),
      )
      .returning();

    if (!row) throw new TaskAssignmentNotFound(endUserId);
  }

  /**
   * List assignments. Two query modes:
   *   - filter.taskId set → "who has this task been assigned to"
   *   - filter.endUserId set → "which tasks is this user assigned"
   * Callers can combine both.
   *
   * `activeOnly` (default true) excludes revoked and expired rows.
   */
  async function listAssignments(
    tenantId: string,
    filter: { endUserId?: string; taskId?: string; activeOnly?: boolean } = {},
    options?: { limit?: number; now?: Date },
  ): Promise<TaskUserAssignment[]> {
    const ts = options?.now ?? new Date();
    const activeOnly = filter.activeOnly ?? true;

    const conditions = [eq(taskUserAssignments.tenantId, tenantId)];
    if (filter.taskId) {
      conditions.push(eq(taskUserAssignments.taskId, filter.taskId));
    }
    if (filter.endUserId) {
      conditions.push(eq(taskUserAssignments.endUserId, filter.endUserId));
    }
    if (activeOnly) {
      conditions.push(isNull(taskUserAssignments.revokedAt));
      // expires_at NULL or in the future — enforced in SQL so the
      // admin "active only" listing returns a stable count across
      // pagination without post-filtering.
      conditions.push(
        or(
          isNull(taskUserAssignments.expiresAt),
          gt(taskUserAssignments.expiresAt, ts),
        )!,
      );
    }

    return db
      .select()
      .from(taskUserAssignments)
      .where(and(...conditions))
      .orderBy(taskUserAssignments.assignedAt)
      .limit(options?.limit ?? 100);
  }

  return {
    // Category CRUD
    listCategories,
    getCategory,
    createCategory,
    updateCategory,
    moveCategory,
    deleteCategory,
    // Definition CRUD
    listDefinitions,
    getDefinition,
    createDefinition,
    updateDefinition,
    moveDefinition,
    deleteDefinition,
    // Event processing (Phase 2)
    processEvent,
    // Player-facing (Phase 2)
    getTasksForUser,
    claimReward,
    claimTier,
    // Assignment (定向分配)
    assignTask,
    assignTaskToUsers,
    revokeAssignment,
    listAssignments,
    getActiveAssignment,
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
