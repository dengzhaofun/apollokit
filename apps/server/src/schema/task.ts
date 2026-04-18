import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Task / Quest / Achievement module — unified event-driven task system.
 *
 * Hierarchy:
 *   Category  (display grouping — "daily quests", "achievements", …)
 *     └─ Definition  (one task template — what players work towards)
 *           └─ UserProgress  (per-player state for this task)
 *
 * Design notes:
 *
 * 1. Achievements are tasks with `period = 'none'` and an achievement-type
 *    category. No separate table or service — same progress tracking,
 *    same reward claiming, same event dispatch.
 *
 * 2. Period reset is lazy (no cron). Each progress row carries a `periodKey`
 *    (e.g. "2026-04-16" for daily, "2026-W16" for weekly). On read/write
 *    the service compares stored key to the computed current key — stale
 *    rows are treated as zero on read and reset on write.
 *
 * 3. Parent-child accumulation: a parent task has
 *    `countingMethod = 'child_completion'` and children point to it via
 *    `parentId`. When a child completes, the service computes
 *    `SUM(parentProgressValue)` of completed children and upserts the
 *    parent row idempotently. Only one nesting level is supported.
 *
 * 4. Event processing: external services POST events to
 *    `/api/client/task/events`. The service queries matching definitions
 *    by `(organizationId, eventName)` and updates progress atomically,
 *    one SQL per matching task.
 *
 * 5. Counting methods:
 *      - 'event_count'      → each event increments progress by 1
 *      - 'event_value'      → extracts a numeric value from eventData
 *                              using `eventValueField` dot-path
 *      - 'child_completion' → progress = SUM of completed children's
 *                              parentProgressValue
 *
 * 6. Reward delivery reuses the existing `RewardEntry[]` + `grantRewards()`
 *    + mail system:
 *      - autoClaim=false → player taps "claim" → grantRewards directly
 *      - autoClaim=true  → mailService.sendUnicast with idempotency key
 *
 * 7. Prerequisites: `prerequisiteTaskIds` is a jsonb string[]. On read,
 *    tasks whose prereqs are not all completed are hidden (if isHidden)
 *    or shown as locked. On event processing, prereq-unsatisfied tasks
 *    are skipped.
 */

// ─── Task Categories ──────────────────────────────────────────────

/**
 * Task categories — display grouping for the client UI.
 *
 * `scope` is a free-form classification tag ('task' / 'achievement' /
 * 'custom') used by the UI for tab filtering; it does not drive server
 * behavior.
 */
export const taskCategories = pgTable(
  "task_categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    scope: text("scope").default("task").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("task_categories_org_idx").on(table.organizationId),
    uniqueIndex("task_categories_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

// ─── Task Definitions ─────────────────────────────────────────────

/**
 * Navigation config attached to a task — the client interprets this to
 * guide the player (jump to a scene, NPC, UI panel, etc.). The server
 * stores it opaquely as jsonb.
 */
export type TaskNavigation = {
  type: string;
  target: string;
  params?: Record<string, unknown>;
  label?: string;
};

/**
 * A progress-threshold reward tier on a single task (阶段性奖励).
 *
 * A task may declare any number of tiers. While `currentValue` advances
 * (via event or via subtask-driven parent propagation), any tier whose
 * `threshold <= currentValue` becomes claimable. Each tier is claimed
 * independently from the terminal `rewards` payout; terminal completion
 * still fires its own reward on `isCompleted = true`.
 *
 * `alias` is the stable identifier — used as the idempotency key on the
 * `task_user_milestone_claims` ledger — so admins can reorder / add /
 * remove tiers without invalidating prior claims. Validators enforce
 * alias uniqueness and strictly-increasing thresholds within a task.
 */
export type TaskRewardTier = {
  alias: string;
  threshold: number;
  rewards: RewardEntry[];
};

/**
 * Task definitions — admin-configured task templates.
 *
 * `parentId` is self-referential (SET NULL on delete). Only one level of
 * nesting is enforced in the service layer.
 *
 * `countingMethod` determines how progress increments:
 *   - 'event_count'      → +1 per matching event
 *   - 'event_value'      → +eventData[eventValueField] per event
 *   - 'child_completion' → SUM(completed children's parentProgressValue)
 *
 * `eventName` + `eventValueField` are only used when countingMethod is
 * event-based. For 'child_completion', both are null.
 *
 * `prerequisiteTaskIds` stores task definition IDs that must be completed
 * (any period, current or 'none') before this task activates.
 */
export const taskDefinitions = pgTable(
  "task_definitions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => taskCategories.id, {
      onDelete: "set null",
    }),
    parentId: uuid("parent_id"),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    period: text("period").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    weekStartsOn: smallint("week_starts_on").default(1).notNull(),
    countingMethod: text("counting_method").notNull(),
    eventName: text("event_name"),
    eventValueField: text("event_value_field"),
    // Optional filtrex expression evaluated against eventData. When set,
    // the event only advances progress if the expression returns truthy.
    // NULL means "no filter" (legacy behaviour, backward compatible).
    filter: text("filter"),
    targetValue: integer("target_value").notNull(),
    parentProgressValue: integer("parent_progress_value").default(1).notNull(),
    prerequisiteTaskIds: jsonb("prerequisite_task_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    /**
     * Staged-reward tiers keyed off `currentValue` (阶段性奖励). Each
     * entry unlocks independently when its `threshold` is crossed. See
     * the `TaskRewardTier` type above for semantics. An empty array =
     * legacy single-reward behavior.
     */
    rewardTiers: jsonb("reward_tiers")
      .$type<TaskRewardTier[]>()
      .default([])
      .notNull(),
    autoClaim: boolean("auto_claim").default(false).notNull(),
    navigation: jsonb("navigation").$type<TaskNavigation | null>(),
    isActive: boolean("is_active").default(true).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    /**
     * Visibility mode (see TASK_VISIBILITIES):
     *   - 'broadcast' (default) → visible to every end user in the org.
     *     Legacy behaviour. All existing rows backfill to this value.
     *   - 'assigned'  → only visible to end users who have an active
     *     row in `task_user_assignments`. `processEvent` also
     *     short-circuits progress updates for unassigned users, so a
     *     defn with `assigned` visibility is truly scoped — not just
     *     hidden from the list.
     */
    visibility: text("visibility").default("broadcast").notNull(),
    /**
     * Default TTL (in seconds) for assignments created against this
     * definition. When a caller to `assignTask` doesn't supply its own
     * `expiresAt` or `ttlSeconds`, the service falls back to this value.
     * NULL = no default expiry (callers decide per-call).
     */
    defaultAssignmentTtlSeconds: integer("default_assignment_ttl_seconds"),
    sortOrder: integer("sort_order").default(0).notNull(),
    /**
     * Soft link to an `activity_configs.id` when this task belongs to
     * an activity's `task_group` node. NULL = standalone (permanent)
     * task. See `check_in_configs.activityId` for the rationale behind
     * keeping this FK-less.
     */
    activityId: uuid("activity_id"),
    activityNodeId: uuid("activity_node_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Hot path: event dispatch looks up definitions by (org, eventName)
    index("task_definitions_org_event_idx").on(
      table.organizationId,
      table.eventName,
    ),
    // Client list query ordered by category + sort
    index("task_definitions_org_cat_sort_idx").on(
      table.organizationId,
      table.categoryId,
      table.sortOrder,
    ),
    // Child lookup for parent tasks
    index("task_definitions_org_parent_idx").on(
      table.organizationId,
      table.parentId,
    ),
    // Alias uniqueness per org (partial — NULL aliases don't conflict)
    uniqueIndex("task_definitions_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    // Filter by activity (admin "show activity configs" toggle,
    // player-side activity node resolution)
    index("task_definitions_activity_idx").on(table.activityId),
    // Hot path for getTasksForUser: it filters by visibility + isActive
    // before joining progress and assignment maps. Partial index keeps
    // it small since most rows are `broadcast`.
    index("task_definitions_org_visibility_idx").on(
      table.organizationId,
      table.visibility,
      table.isActive,
    ),
  ],
);

// ─── Task User Progress ───────────────────────────────────────────

/**
 * Per-user per-task progress state — one row per (task, endUser).
 *
 * `periodKey` stores the computed period key for the current progress.
 * Stale keys (compared to the current period) trigger lazy reset on
 * next read or write. Values:
 *   - 'none'       → permanent task, never resets
 *   - '2026-04-16' → daily
 *   - '2026-W16'   → weekly
 *   - '2026-04'    → monthly
 *
 * `endUserId` is the SaaS customer's business user id — opaque text,
 * NOT a foreign key, never named `user_id`.
 *
 * `claimedAt` = NULL means unclaimed. The claim path uses an atomic
 * UPDATE ... WHERE claimedAt IS NULL to prevent double-claim.
 */
export const taskUserProgress = pgTable(
  "task_user_progress",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    periodKey: text("period_key").notNull(),
    currentValue: integer("current_value").default(0).notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    completedAt: timestamp("completed_at"),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.taskId, table.endUserId],
      name: "task_user_progress_pk",
    }),
    // "All my tasks" inbox query
    index("task_user_progress_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    // Parent accumulation: count completed children for a set of taskIds
    index("task_user_progress_task_completed_idx").on(
      table.taskId,
      table.isCompleted,
    ),
  ],
);

// ─── Task User Milestone Claims ───────────────────────────────────

/**
 * Idempotent ledger of tier-level (阶段) reward claims — one row per
 * `(task, endUser, periodKey, tierAlias)`.
 *
 * Rationale for `periodKey` in the primary key (unlike
 * `activity_user_rewards`): daily / weekly / monthly tasks reset, so a
 * row for `periodKey = '2026-04-17'` must not block the same tier from
 * re-unlocking on `'2026-04-18'`. Composite PK gives DB-level
 * idempotency within a period and natural reclaimability across
 * periods. Stale rows from past periods are harmless dead weight; a
 * periodic GC job can sweep them later if volume warrants.
 */
export const taskUserMilestoneClaims = pgTable(
  "task_user_milestone_claims",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    periodKey: text("period_key").notNull(),
    tierAlias: text("tier_alias").notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.taskId, table.endUserId, table.periodKey, table.tierAlias],
      name: "task_user_milestone_claims_pk",
    }),
    // "All my tier claims" inbox lookup
    index("task_user_milestone_claims_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    // Batched "what has this user claimed across these tasks this period"
    index("task_user_milestone_claims_user_task_period_idx").on(
      table.endUserId,
      table.taskId,
      table.periodKey,
    ),
  ],
);

// ─── Task Visibility & Assignments ────────────────────────────────

/**
 * Task visibility mode — controls who can see and progress a task.
 *
 *   - 'broadcast' (default) → every end user in the org sees this task,
 *     and any user triggering a matching event advances their own
 *     progress. This is the legacy behaviour every pre-existing row
 *     backfills to.
 *   - 'assigned'            → the task is dark by default. Only end
 *     users with an active row in `task_user_assignments` see it in
 *     `getTasksForUser`, and only they advance progress when a matching
 *     event fires (`processEvent` short-circuits the rest). Callers
 *     (admin API, upstream webhooks, other modules reacting to events)
 *     grant visibility via `taskService.assignTask*`.
 */
export const TASK_VISIBILITIES = ["broadcast", "assigned"] as const;
export type TaskVisibility = (typeof TASK_VISIBILITIES)[number];

/**
 * Who/what created an assignment row. Free-form tag captured alongside
 * an optional `sourceRef` for audit and debugging:
 *
 *   - 'manual'   → admin dashboard / CSV import via the admin API.
 *   - 'rule'     → another module reacted to a domain event
 *                  (`task.completed`, `level.cleared`, …) and assigned.
 *   - 'schedule' → fired by a recurring/activity schedule.
 *   - 'external' → an upstream system (CRM, ops tooling) called the
 *                  admin API directly with its own API key.
 */
export const TASK_ASSIGNMENT_SOURCES = [
  "manual",
  "rule",
  "schedule",
  "external",
] as const;
export type TaskAssignmentSource = (typeof TASK_ASSIGNMENT_SOURCES)[number];

/**
 * Per-user assignment ledger for `visibility = 'assigned'` tasks.
 *
 * One row per (task, endUser). A row with `revoked_at = NULL` and
 * either `expires_at = NULL` or `expires_at > now` is "active" — it
 * unlocks visibility and progress for this user on this task.
 *
 * Revocation is a soft delete (`revoked_at` timestamp) rather than a
 * physical DELETE so that:
 *
 *   1. Re-assigning later can cheaply "revive" the same row via
 *      `ON CONFLICT DO UPDATE` without recomputing the PK.
 *   2. An audit trail remains available for operations debugging.
 *
 * Progress is not coupled to assignment: revoking an assignment does
 * NOT clear `task_user_progress`, and claiming rewards uses the same
 * existing path. If the admin re-assigns a revoked user, the prior
 * progress resumes from where it left off (subject to the usual period
 * reset semantics).
 */
export const taskUserAssignments = pgTable(
  "task_user_assignments",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    /** NULL = never expires. Otherwise the assignment auto-deactivates past this instant. */
    expiresAt: timestamp("expires_at"),
    /** NULL = active. Set to revoke without deleting the row. */
    revokedAt: timestamp("revoked_at"),
    /** One of TASK_ASSIGNMENT_SOURCES — who/what caused the assignment. */
    source: text("source").notNull(),
    /** Free-form caller-defined pointer (request id, rule alias, admin user id, …). */
    sourceRef: text("source_ref"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.taskId, table.endUserId],
      name: "task_user_assignments_pk",
    }),
    // Hot path for getTasksForUser: batch-fetch active assignments
    // for a (org, endUser) pair against a set of assigned-visibility
    // task ids.
    index("task_user_assignments_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    // Admin "who has this task been assigned to" list
    index("task_user_assignments_task_idx").on(table.taskId),
    // Future GC / expiry sweeper hint — active rows with an expiry.
    index("task_user_assignments_expires_idx")
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} IS NOT NULL AND ${table.revokedAt} IS NULL`),
  ],
);
