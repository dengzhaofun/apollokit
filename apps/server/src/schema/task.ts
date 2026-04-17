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
    targetValue: integer("target_value").notNull(),
    parentProgressValue: integer("parent_progress_value").default(1).notNull(),
    prerequisiteTaskIds: jsonb("prerequisite_task_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    autoClaim: boolean("auto_claim").default(false).notNull(),
    navigation: jsonb("navigation").$type<TaskNavigation | null>(),
    isActive: boolean("is_active").default(true).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
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
