/**
 * Badge (red-dot) system — schema.
 *
 * A self-contained, domain-agnostic notification-badge subsystem. The
 * red-dot module never imports nor references any other business module's
 * schema (mail/task/battle-pass/...). SaaS customers push "signals" in via
 * SDK/HTTP under their own naming (e.g. `quest.daily.abc123`,
 * `combat.stamina.full`), and the module turns those counts + a
 * customer-configurable node tree into a UI red-dot tree.
 *
 * ---------------------------------------------------------------------
 * Four tables
 * ---------------------------------------------------------------------
 *
 *  badge_nodes           UI tree (static template, organization-scoped).
 *                        parentKey self-references form the tree; each
 *                        leaf points at a signalKey (exact) or a
 *                        signalKeyPrefix (dynamic aggregate).
 *
 *  badge_signals         Per-(endUser, signalKey) counter. Customer's
 *                        game server UPSERTs into this table. Acts as
 *                        the authoritative data source — no other module
 *                        table is queried when serving /tree.
 *
 *  badge_dismissals      Per-(endUser, nodeKey) dismissal record for
 *                        manual/version/daily/session/cooldown modes.
 *                        Lazy-written: row exists only after first
 *                        dismiss.
 *
 *  badge_signal_registry Optional customer-facing catalog of signalKey
 *                        patterns (for dropdowns in the Admin UI).
 *                        Schemaless — a signal can be pushed without
 *                        ever being registered; registry is just
 *                        metadata convenience.
 *
 * ---------------------------------------------------------------------
 * Cache version (no extra table)
 * ---------------------------------------------------------------------
 *
 * Per-user cacheVersion is derived from `MAX(updatedAt)` over that
 * user's signals + dismissals. Redis cache keys embed it, so new
 * writes naturally invalidate older keys without needing prefix-delete.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { fractionalSortKey } from "./_fractional-sort";

import { team } from "./auth";

// ─── DisplayType / aggregation / dismissMode enums ────────────────
//
// Enums are encoded as `text` columns; Zod enums at the validator
// layer enforce the allowed values. This matches the mail module's
// handling of `target_type` (plain text, enum at validator).

export const BADGE_DISPLAY_TYPES = [
  "dot",
  "number",
  "new",
  "hot",
  "exclamation",
  "gift",
] as const;
export type BadgeDisplayType = (typeof BADGE_DISPLAY_TYPES)[number];

export const BADGE_AGGREGATIONS = ["sum", "any", "max", "none"] as const;
export type BadgeAggregation = (typeof BADGE_AGGREGATIONS)[number];

export const BADGE_SIGNAL_MATCH_MODES = ["exact", "prefix", "none"] as const;
export type BadgeSignalMatchMode = (typeof BADGE_SIGNAL_MATCH_MODES)[number];

export const BADGE_DISMISS_MODES = [
  "auto",
  "manual",
  "version",
  "daily",
  "session",
  "cooldown",
] as const;
export type BadgeDismissMode = (typeof BADGE_DISMISS_MODES)[number];

// ─── badge_nodes ──────────────────────────────────────────────────

/**
 * Badge nodes — the UI node tree (organization-level template).
 *
 * One tree per org. `parentKey` is a string self-reference (NOT a FK)
 * to allow dangling references during partial imports/migrations and
 * to avoid CASCADE surprises when operations rename a subtree. The
 * service layer is responsible for DFS cycle detection and subtree
 * soft-deletes on parent deletion.
 *
 * `signalMatchMode` controls how the node binds to signal data:
 *   - `exact`:  `signalKey` is required, matches one signalKey precisely.
 *   - `prefix`: `signalKeyPrefix` is required; aggregates all signals
 *               whose key starts with the prefix (dynamic listings like
 *               `mail.inbox.{msgId}` or `activity.{activityId}`).
 *   - `none`:   pure aggregation node — its count is derived solely
 *               from its children via `aggregation`.
 *
 * `dismissConfig` jsonb is mode-dependent:
 *   - `{ cooldownSec: number }`   for `cooldown`
 *   - `{ periodType: 'daily'|'weekly', timezone?: string }` for `daily`
 *   - `null`                      for `auto`/`manual`/`version`/`session`
 *
 * `visibilityRule` jsonb is optional gate:
 *   - `{ minLevel?: number, roles?: string[], tags?: string[] }`
 *   Interpretation is up to the tenant — the service passes a
 *   `playerContext` through when querying /tree and the rule is matched
 *   against it. MVP: if `visibilityRule` is set and no `playerContext`
 *   is supplied, the node is hidden (fail-closed).
 */
export const badgeNodes = pgTable(
  "badge_nodes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    // Globally-unique UI key in dot notation, e.g. "home.mail.inbox".
    key: text("key").notNull(),
    parentKey: text("parent_key"),
    displayType: text("display_type").notNull(),
    displayLabelKey: text("display_label_key"),

    // Signal binding
    signalMatchMode: text("signal_match_mode").notNull(),
    signalKey: text("signal_key"),
    signalKeyPrefix: text("signal_key_prefix"),

    aggregation: text("aggregation").notNull().default("none"),
    dismissMode: text("dismiss_mode").notNull().default("auto"),
    dismissConfig: jsonb("dismiss_config").$type<Record<string, unknown>>(),
    visibilityRule: jsonb("visibility_rule").$type<Record<string, unknown>>(),

    sortOrder: fractionalSortKey("sort_order").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    // Live nodes only — unique on (org, key) among non-deleted rows.
    uniqueIndex("badge_nodes_org_key_uidx")
      .on(table.tenantId, table.key)
      .where(sql`${table.deletedAt} IS NULL`),
    // Tree walk: list children of a parent under an org.
    index("badge_nodes_tenant_parent_idx").on(
      table.tenantId,
      table.parentKey,
    ),
    // Prefix lookup: when a signal with key X arrives we may want to
    // invalidate/inspect all nodes whose signalKeyPrefix X starts with.
    index("badge_nodes_tenant_prefix_idx").on(
      table.tenantId,
      table.signalKeyPrefix,
    ),
  ],
);

// ─── badge_signals ────────────────────────────────────────────────

/**
 * Badge signals — authoritative per-(endUser × signalKey) counter.
 *
 * Written by `BadgeClient.signal()` (via Admin API / SDK). Supports
 * three UPSERT modes handled in the service layer:
 *   - set:   count = excluded.count
 *   - add:   count = badge_signals.count + excluded.count (can be negative)
 *   - clear: count = 0 (keeps meta + firstAppearedAt for debugging)
 *
 * `signalKey` is customer-defined opaque string. Dynamic keys like
 * `mail.inbox.abc123` are first-class — prefix-matched by nodes with
 * `signalMatchMode = 'prefix'`.
 *
 * `endUserId` is the SaaS customer's business user id — opaque text,
 * NOT a foreign key. See apps/server/CLAUDE.md § "The two userIds".
 *
 * `version` enables version-gated dismissal: when the client
 * dismisses, we record `dismissedVersion`; a later signal with a
 * different version relights the badge.
 *
 * `firstAppearedAt` stamps the latest 0 → >0 transition — useful for
 * the client to decide whether to play a "NEW" pop-in animation.
 */
export const badgeSignals = pgTable(
  "badge_signals",
  {
    tenantId: text("tenant_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    signalKey: text("signal_key").notNull(),
    count: integer("count").default(0).notNull(),
    version: text("version"),
    firstAppearedAt: timestamp("first_appeared_at"),
    expiresAt: timestamp("expires_at"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    tooltipKey: text("tooltip_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.endUserId, table.signalKey],
      name: "badge_signals_pk",
    }),
    // Per-user signal scan. B-tree PK already supports prefix scanning on
    // `signalKey LIKE 'prefix%'` filtered by (orgId, endUserId).
    index("badge_signals_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
    // Cleanup job: find count=0 rows older than N days.
    index("badge_signals_cleanup_idx").on(
      table.tenantId,
      table.count,
      table.updatedAt,
    ),
  ],
);

// ─── badge_dismissals ─────────────────────────────────────────────

/**
 * Badge dismissals — lazy record of "player tapped the red dot".
 *
 * Only written for dismissMode in (manual, version, daily, session,
 * cooldown). `auto` mode never creates a row. Absent row == not yet
 * dismissed.
 *
 * UPSERT pattern (see `badge/service.ts → dismiss`):
 *
 *   INSERT INTO badge_dismissals (...)
 *   VALUES (...)
 *   ON CONFLICT (organization_id, end_user_id, node_key)
 *   DO UPDATE SET dismissed_at = EXCLUDED.dismissed_at,
 *                 dismissed_version = EXCLUDED.dismissed_version,
 *                 period_key = EXCLUDED.period_key,
 *                 session_id = EXCLUDED.session_id;
 */
export const badgeDismissals = pgTable(
  "badge_dismissals",
  {
    tenantId: text("tenant_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    nodeKey: text("node_key").notNull(),
    dismissedVersion: text("dismissed_version"),
    dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
    // For daily/weekly: stores the period key when dismissed ("2026-04-23",
    // "2026-W17"). A later read that computes a different current period
    // treats the dismissal as stale.
    periodKey: text("period_key"),
    // For session mode: stores the player's session identifier at dismiss
    // time. `POST /reset-session` deletes dismissals with any session_id.
    sessionId: text("session_id"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.endUserId, table.nodeKey],
      name: "badge_dismissals_pk",
    }),
    // Per-user scan when serving /tree.
    index("badge_dismissals_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
  ],
);

// ─── badge_signal_registry ────────────────────────────────────────

/**
 * Badge signal registry — OPTIONAL customer-facing catalog.
 *
 * Purely informational. Customers register their signalKey patterns
 * here so the Admin UI can show human-readable labels and dropdown
 * suggestions when configuring nodes or debugging in the Inspector.
 * The runtime never consults this table for counts — a signal pushed
 * with an unregistered key works exactly the same as a registered one.
 *
 * `keyPattern` can be a literal key ("mail.rewards.total") or a
 * `*`-suffixed pattern ("mail.inbox.*") for dynamic keys.
 */
export const badgeSignalRegistry = pgTable(
  "badge_signal_registry",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    keyPattern: text("key_pattern").notNull(),
    isDynamic: boolean("is_dynamic").default(false).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    exampleMeta: jsonb("example_meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.keyPattern],
      name: "badge_signal_registry_pk",
    }),
  ],
);

export type BadgeNode = typeof badgeNodes.$inferSelect;
export type BadgeSignal = typeof badgeSignals.$inferSelect;
export type BadgeDismissal = typeof badgeDismissals.$inferSelect;
export type BadgeSignalRegistryEntry =
  typeof badgeSignalRegistry.$inferSelect;
