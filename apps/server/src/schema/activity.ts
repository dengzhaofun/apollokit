import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Activity currency definition (embedded in activity_configs.currency).
 * Activity points are kept as a single counter in
 * activity_members.activity_points — this jsonb just describes how
 * to render it.
 */
export type ActivityCurrency = {
  alias: string;
  name: string;
  icon?: string | null;
};

/**
 * Per-activity membership & optional queue-number config, embedded in
 * activity_configs.membership.
 *
 * `null` means "default policy": leave allowed, no queue number.
 * `queue.enabled=true` triggers random queue-number allocation on
 * `join`. The number is unique within the activity (partial unique
 * index on activity_members(activity_id, queue_number)) and one-shot —
 * `redeemQueueNumber` marks it used; no "un-redeem" path.
 *
 * Why no top-level `enabled` switch? Every join creates a row in
 * activity_members already; membership is not optional. The optional
 * bits are *leaving* and *queueing*.
 */
export type ActivityQueueFormat = "numeric" | "alphanumeric";

export type ActivityMembershipConfig = {
  leaveAllowed?: boolean;
  queue?: {
    enabled: boolean;
    format: ActivityQueueFormat;
    length: number;
  };
};

/**
 * A milestone triggered by total accumulated activity points.
 * `alias` is unique within the activity so `activity_user_rewards` can
 * key on `reward_key = "milestone:<alias>"`.
 */
export type ActivityMilestoneTier = {
  alias: string;
  points: number;
  rewards: RewardEntry[];
};

/**
 * Gate on a node being interactable. Combined with AND semantics.
 * Left `jsonb` to keep the shape evolvable — validators enforce known
 * keys.
 */
export type ActivityNodeUnlockRule = {
  requirePrevNodeAliases?: string[];
  minActivityPoints?: number;
  notBefore?: string; // ISO timestamp — absolute
  relativeToStartSeconds?: number; // secs after start_at
};

/**
 * Cleanup policy applied when an activity transitions to `archived`.
 *
 *   - `purge`   → delete all entity_instances.activity_id = self,
 *                 purge Redis keys, disable schedules.
 *   - `convert` → mail each participant a conversion payout and then
 *                 purge. conversionMap is `{ fromEntityId: rewards[] }`.
 *   - `keep`    → leave data as-is; items stay in inventory as
 *                 non-interactive souvenirs.
 */
export type ActivityCleanupRule = {
  mode: "purge" | "convert" | "keep";
  conversionMap?: Record<string, RewardEntry[]>;
};

/**
 * Activity — the top-level container.
 *
 * Five time points drive the state machine (see
 * `modules/activity/service.ts → deriveState`):
 *   visible_at ≤ start_at < end_at ≤ reward_end_at ≤ hidden_at
 *
 * The `status` column is the cron-persisted snapshot of the derived
 * state. Reads can recompute `deriveState(config, now)` for sub-minute
 * accuracy; cron updates `status` at the minute boundary for indexing
 * and for firing one-shot transitions (archived → purge).
 */
export const activityConfigs = pgTable(
  "activity_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    bannerImage: text("banner_image"),
    themeColor: text("theme_color"),
    kind: text("kind").notNull().default("generic"), // "generic"|"check_in_only"|"board_game"|"gacha"|"season_pass"|...
    visibleAt: timestamp("visible_at").notNull(),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    rewardEndAt: timestamp("reward_end_at").notNull(),
    hiddenAt: timestamp("hidden_at").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: text("status").notNull().default("draft"), // "draft"|"scheduled"|"teasing"|"active"|"settling"|"ended"|"archived"
    currency: jsonb("currency").$type<ActivityCurrency | null>(),
    milestoneTiers: jsonb("milestone_tiers")
      .$type<ActivityMilestoneTier[]>()
      .default([])
      .notNull(),
    globalRewards: jsonb("global_rewards")
      .$type<RewardEntry[]>()
      .default([])
      .notNull(),
    kindMetadata: jsonb("kind_metadata"),
    cleanupRule: jsonb("cleanup_rule")
      .$type<ActivityCleanupRule>()
      .default({ mode: "purge" })
      .notNull(),
    joinRequirement: jsonb("join_requirement"),
    membership: jsonb("membership")
      .$type<ActivityMembershipConfig | null>()
      .default(null),
    visibility: text("visibility").notNull().default("public"), // "public"|"hidden"|"targeted"
    templateId: uuid("template_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_configs_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("activity_configs_org_status_start_idx").on(
      table.organizationId,
      table.status,
      table.startAt,
    ),
    index("activity_configs_status_lifecycle_idx").on(
      table.status,
      table.visibleAt,
      table.startAt,
      table.endAt,
      table.rewardEndAt,
      table.hiddenAt,
    ),
  ],
);

/**
 * Activity node — a block/component within an activity.
 *
 * `nodeType` picks a handler (and a frontend renderer). For nodeTypes
 * that reference an external config (check_in/task_group/exchange/
 * leaderboard) the foreign id goes in `refId`. For embedded kinds
 * (game_board/custom) the config lives in `nodeConfig`.
 */
export const activityNodes = pgTable(
  "activity_nodes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    alias: text("alias").notNull(),
    nodeType: text("node_type").notNull(),
    refId: uuid("ref_id"),
    orderIndex: integer("order_index").default(0).notNull(),
    unlockRule: jsonb("unlock_rule")
      .$type<ActivityNodeUnlockRule | null>()
      .default(null),
    nodeConfig: jsonb("node_config"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_nodes_activity_alias_uidx").on(
      table.activityId,
      table.alias,
    ),
    index("activity_nodes_activity_order_idx").on(
      table.activityId,
      table.orderIndex,
    ),
  ],
);

/**
 * Activity member — one row per endUserId per activity.
 *
 * This table carries both the member identity (endUserId, joinedAt,
 * status, leftAt, optional queueNumber) AND the member's runtime state
 * in the activity (activityPoints balance, milestonesAchieved list,
 * nodeState bag). Combining them keeps all per-player data in one
 * row — "member" is the primary concept; progress/points are
 * properties of a member.
 *
 * `activityPoints` is the single counter for the activity's native
 * currency. `milestonesAchieved` is a stringlist of claimed milestone
 * aliases for O(1) "already claimed?" checks. `nodeState` stores per-
 * node runtime data (e.g. board_game position, gacha pity counters).
 *
 * `queueNumber` is the optional offline queue ticket (enabled when
 * activityConfigs.membership.queue.enabled). One-shot: once
 * `queueNumberUsedAt` is set, the ticket is considered redeemed and
 * cannot be reused. Activity-scoped unique via partial index.
 *
 * `status`:
 *   - "joined"    — active member
 *   - "completed" — finished whatever the activity considers completion
 *   - "dropped"   — system-judged (e.g. inactivity, cleanup)
 *   - "left"      — user actively called leave
 *
 * `version` enables optimistic-concurrency writes on `nodeState` —
 * neon-http has no transactions, so writers use `UPDATE ... WHERE
 * version = ?` and retry on miss.
 */
export const activityMembers = pgTable(
  "activity_members",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
    activityPoints: bigint("activity_points", { mode: "number" })
      .default(0)
      .notNull(),
    milestonesAchieved: jsonb("milestones_achieved")
      .$type<string[]>()
      .default([])
      .notNull(),
    nodeState: jsonb("node_state")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    status: text("status").notNull().default("joined"), // "joined"|"completed"|"dropped"|"left"
    completedAt: timestamp("completed_at"),
    leftAt: timestamp("left_at"),
    queueNumber: text("queue_number"),
    queueNumberUsedAt: timestamp("queue_number_used_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_members_uidx").on(
      table.activityId,
      table.endUserId,
    ),
    index("activity_members_activity_status_idx").on(
      table.activityId,
      table.status,
    ),
    index("activity_members_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    // Activity-scoped unique queue number. Partial index avoids
    // collisions on NULL (most members have no number).
    uniqueIndex("activity_members_queue_number_uidx")
      .on(table.activityId, table.queueNumber)
      .where(sql`queue_number IS NOT NULL`),
  ],
);

/**
 * Idempotency ledger for activity reward payouts.
 *
 * `rewardKey` is a stable identifier for "what was given":
 *   - "milestone:<alias>"    — a milestone tier payout
 *   - "node:<nodeAlias>:*"   — per-node specific grants (claim-once)
 *   - "global_complete"       — the activity_configs.global_rewards payout
 *
 * The unique (activity_id, end_user_id, reward_key) prevents double
 * payment across retries, cron reruns, or concurrent requests.
 */
export const activityUserRewards = pgTable(
  "activity_user_rewards",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    rewardKey: text("reward_key").notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("activity_user_rewards_uidx").on(
      table.activityId,
      table.endUserId,
      table.rewardKey,
    ),
    index("activity_user_rewards_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Activity point ledger — one row per `addPoints` call, including
 * negative deltas (spend / correction). Admin queries can rebuild the
 * exact history; the client UI can show "you earned 20 from day-3
 * check-in" breakdowns.
 */
export const activityPointLogs = pgTable(
  "activity_point_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    delta: bigint("delta", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_point_logs_activity_user_idx").on(
      table.activityId,
      table.endUserId,
      table.createdAt,
    ),
  ],
);

/**
 * Custom time triggers attached to an activity.
 *
 * Three `triggerKind`s:
 *   - `once_at`         — fire exactly once at `fireAt`
 *   - `relative_offset` — fire at activity.start_at + offsetSeconds
 *                         (or .end_at / .visible_at per `offsetFrom`)
 *   - `cron`            — (phase 3) repeatable via cron_expr
 *
 * Four `actionType`s (MVP supports the first three):
 *   - `emit_bus_event`  — emit a local runtime event (in-worker)
 *   - `grant_reward`    — grant RewardEntry[] to all participants
 *   - `broadcast_mail`  — multicast a mail message to all participants
 *   - `set_flag`        — (phase 3) flip a flag in kind_metadata
 *
 * External webhook delivery has moved out of activity into a dedicated
 * module; see `src/modules/webhooks/`.
 *
 * `nextFireAt` is the scheduler's pre-computed wake-up time. The cron
 * handler scans `enabled AND nextFireAt <= now` and fires everything
 * in the window, then:
 *   - `once_at` / `relative_offset` → set `enabled = false` (one-shot)
 *   - `cron`                        → recompute `nextFireAt`
 */
export const activitySchedules = pgTable(
  "activity_schedules",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activityConfigs.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    alias: text("alias").notNull(),
    triggerKind: text("trigger_kind").notNull(),
    cronExpr: text("cron_expr"),
    fireAt: timestamp("fire_at"),
    offsetFrom: text("offset_from"),
    offsetSeconds: integer("offset_seconds"),
    actionType: text("action_type").notNull(),
    actionConfig: jsonb("action_config")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    lastFiredAt: timestamp("last_fired_at"),
    lastStatus: text("last_status"),
    nextFireAt: timestamp("next_fire_at"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_schedules_activity_alias_uidx").on(
      table.activityId,
      table.alias,
    ),
    index("activity_schedules_due_idx")
      .on(table.enabled, table.nextFireAt)
      .where(sql`enabled = true`),
  ],
);

/**
 * Activity template — a recipe for spawning a new activity on a
 * schedule (weekly / monthly / manual).
 *
 * `templatePayload` holds every activity_configs field that should be
 * copied verbatim to each new instance (name, description, kind,
 * currency, milestoneTiers, globalRewards, cleanupRule, kindMetadata,
 * joinRequirement, visibility, themeColor, bannerImage).
 *
 * `durationSpec` is relative seconds from the generated start_at:
 *   visibleAt  = startAt - teaseSeconds
 *   endAt      = startAt + activeSeconds
 *   rewardEndAt= endAt + rewardSeconds
 *   hiddenAt   = rewardEndAt + hiddenSeconds
 *
 * `recurrence` drives when the next start_at falls:
 *   - mode: "weekly"  → dayOfWeek + hourOfDay + timezone
 *   - mode: "monthly" → dayOfMonth + hourOfDay + timezone
 *   - mode: "manual"  → only instantiated via admin button
 *
 * `aliasPattern` formats the new activity's alias (must be unique per
 * org). Tokens: `{year}`, `{month}`, `{day}`, `{week}`, `{ts}`.
 */
export type ActivityTemplateDurationSpec = {
  teaseSeconds: number;
  activeSeconds: number;
  rewardSeconds: number;
  hiddenSeconds: number;
};

export type ActivityTemplateRecurrence =
  | {
      mode: "weekly";
      dayOfWeek: number; // 0=Sun..6=Sat
      hourOfDay: number; // 0..23
      timezone: string;
    }
  | {
      mode: "monthly";
      dayOfMonth: number; // 1..31 (clamped)
      hourOfDay: number;
      timezone: string;
    }
  | { mode: "manual" };

/**
 * Blueprint entry for a node. Copied verbatim at instantiation time;
 * `refIdStrategy` controls what happens with the underlying resource:
 *   - "fixed"      → reuse the same refId every instance (shared config)
 *   - "omit"       → no refId (virtual node — game_board / custom)
 *   - "link_only"  → skip auto-mount; admin will attach refId manually
 *
 * For "per_instance_create" (每期新建底层资源) we need a creation
 * payload for the target module — that's intentionally out of MVP
 * scope because each module's Create input is different. "fixed" +
 * "omit" cover the common周赛 pattern: shared signin/tasks reused
 * across weeks, virtual game board per activity.
 */
export type ActivityNodeBlueprint = {
  alias: string;
  nodeType: string;
  refIdStrategy: "fixed" | "omit" | "link_only";
  fixedRefId?: string | null;
  orderIndex?: number;
  unlockRule?: Record<string, unknown> | null;
  nodeConfig?: Record<string, unknown> | null;
  enabled?: boolean;
};

export type ActivityScheduleBlueprint = {
  alias: string;
  triggerKind: "once_at" | "relative_offset" | "cron";
  fireAtOffsetSeconds?: number; // relative to generated startAt for once_at
  offsetFrom?: string;
  offsetSeconds?: number;
  cronExpr?: string;
  actionType: string;
  actionConfig?: Record<string, unknown>;
  enabled?: boolean;
};

export const activityTemplates = pgTable(
  "activity_templates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    templatePayload: jsonb("template_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    durationSpec: jsonb("duration_spec")
      .$type<ActivityTemplateDurationSpec>()
      .notNull(),
    recurrence: jsonb("recurrence")
      .$type<ActivityTemplateRecurrence>()
      .notNull(),
    aliasPattern: text("alias_pattern").notNull(),
    nodesBlueprint: jsonb("nodes_blueprint")
      .$type<ActivityNodeBlueprint[]>()
      .default([])
      .notNull(),
    schedulesBlueprint: jsonb("schedules_blueprint")
      .$type<ActivityScheduleBlueprint[]>()
      .default([])
      .notNull(),
    autoPublish: boolean("auto_publish").default(false).notNull(),
    nextInstanceAt: timestamp("next_instance_at"),
    lastInstantiatedAlias: text("last_instantiated_alias"),
    lastInstantiatedAt: timestamp("last_instantiated_at"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("activity_templates_org_alias_uidx").on(
      table.organizationId,
      table.alias,
    ),
    index("activity_templates_due_idx")
      .on(table.enabled, table.nextInstanceAt)
      .where(sql`enabled = true`),
  ],
);

/**
 * Placeholder for future doubles / test use — silences tsc when we
 * import types below from other files.
 */
export type ActivityConfig = typeof activityConfigs.$inferSelect;
export type ActivityTemplate = typeof activityTemplates.$inferSelect;
export type ActivityNode = typeof activityNodes.$inferSelect;
export type ActivityMemberRow = typeof activityMembers.$inferSelect;
export type ActivityUserReward = typeof activityUserRewards.$inferSelect;
export type ActivityPointLog = typeof activityPointLogs.$inferSelect;
export type ActivitySchedule = typeof activitySchedules.$inferSelect;

