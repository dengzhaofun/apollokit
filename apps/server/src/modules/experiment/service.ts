/**
 * Experiment service — protocol-agnostic A/B test logic.
 *
 * MUST NOT import Hono / @hono/zod-openapi / db / deps directly. Only
 * `AppDeps` type + `Pick<...>` factory parameter.
 *
 * ---------------------------------------------------------------------
 * Bucketing
 * ---------------------------------------------------------------------
 *
 * `evaluate(orgId, endUserId, [keys])` resolves each experiment key to
 * a variant in this priority order:
 *
 *   1. If an `experiment_assignments` row already exists for
 *      (experiment, endUser), return its `variant_id` — STICKY.
 *      Sticky regardless of experiment status, so paused / archived
 *      experiments preserve historic assignments.
 *   2. If no row AND status = "running":
 *        a. Compute `bucket = sha256(experimentId + ":" + endUserId)
 *           % 10000` (top 32 bits as unsigned int).
 *        b. Walk `traffic_allocation` accumulating `percent * 100`;
 *           the first slice whose accumulated total exceeds `bucket`
 *           wins.
 *        c. Atomic upsert:
 *             INSERT INTO experiment_assignments (...)
 *             VALUES (...)
 *             ON CONFLICT (experiment_id, end_user_id) DO UPDATE
 *               SET variant_id = experiment_assignments.variant_id  -- no-op
 *             RETURNING ..., (xmax = 0) AS inserted;
 *           The DO UPDATE runs even on conflict because Postgres needs
 *           a row to RETURN — the assignment is a no-op write of the
 *           same value. `(xmax = 0)` distinguishes first-write from
 *           conflict-no-op so we emit `experiment.exposure` exactly
 *           once per (experiment, endUser).
 *   3. If no row AND status = "paused" / "archived" / "draft":
 *      return the experiment's `controlVariantKey` WITHOUT writing —
 *      paused/archived experiments must not accept new assignments.
 *      Drafts are skipped from the response entirely.
 *
 * ---------------------------------------------------------------------
 * Allocation invariants (enforced on every write)
 * ---------------------------------------------------------------------
 *
 *   - Each `traffic_allocation[*].variant_key` must reference an
 *     existing variant on this experiment.
 *   - The sum of `percent` across all entries must equal exactly 100
 *     (or 0 — meaning "not yet configured", only valid in `draft`).
 *   - `controlVariantKey` must reference an existing variant.
 *
 * Once `status = "running"`, the following are LOCKED (service throws
 * `ExperimentLockedError`):
 *   - `trafficAllocation`
 *   - `controlVariantKey`
 *   - adding / deleting variants (rename is allowed)
 *
 * To change a locked field: pause → edit → re-start. Existing
 * assignments stay (sticky bucketing).
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { evaluateCondition } from "../triggers/condition";
import {
  appendKey,
  moveAndReturn,
  MoveSiblingNotFound,
} from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  buildPageBy,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  experiments,
  experimentAssignments,
  experimentVariants,
  type ExperimentTrafficAllocation,
} from "../../schema/experiment";
import {
  ExperimentInvalidInputError,
  ExperimentKeyConflictError,
  ExperimentLockedError,
  ExperimentNotFoundError,
  ExperimentNotRunningError,
  InvalidExperimentTransitionError,
  InvalidTrafficAllocationError,
  VariantInUseError,
  VariantKeyConflictError,
  VariantNotFoundError,
} from "./errors";
import type {
  BucketingDistribution,
  EvaluateResult,
  Experiment,
  ExperimentPrimaryMetric,
  ExperimentStatus,
  ExperimentVariant,
  TargetingAttributes,
} from "./types";
import { EXPERIMENT_STATUSES } from "./types";
import type {
  CreateExperimentInput,
  CreateVariantInput,
  PreviewBucketingInput,
  UpdateExperimentInput,
  UpdateVariantInput,
  VariantMoveInput,
} from "./validators";

type ExperimentDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with the experiment event.
declare module "../../lib/event-bus" {
  interface EventMap {
    /**
     * Fired exactly once per (experiment, endUser) on the FIRST
     * `evaluate` that produces an assignment row. Subsequent evaluates
     * for the same user re-read the existing row and DO NOT emit
     * (gated on `(xmax = 0)`). This keeps the Tinybird write rate at
     * ≈ "exposed unique users" rather than "evaluate calls".
     *
     * Subscriber: `event-bus → analytics writer → Tinybird events`
     * with `event = "experiment.exposure"` and the payload below
     * embedded in `event_data`.
     *
     * v1.5: `attributes` snapshot of the (server-merged) attributes
     * at the moment of first exposure. Lets the decision panel slice
     * conversion by attribute later (e.g. "lift among country=JP").
     */
    "experiment.exposure": {
      tenantId: string;
      endUserId: string;
      experimentId: string;
      experimentKey: string;
      variantId: string;
      variantKey: string;
      attributes: TargetingAttributes;
    };
  }
}

// ─── Allowed status transitions ──────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  draft: ["running", "archived"],
  running: ["paused", "archived"],
  paused: ["running", "archived"],
  archived: ["draft"], // restore — wipes started_at / ended_at
};

function assertTransition(from: ExperimentStatus, to: ExperimentStatus) {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidExperimentTransitionError(from, to);
  }
}

// ─── Bucketing (hash + slice) ────────────────────────────────────

/**
 * Stable bucket index in [0, 10000). Hash the (experiment, user) pair
 * with SHA-256 and take the first 4 bytes as an unsigned 32-bit int,
 * then mod 10000. Workers exposes `crypto.subtle.digest` natively, so
 * no extra deps.
 */
async function bucketIndex(
  experimentId: string,
  endUserId: string,
): Promise<number> {
  const buf = new TextEncoder().encode(`${experimentId}:${endUserId}`);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const view = new DataView(hash);
  return view.getUint32(0, false) % 10000;
}

/**
 * Pick the variant_key that owns `bucket` under the supplied
 * allocation. Walks slices in array order (stable). Falls back to
 * `controlVariantKey` on rounding gaps or empty allocation.
 */
function pickVariant(
  bucket: number,
  allocation: ExperimentTrafficAllocation,
  controlVariantKey: string,
): string {
  let acc = 0;
  for (const slice of allocation) {
    acc += Math.round(slice.percent * 100);
    if (bucket < acc) return slice.variant_key;
  }
  return controlVariantKey;
}

// ─── Allocation validation ───────────────────────────────────────

/**
 * Validate the traffic_allocation against the experiment's variants.
 *
 * Two-phase validation matching the UX:
 *
 * - **Always-checked invariants** (regardless of `requireFull`):
 *     - `controlVariantKey` references an existing variant
 *     - allocation entries reference existing variant_keys
 *     - no duplicate variant_keys in allocation
 *
 *   These are caught on every save so the admin gets immediate
 *   feedback for typos / orphan keys, even mid-edit on a draft.
 *
 * - **`requireFull` only** — running / paused / on-transition-to-running:
 *     - allocation must be non-empty
 *     - sum of percent must equal 100
 *
 *   Drafts can save partial allocations (e.g. 60% / 30% mid-edit)
 *   without rejection. The start-experiment preflight is the gate.
 */
function validateAllocation(
  allocation: ExperimentTrafficAllocation,
  variants: ExperimentVariant[],
  controlVariantKey: string,
  options: { requireFull: boolean },
) {
  const variantKeys = new Set(variants.map((v) => v.variantKey));

  if (variantKeys.size > 0 && !variantKeys.has(controlVariantKey)) {
    throw new InvalidTrafficAllocationError(
      `controlVariantKey "${controlVariantKey}" does not reference any variant`,
    );
  }

  // Empty allocation: tolerated unless we're entering / staying in a
  // state that mandates a fully-configured split.
  if (allocation.length === 0) {
    if (options.requireFull) {
      throw new InvalidTrafficAllocationError(
        "traffic_allocation must be non-empty before starting the experiment",
      );
    }
    return;
  }

  const seen = new Set<string>();
  let sum = 0;
  for (const slice of allocation) {
    if (seen.has(slice.variant_key)) {
      throw new InvalidTrafficAllocationError(
        `duplicate variant_key in allocation: ${slice.variant_key}`,
      );
    }
    seen.add(slice.variant_key);
    if (!variantKeys.has(slice.variant_key)) {
      throw new InvalidTrafficAllocationError(
        `allocation references unknown variant_key: ${slice.variant_key}`,
      );
    }
    sum += slice.percent;
  }
  // Sum-to-100 only when fully configured. Allows draft to be in a
  // mid-edit state (60% / 30% in two saves before the third 10%).
  // Allow tiny floating-point drift (allocation is human-input).
  if (options.requireFull && Math.abs(sum - 100) > 0.001) {
    throw new InvalidTrafficAllocationError(
      `traffic_allocation must sum to 100, got ${sum}`,
    );
  }
}

// ─── Service factory ─────────────────────────────────────────────

export function createExperimentService(d: ExperimentDeps) {
  const { db, events } = d;

  // ─── Internal helpers ──────────────────────────────────────────

  async function loadByKey(
    tenantId: string,
    keyOrId: string,
  ): Promise<Experiment> {
    const where = looksLikeId(keyOrId)
      ? and(
          eq(experiments.tenantId, tenantId),
          eq(experiments.id, keyOrId),
        )
      : and(
          eq(experiments.tenantId, tenantId),
          eq(experiments.key, keyOrId),
        );
    const rows = await db.select().from(experiments).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new ExperimentNotFoundError(keyOrId);
    return row;
  }

  async function loadVariants(
    experimentId: string,
  ): Promise<ExperimentVariant[]> {
    return db
      .select()
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, experimentId))
      .orderBy(asc(experimentVariants.sortOrder));
  }

  async function loadVariantById(
    tenantId: string,
    variantId: string,
  ): Promise<ExperimentVariant> {
    const rows = await db
      .select()
      .from(experimentVariants)
      .where(
        and(
          eq(experimentVariants.id, variantId),
          eq(experimentVariants.tenantId, tenantId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new VariantNotFoundError(variantId);
    return row;
  }

  async function countVariantsByExperiment(
    experimentIds: string[],
  ): Promise<Map<string, number>> {
    if (experimentIds.length === 0) return new Map();
    const rows = await db
      .select({
        experimentId: experimentVariants.experimentId,
        n: count(),
      })
      .from(experimentVariants)
      .where(inArray(experimentVariants.experimentId, experimentIds))
      .groupBy(experimentVariants.experimentId);
    return new Map(rows.map((r) => [r.experimentId, Number(r.n)]));
  }

  async function countAssignmentsByExperiment(
    experimentIds: string[],
  ): Promise<Map<string, number>> {
    if (experimentIds.length === 0) return new Map();
    const rows = await db
      .select({
        experimentId: experimentAssignments.experimentId,
        n: count(),
      })
      .from(experimentAssignments)
      .where(inArray(experimentAssignments.experimentId, experimentIds))
      .groupBy(experimentAssignments.experimentId);
    return new Map(rows.map((r) => [r.experimentId, Number(r.n)]));
  }

  async function countAssignmentsByVariant(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await db
      .select({
        variantId: experimentAssignments.variantId,
        n: count(),
      })
      .from(experimentAssignments)
      .where(inArray(experimentAssignments.variantId, variantIds))
      .groupBy(experimentAssignments.variantId);
    return new Map(rows.map((r) => [r.variantId, Number(r.n)]));
  }

  return {
    // ─── Experiment CRUD ──────────────────────────────────────

    async createExperiment(
      tenantId: string,
      input: CreateExperimentInput,
    ): Promise<Experiment> {
      try {
        const [row] = await db
          .insert(experiments)
          .values({
            tenantId,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            status: "draft",
            trafficAllocation: input.trafficAllocation ?? [],
            controlVariantKey: input.controlVariantKey ?? "control",
            targetingRules: input.targetingRules ?? {},
            primaryMetric: input.primaryMetric ?? null,
            metricWindowDays: input.metricWindowDays ?? 7,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ExperimentKeyConflictError(input.key);
        }
        throw err;
      }
    },

    async getExperiment(
      tenantId: string,
      keyOrId: string,
    ): Promise<Experiment & { variantsCount: number; assignedUsers: number }> {
      const row = await loadByKey(tenantId, keyOrId);
      const [vMap, aMap] = await Promise.all([
        countVariantsByExperiment([row.id]),
        countAssignmentsByExperiment([row.id]),
      ]);
      return {
        ...row,
        variantsCount: vMap.get(row.id) ?? 0,
        assignedUsers: aMap.get(row.id) ?? 0,
      };
    },

    async listExperiments(
      tenantId: string,
      filter: PageParams & { status?: ExperimentStatus } = {},
    ): Promise<
      Page<Experiment & { variantsCount: number; assignedUsers: number }>
    > {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(experiments.tenantId, tenantId)];
      if (filter.status) {
        conds.push(eq(experiments.status, filter.status));
      }
      const seek = cursorWhere(
        filter.cursor,
        experiments.createdAt,
        experiments.id,
      );
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(
          ilike(experiments.name, pat),
          ilike(experiments.key, pat),
        );
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(experiments)
        .where(and(...conds))
        .orderBy(desc(experiments.createdAt), desc(experiments.id))
        .limit(limit + 1);

      const ids = rows.map((r) => r.id);
      const [vMap, aMap] = await Promise.all([
        countVariantsByExperiment(ids),
        countAssignmentsByExperiment(ids),
      ]);
      const enriched = rows.map((r) => ({
        ...r,
        variantsCount: vMap.get(r.id) ?? 0,
        assignedUsers: aMap.get(r.id) ?? 0,
      }));
      return buildPage(enriched, limit);
    },

    async updateExperiment(
      tenantId: string,
      idOrKey: string,
      patch: UpdateExperimentInput,
    ): Promise<Experiment> {
      const existing = await loadByKey(tenantId, idOrKey);
      const status = existing.status as ExperimentStatus;

      // Locked-while-running fields.
      if (status === "running") {
        if (patch.trafficAllocation !== undefined) {
          throw new ExperimentLockedError("trafficAllocation");
        }
        if (
          patch.controlVariantKey !== undefined &&
          patch.controlVariantKey !== existing.controlVariantKey
        ) {
          throw new ExperimentLockedError("controlVariantKey");
        }
      }

      // If allocation or controlVariantKey is changing, re-validate against
      // the current variants set. (Variants don't change in this method —
      // they're a separate endpoint — so we look them up once.)
      if (
        patch.trafficAllocation !== undefined ||
        patch.controlVariantKey !== undefined
      ) {
        const variants = await loadVariants(existing.id);
        const newAllocation =
          patch.trafficAllocation ?? existing.trafficAllocation;
        const newControl =
          patch.controlVariantKey ?? existing.controlVariantKey;
        validateAllocation(newAllocation, variants, newControl, {
          requireFull: status === "running" || status === "paused",
        });
      }

      const updateValues: Partial<typeof experiments.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.controlVariantKey !== undefined)
        updateValues.controlVariantKey = patch.controlVariantKey;
      if (patch.trafficAllocation !== undefined)
        updateValues.trafficAllocation = patch.trafficAllocation;
      if (patch.targetingRules !== undefined)
        updateValues.targetingRules = patch.targetingRules;
      if (patch.primaryMetric !== undefined)
        updateValues.primaryMetric = patch.primaryMetric ?? null;
      if (patch.metricWindowDays !== undefined)
        updateValues.metricWindowDays = patch.metricWindowDays;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      const [row] = await db
        .update(experiments)
        .set(updateValues)
        .where(
          and(
            eq(experiments.id, existing.id),
            eq(experiments.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new ExperimentNotFoundError(idOrKey);
      return row;
    },

    async deleteExperiment(
      tenantId: string,
      idOrKey: string,
    ): Promise<void> {
      const existing = await loadByKey(tenantId, idOrKey);
      // Guard: only draft / archived experiments can be deleted. Running /
      // paused experiments must be archived first — admin UI should not
      // expose the button, but enforce server-side too.
      if (existing.status === "running" || existing.status === "paused") {
        throw new ExperimentLockedError("status");
      }
      const deleted = await db
        .delete(experiments)
        .where(
          and(
            eq(experiments.id, existing.id),
            eq(experiments.tenantId, tenantId),
          ),
        )
        .returning({ id: experiments.id });
      if (deleted.length === 0) throw new ExperimentNotFoundError(idOrKey);
    },

    async transitionStatus(
      tenantId: string,
      idOrKey: string,
      to: ExperimentStatus,
    ): Promise<Experiment> {
      if (!(EXPERIMENT_STATUSES as readonly string[]).includes(to)) {
        throw new ExperimentInvalidInputError(`invalid status: ${to}`);
      }
      const existing = await loadByKey(tenantId, idOrKey);
      const from = existing.status as ExperimentStatus;
      assertTransition(from, to);

      // Pre-flight checks for running.
      if (to === "running") {
        const variants = await loadVariants(existing.id);
        if (variants.length < 2) {
          throw new InvalidTrafficAllocationError(
            "experiment must have at least 2 variants before starting",
          );
        }
        validateAllocation(
          existing.trafficAllocation,
          variants,
          existing.controlVariantKey,
          { requireFull: true },
        );
      }

      const updateValues: Partial<typeof experiments.$inferInsert> = {
        status: to,
      };
      // Status timestamps:
      //   draft → running           : set started_at
      //   *     → archived          : set ended_at
      //   archived → draft (restore): wipe both timestamps so a re-start
      //                               counts from the new start
      if (from === "draft" && to === "running") {
        updateValues.startedAt = new Date();
      }
      if (to === "archived") {
        updateValues.endedAt = new Date();
      }
      if (from === "archived" && to === "draft") {
        updateValues.startedAt = null;
        updateValues.endedAt = null;
      }

      const [row] = await db
        .update(experiments)
        .set(updateValues)
        .where(
          and(
            eq(experiments.id, existing.id),
            eq(experiments.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new ExperimentNotFoundError(idOrKey);
      return row;
    },

    // ─── Variants ─────────────────────────────────────────────

    async listVariants(
      tenantId: string,
      experimentKey: string,
    ): Promise<Array<ExperimentVariant & { assignedUsers: number }>> {
      const exp = await loadByKey(tenantId, experimentKey);
      const rows = await loadVariants(exp.id);
      const ids = rows.map((v) => v.id);
      const aMap = await countAssignmentsByVariant(ids);
      return rows.map((v) => ({ ...v, assignedUsers: aMap.get(v.id) ?? 0 }));
    },

    async createVariant(
      tenantId: string,
      experimentKey: string,
      input: CreateVariantInput,
    ): Promise<ExperimentVariant> {
      const exp = await loadByKey(tenantId, experimentKey);
      // Variants can only be added when not running. Pause first to
      // tweak the variant set; restart to apply.
      if (exp.status === "running") {
        throw new ExperimentLockedError("variants");
      }
      const sortOrder = await appendKey(db, {
        table: experimentVariants,
        sortColumn: experimentVariants.sortOrder,
        scopeWhere: eq(experimentVariants.experimentId, exp.id),
      });
      try {
        const [row] = await db
          .insert(experimentVariants)
          .values({
            experimentId: exp.id,
            tenantId,
            variantKey: input.variantKey,
            name: input.name,
            description: input.description ?? null,
            isControl: input.isControl ?? false,
            configJson: input.configJson ?? null,
            sortOrder,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new VariantKeyConflictError(input.variantKey);
        }
        throw err;
      }
    },

    async updateVariant(
      tenantId: string,
      variantId: string,
      patch: UpdateVariantInput,
    ): Promise<ExperimentVariant> {
      const existing = await loadVariantById(tenantId, variantId);

      // Renaming the variant_key while running is fine ONLY if it's not
      // currently referenced by traffic_allocation. Simpler v1 rule: lock
      // variantKey edits while running.
      if (patch.variantKey !== undefined && patch.variantKey !== existing.variantKey) {
        const exp = await loadByKey(tenantId, existing.experimentId);
        if (exp.status === "running") {
          throw new ExperimentLockedError("variantKey");
        }
      }

      const updateValues: Partial<typeof experimentVariants.$inferInsert> = {};
      if (patch.variantKey !== undefined)
        updateValues.variantKey = patch.variantKey;
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.isControl !== undefined)
        updateValues.isControl = patch.isControl;
      if (patch.configJson !== undefined)
        updateValues.configJson = patch.configJson;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(experimentVariants)
          .set(updateValues)
          .where(eq(experimentVariants.id, existing.id))
          .returning();
        if (!row) throw new VariantNotFoundError(variantId);
        // If the variant_key was renamed, fan the new key out to any
        // assignments rows so evaluate's denormalized `variantKey`
        // stays accurate without a join. Cheap point-update by index.
        if (
          patch.variantKey !== undefined &&
          patch.variantKey !== existing.variantKey
        ) {
          await db
            .update(experimentAssignments)
            .set({ variantKey: patch.variantKey })
            .where(eq(experimentAssignments.variantId, existing.id));
        }
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.variantKey) {
          throw new VariantKeyConflictError(patch.variantKey);
        }
        throw err;
      }
    },

    async deleteVariant(
      tenantId: string,
      variantId: string,
    ): Promise<void> {
      const existing = await loadVariantById(tenantId, variantId);
      const exp = await loadByKey(tenantId, existing.experimentId);
      if (exp.status === "running") {
        throw new ExperimentLockedError("variants");
      }
      // Pre-check assignments: ON DELETE RESTRICT will throw a generic
      // FK error otherwise; we want a clean ModuleError.
      const aMap = await countAssignmentsByVariant([existing.id]);
      const assigned = aMap.get(existing.id) ?? 0;
      if (assigned > 0) {
        throw new VariantInUseError(assigned);
      }
      // Also block deleting the control variant — the experiment row
      // references it by key.
      if (existing.variantKey === exp.controlVariantKey) {
        throw new ExperimentInvalidInputError(
          "cannot delete the control variant; change controlVariantKey first",
        );
      }
      const deleted = await db
        .delete(experimentVariants)
        .where(eq(experimentVariants.id, existing.id))
        .returning({ id: experimentVariants.id });
      if (deleted.length === 0) throw new VariantNotFoundError(variantId);
    },

    async moveVariant(
      tenantId: string,
      variantId: string,
      body: VariantMoveInput,
    ): Promise<ExperimentVariant> {
      const existing = await loadVariantById(tenantId, variantId);
      // Normalize MoveInput → MoveBody (the validator allows three keys
      // but the helper expects one of them present).
      const moveBody = body.before
        ? { before: body.before }
        : body.after
          ? { after: body.after }
          : body.position
            ? { position: body.position }
            : null;
      if (!moveBody) {
        throw new ExperimentInvalidInputError(
          "exactly one of `before`, `after`, or `position` must be provided",
        );
      }
      try {
        return await moveAndReturn<ExperimentVariant>(db, {
          table: experimentVariants,
          sortColumn: experimentVariants.sortOrder,
          idColumn: experimentVariants.id,
          partitionWhere: sql`${experimentVariants.experimentId} = ${existing.experimentId}`,
          id: existing.id,
          body: moveBody,
          notFound: (siblingId) => new VariantNotFoundError(siblingId),
        });
      } catch (err) {
        if (err instanceof MoveSiblingNotFound) {
          throw new VariantNotFoundError(err.siblingId);
        }
        throw err;
      }
    },

    // ─── Assignments (debug / admin) ──────────────────────────

    async listAssignments(
      tenantId: string,
      experimentKey: string,
      params: PageParams = {},
    ): Promise<Page<typeof experimentAssignments.$inferSelect>> {
      const exp = await loadByKey(tenantId, experimentKey);
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(experimentAssignments.experimentId, exp.id)];
      // Cursor uses (assignedAt, endUserId) — there's no `id` column,
      // assignment PK is composite. Reuse `cursorWhere` semantics by
      // mapping assignedAt → createdAt and endUserId → id.
      const seek = cursorWhere(
        params.cursor,
        experimentAssignments.assignedAt,
        experimentAssignments.endUserId,
      );
      if (seek) conds.push(seek);
      if (params.q) {
        conds.push(ilike(experimentAssignments.endUserId, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(experimentAssignments)
        .where(and(...conds))
        .orderBy(
          desc(experimentAssignments.assignedAt),
          desc(experimentAssignments.endUserId),
        )
        .limit(limit + 1);
      // Composite-PK table — no `id` column. Use the
      // `buildPageBy` variant with assignedAt + endUserId as the
      // (sort, tiebreaker) cursor key.
      return buildPageBy(rows, limit, (r) => ({
        createdAt: r.assignedAt,
        id: r.endUserId,
      }));
    },

    // ─── Core: evaluate ──────────────────────────────────────

    async evaluate(
      tenantId: string,
      endUserId: string,
      keys: string[],
      attributes?: TargetingAttributes,
    ): Promise<EvaluateResult> {
      const result: EvaluateResult = {};
      if (keys.length === 0) return result;

      // Always include endUserId in the evaluation context — letting
      // targeting rules pin to specific test users (e.g. internal
      // QA whitelists).
      const evalAttrs: TargetingAttributes = {
        ...(attributes ?? {}),
        endUserId,
      };

      // 1. Fetch all matching experiments (by key) for this org in one shot.
      const experimentRows = await db
        .select()
        .from(experiments)
        .where(
          and(
            eq(experiments.tenantId, tenantId),
            inArray(experiments.key, keys),
          ),
        );
      if (experimentRows.length === 0) return result;

      // 2. Load all variants for these experiments in one shot.
      const expIds = experimentRows.map((e) => e.id);
      const allVariants = await db
        .select()
        .from(experimentVariants)
        .where(inArray(experimentVariants.experimentId, expIds));
      const variantsByExp = new Map<string, ExperimentVariant[]>();
      const variantsByExpAndKey = new Map<string, ExperimentVariant>();
      for (const v of allVariants) {
        const arr = variantsByExp.get(v.experimentId) ?? [];
        arr.push(v);
        variantsByExp.set(v.experimentId, arr);
        variantsByExpAndKey.set(`${v.experimentId}:${v.variantKey}`, v);
      }

      // 3. Look up existing assignments for this user across these experiments
      //    in one shot — so the steady-state hot path is N=1 SELECT regardless
      //    of how many experiments are evaluated.
      const existingAssignments = await db
        .select()
        .from(experimentAssignments)
        .where(
          and(
            inArray(experimentAssignments.experimentId, expIds),
            eq(experimentAssignments.endUserId, endUserId),
          ),
        );
      const assignByExp = new Map<
        string,
        typeof experimentAssignments.$inferSelect
      >();
      for (const a of existingAssignments) {
        assignByExp.set(a.experimentId, a);
      }

      // 4. For each experiment, decide what to return.
      for (const exp of experimentRows) {
        const status = exp.status as ExperimentStatus;
        const existing = assignByExp.get(exp.id);

        // Sticky: existing assignment always wins, regardless of
        // status OR targeting. If a user matched targeting at first
        // exposure, they keep their variant even if their attributes
        // later cease to match (industry standard — avoids users
        // unexpectedly switching groups mid-experiment).
        if (existing) {
          const variant = variantsByExpAndKey.get(
            `${exp.id}:${existing.variantKey}`,
          );
          result[exp.key] = {
            variantKey: existing.variantKey,
            config: (variant?.configJson ?? null) as unknown,
          };
          continue;
        }

        // No assignment yet.
        if (status === "draft") {
          // Drop from result entirely — clients should treat absence as
          // "no variant; show default UI".
          continue;
        }

        // Targeting check: non-matching users are OMITTED from the
        // response (not "control") so they don't pollute the
        // exposure / assignment record. Only applies to first-time
        // assignment (sticky users above are already grandfathered).
        const targetingPasses = evaluateCondition(
          exp.targetingRules,
          evalAttrs,
        );
        if (!targetingPasses) {
          continue;
        }

        if (status !== "running") {
          // paused / archived: return control without writing.
          const control = variantsByExpAndKey.get(
            `${exp.id}:${exp.controlVariantKey}`,
          );
          result[exp.key] = {
            variantKey: exp.controlVariantKey,
            config: (control?.configJson ?? null) as unknown,
          };
          continue;
        }

        // Running + no assignment → bucket and write.
        const variants = variantsByExp.get(exp.id) ?? [];
        if (variants.length === 0) {
          // Defensive: should be impossible (transitionStatus enforces
          // ≥2 variants). Return control without writing.
          result[exp.key] = {
            variantKey: exp.controlVariantKey,
            config: null,
          };
          continue;
        }
        const bucket = await bucketIndex(exp.id, endUserId);
        const chosenKey = pickVariant(
          bucket,
          exp.trafficAllocation,
          exp.controlVariantKey,
        );
        const chosenVariant = variantsByExpAndKey.get(`${exp.id}:${chosenKey}`);
        if (!chosenVariant) {
          // Defensive: allocation references an unknown variant. Fall
          // back to control.
          result[exp.key] = {
            variantKey: exp.controlVariantKey,
            config: null,
          };
          continue;
        }

        // Atomic upsert with no-op DO UPDATE so we can detect first-time
        // insert via (xmax = 0) for exposure de-duplication.
        const [upserted] = await db
          .insert(experimentAssignments)
          .values({
            experimentId: exp.id,
            endUserId,
            tenantId,
            variantId: chosenVariant.id,
            variantKey: chosenVariant.variantKey,
          })
          .onConflictDoUpdate({
            target: [
              experimentAssignments.experimentId,
              experimentAssignments.endUserId,
            ],
            // No-op write of the same column — required because Postgres
            // needs a non-empty SET to RETURN a row from the UPDATE
            // branch. We READ the canonical (winner's) variant_id back.
            set: {
              variantId: sql`${experimentAssignments.variantId}`,
            },
          })
          .returning({
            variantId: experimentAssignments.variantId,
            variantKey: experimentAssignments.variantKey,
            // (xmax = 0) is true on the INSERT branch, false on the
            // UPDATE branch (= conflict / second write).
            inserted: sql<boolean>`(xmax = 0)`.as("inserted"),
          });

        if (!upserted) {
          // Defensive: shouldn't happen.
          result[exp.key] = {
            variantKey: chosenVariant.variantKey,
            config: chosenVariant.configJson ?? null,
          };
          continue;
        }

        // Look up the variant the upsert actually settled on (might
        // differ from chosenVariant if the user raced with another
        // request — winner's variant is the source of truth).
        const settledVariant =
          variantsByExpAndKey.get(`${exp.id}:${upserted.variantKey}`) ??
          chosenVariant;

        result[exp.key] = {
          variantKey: upserted.variantKey,
          config: settledVariant.configJson ?? null,
        };

        if (upserted.inserted && events) {
          await events.emit("experiment.exposure", {
            tenantId,
            endUserId,
            experimentId: exp.id,
            experimentKey: exp.key,
            variantId: upserted.variantId,
            variantKey: upserted.variantKey,
            attributes: evalAttrs,
          });
        }
      }

      return result;
    },

    // ─── Bucketing preview (admin-only) ──────────────────────

    async previewBucketing(
      tenantId: string,
      experimentKey: string,
      params: PreviewBucketingInput,
    ): Promise<{
      userVariant: { variantId: string; variantKey: string } | null;
      distribution: BucketingDistribution;
      targetingHitRate: number | null;
    }> {
      const exp = await loadByKey(tenantId, experimentKey);
      if (exp.status === "draft" && exp.trafficAllocation.length === 0) {
        throw new ExperimentNotRunningError(experimentKey);
      }
      const variants = await loadVariants(exp.id);
      const variantByKey = new Map(variants.map((v) => [v.variantKey, v]));

      const targetingActive =
        exp.targetingRules != null &&
        !(typeof exp.targetingRules === "object" &&
          exp.targetingRules !== null &&
          Object.keys(exp.targetingRules as Record<string, unknown>).length === 0);
      const sampleAttrs = (params.attributes_sample ?? {}) as TargetingAttributes;

      // Single-user lookup.
      let userVariant: { variantId: string; variantKey: string } | null = null;
      if (params.end_user_id) {
        const bucket = await bucketIndex(exp.id, params.end_user_id);
        const key = pickVariant(
          bucket,
          exp.trafficAllocation,
          exp.controlVariantKey,
        );
        const variant = variantByKey.get(key);
        if (variant) {
          userVariant = { variantId: variant.id, variantKey: key };
        } else {
          userVariant = { variantId: "", variantKey: key };
        }
      }

      // Sample distribution: synthesize sample_size random endUserIds and
      // run the same bucket math. Pure-compute, doesn't touch the DB or
      // emit events. v1.5: also runs targeting against the supplied
      // sample attributes (keys vary per fake user only via endUserId
      // — so hit rate is essentially "all-or-none" unless the rule
      // depends on user-id pattern; that's fine for a preview).
      const sampleSize = params.sample_size ?? 1000;
      const counts = new Map<string, number>();
      let hits = 0;
      for (const v of variants) counts.set(v.variantKey, 0);

      // Serial — SHA-256 in Workers crypto.subtle is fast and the inner
      // counts.set isn't safe to interleave naively. 1000 iterations
      // bench at <50 ms locally.
      for (let i = 0; i < sampleSize; i++) {
        const fakeUserId = `${exp.id}-preview-${i}-${crypto.randomUUID()}`;
        // Apply targeting first — non-matching users skip bucketing,
        // matching reality: they would be omitted from evaluate response.
        if (targetingActive) {
          const passes = evaluateCondition(exp.targetingRules, {
            ...sampleAttrs,
            endUserId: fakeUserId,
          });
          if (!passes) continue;
          hits += 1;
        } else {
          hits += 1;
        }
        const bucket = await bucketIndex(exp.id, fakeUserId);
        const key = pickVariant(
          bucket,
          exp.trafficAllocation,
          exp.controlVariantKey,
        );
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const distribution: BucketingDistribution = Array.from(
        counts.entries(),
      ).map(([variantKey, c]) => ({
        variantKey,
        count: c,
        // Percent is over the "passed targeting" pool, matching
        // the real evaluate semantics. If targeting filtered out
        // most users, the percent breakdown still reflects the
        // 50/50 allocation among the survivors.
        percent: hits === 0 ? 0 : Number(((c / hits) * 100).toFixed(2)),
      }));

      return {
        userVariant,
        distribution,
        targetingHitRate: targetingActive
          ? Number(((hits / sampleSize) * 100).toFixed(2))
          : null,
      };
    },

    async setPrimaryMetric(
      tenantId: string,
      idOrKey: string,
      primaryMetric: ExperimentPrimaryMetric | null,
      metricWindowDays?: number,
    ): Promise<Experiment> {
      const existing = await loadByKey(tenantId, idOrKey);
      const updateValues: Partial<typeof experiments.$inferInsert> = {
        primaryMetric,
      };
      if (metricWindowDays !== undefined) {
        updateValues.metricWindowDays = metricWindowDays;
      }
      const [row] = await db
        .update(experiments)
        .set(updateValues)
        .where(
          and(
            eq(experiments.id, existing.id),
            eq(experiments.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new ExperimentNotFoundError(idOrKey);
      return row;
    },
  };
}

export type ExperimentService = ReturnType<typeof createExperimentService>;
