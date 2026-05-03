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

/**
 * Experiment (A/B test) module — per-tenant flag/variant assignment with
 * Tinybird-backed exposure analytics.
 *
 * Design notes:
 *
 * - Flow: tenant admin defines an experiment + variants (with traffic
 *   allocation summing to 100), starts it, then game clients call
 *   `POST /api/client/experiment/evaluate` per session. The service layer
 *   does deterministic SHA-256 hash bucketing on (experimentId, endUserId),
 *   persists the assignment to `experiment_assignments` via a single
 *   atomic upsert, and emits `experiment.exposure` exactly once per
 *   `(experiment, endUser)` pair (gated on `(xmax = 0)` from the upsert).
 *
 * - Two product flavors share one table: pure traffic-split (variant_key
 *   only) and remote-config-style (variant_key + JSON config). The
 *   `experiment_variants.config_json` column is nullable — clients can
 *   ignore it for a pure split, or read it for per-variant config.
 *
 * - Status machine: draft → running ↔ paused → archived. Running pins
 *   `traffic_allocation` (the service rejects edits), paused/archived
 *   short-circuit `evaluate` to "look up existing assignment, otherwise
 *   return control without writing".
 *
 * - Exposure event ingest: NO new Tinybird datasource. The standard
 *   `events` row is emitted with `event = "experiment.exposure"` and
 *   `event_data = { experiment_id, experiment_key, variant_id, variant_key }`.
 *   Admin's self-serve analytics already supports JSON path filter +
 *   groupBy, so the variant comparison funnel is just a saved query
 *   shape — no schema change.
 *
 * - Multi-tenant isolation is the standard `organization_id` cascade
 *   columns on every row, the same convention every other module uses.
 *
 * 3 tables:
 *   experiment_experiments       — one experiment per row (key, status, traffic_allocation)
 *   experiment_variants          — per-variant metadata + optional remote config
 *   experiment_assignments       — sticky (experiment, endUser) → variant
 */

// ─── Domain enums (also re-exported from types.ts as TS unions) ──

export const EXPERIMENT_STATUSES = [
  "draft",
  "running",
  "paused",
  "archived",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/**
 * Wire shape for the traffic split. Sum of `percent` MUST equal 100;
 * the service layer enforces this on every write. Each `variant_key`
 * MUST match an `experiment_variants.variant_key` row of the same
 * experiment — also enforced in service.
 *
 * Stored on the experiment row (not the variants table) so the entire
 * split can be edited as one atomic write — no per-row update + sum
 * race.
 */
export type ExperimentTrafficAllocation = Array<{
  variant_key: string;
  percent: number;
}>;

/**
 * Targeting rule — a JSONLogic tree evaluated against `(serverAttrs,
 * sdkAttrs)` on every `evaluate` call. `null` / empty `{}` mean "match
 * all users".
 *
 * Built and consumed via the shared `evaluateCondition()` from
 * `modules/triggers/condition.ts` (same engine the trigger module
 * uses — keeps tenants on one expression dialect across the platform).
 *
 * Evaluation semantics: a non-matching user is OMITTED from the
 * `evaluate` response — no assignment row is written, no exposure
 * event fires. This keeps "experiments don't apply to me" cleanly
 * separable from "experiments assigned me to control" in downstream
 * analytics.
 */
export type ExperimentTargetingRules = unknown; // any valid JSONLogic tree

/**
 * Primary metric for an experiment's decision panel.
 *
 * Optional — set on a per-experiment basis once the team agrees on
 * the success criterion. The decision panel can also temporarily
 * switch to ad-hoc metrics for exploration, but `primary_metric` is
 * the canonical one shown by default.
 *
 * `denominator` choice:
 *   - "exposed_users" — converted_unique_users / exposed_unique_users
 *     (canonical conversion rate; Bernoulli; what z-test math expects)
 *   - "events"        — total_event_count / exposed_unique_users
 *     (per-user-event-count; for "average actions per user" indicators)
 *
 * `filter` is a sub-JSONLogic expression evaluated against the
 * conversion event's `event_data`. `null` → match every event of
 * the chosen `event` name.
 */
export type ExperimentPrimaryMetric = {
  /** Event name (e.g. "tutorial_completed"). */
  event: string;
  /** Optional sub-filter (JSONLogic tree). */
  filter?: unknown | null;
  /** Denominator semantics. */
  denominator: "exposed_users" | "events";
};

// ─── Tables ──────────────────────────────────────────────────────

/**
 * Top-level experiment row.
 *
 * `key` is the developer-facing stable identifier — clients call
 * `evaluate({ experiment_keys: ["onboarding_flow", ...] })` with these.
 * Per-org unique. `^[a-z][a-z0-9_]*$` is enforced in validators.
 *
 * `control_variant_key` is the fallback shown when:
 *   - the user is not in `experiment_assignments` AND
 *   - the experiment is paused / archived (no new assignments written).
 * Always required so the response shape is total, even for a never-seen
 * user on a non-running experiment.
 *
 * `traffic_allocation` is locked once `status = 'running'`. To change
 * the split: pause → edit → re-start. Already-assigned users keep their
 * existing variant regardless.
 *
 * `targeting_rules` is reserved for v2 (per-segment rollout). Empty
 * object means "all users".
 */
export const experiments = pgTable(
  "experiment_experiments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("draft").notNull(),
    trafficAllocation: jsonb("traffic_allocation")
      .$type<ExperimentTrafficAllocation>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    controlVariantKey: text("control_variant_key").notNull(),
    targetingRules: jsonb("targeting_rules")
      .$type<ExperimentTargetingRules>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Optional v1.5 column. When set, the decision panel uses this as
     * the default metric to compute conversion rate / lift / p-value
     * against. NULL means "no canonical metric configured yet".
     */
    primaryMetric: jsonb("primary_metric").$type<ExperimentPrimaryMetric>(),
    /**
     * v1.5: only events emitted within this many days AFTER first
     * exposure count toward the conversion. Bounds the analytical
     * cost (else every old event scans full table) and aligns with
     * the standard "what's the X-day conversion lift" framing.
     * Default 7 days.
     */
    metricWindowDays: integer("metric_window_days").default(7).notNull(),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("experiment_experiments_org_key_uidx").on(
      table.tenantId,
      table.key,
    ),
    index("experiment_experiments_tenant_status_started_idx").on(
      table.tenantId,
      table.status,
      table.startedAt,
    ),
  ],
);

/**
 * Variant of an experiment.
 *
 * `variant_key` is unique within a single experiment. `config_json` is
 * the optional remote-config payload — clients receive it via evaluate
 * when `inserted` and can switch on it for per-variant config (reward
 * multipliers, copy, prices). Leave null for pure traffic-split usage.
 *
 * `is_control` is a UI hint; the canonical "fallback" variant is
 * `experiments.control_variant_key`. The two should agree (validator
 * enforces this on create / update).
 *
 * `sort_order` uses fractional indexing so the admin can reorder
 * without touching every row — same pattern as every other module's
 * sortable resource.
 */
export const experimentVariants = pgTable(
  "experiment_variants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    variantKey: text("variant_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isControl: boolean("is_control").default(false).notNull(),
    configJson: jsonb("config_json").$type<unknown>(),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("experiment_variants_experiment_key_uidx").on(
      table.experimentId,
      table.variantKey,
    ),
    index("experiment_variants_tenant_idx").on(table.tenantId),
    index("experiment_variants_experiment_sort_idx").on(
      table.experimentId,
      table.sortOrder,
    ),
  ],
);

/**
 * Sticky assignment of an end user to a variant.
 *
 * Composite primary key `(experiment_id, end_user_id)` IS the bucketing
 * uniqueness guarantee AND the ON CONFLICT target for the atomic upsert
 * in `service.evaluate`. Once a row exists, the user's variant is
 * permanently fixed for that experiment — even if the traffic split
 * changes later. This is the entire reason we persist assignments
 * instead of recomputing the hash on every call: stable bucketing
 * across traffic-config edits.
 *
 * `variant_id` is `ON DELETE RESTRICT`: deleting a variant that has
 * any assignments fails. The service maps this to `VariantInUseError`
 * with a friendly admin message ("archive the experiment instead").
 *
 * `variant_key` is denormalized so `evaluate` doesn't need a join in
 * the hot path. Service code refreshes it on the (rare) variant
 * rename path.
 *
 * `end_user_id` is `text not null` — NOT a foreign key, per the
 * `endUserId` convention in apps/server/CLAUDE.md.
 */
export const experimentAssignments = pgTable(
  "experiment_assignments",
  {
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => experimentVariants.id, { onDelete: "restrict" }),
    variantKey: text("variant_key").notNull(),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.experimentId, table.endUserId],
      name: "experiment_assignments_pk",
    }),
    index("experiment_assignments_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
    index("experiment_assignments_variant_idx").on(table.variantId),
  ],
);

// ─── Inferred types ──────────────────────────────────────────────

export type Experiment = typeof experiments.$inferSelect;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type ExperimentAssignment = typeof experimentAssignments.$inferSelect;
