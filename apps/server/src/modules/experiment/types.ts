/**
 * Experiment domain types.
 *
 * Drizzle row types come via `$inferSelect` re-exports from the schema.
 * Wire-shape input types are derived from the zod schemas in
 * `./validators.ts` so the service and HTTP layers share a single
 * source of truth.
 */

import type {
  experimentAssignments,
  experiments,
  experimentVariants,
  ExperimentTrafficAllocation,
} from "../../schema/experiment";

export {
  EXPERIMENT_STATUSES,
  type ExperimentStatus,
  type ExperimentTrafficAllocation,
  type ExperimentTargetingRules,
  type ExperimentPrimaryMetric,
} from "../../schema/experiment";

export type Experiment = typeof experiments.$inferSelect;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type ExperimentAssignment = typeof experimentAssignments.$inferSelect;

/**
 * Result of a single variant evaluation. Exists alongside the variant
 * row but flat — the SDK consumer doesn't need to know about the
 * persisted assignment row.
 */
export type EvaluatedVariant = {
  variantKey: string;
  /** Optional remote-config payload; null for pure traffic-split usage. */
  config: unknown | null;
};

/**
 * Multi-evaluate response: keyed by `experiment.key`. An experiment
 * that's in `draft` status (or was not found) is OMITTED — the SDK
 * consumer should treat absence as "no variant; show default UI".
 */
export type EvaluateResult = Record<string, EvaluatedVariant>;

/** Detail returned by the bucketing-preview endpoint. */
export type BucketingDistribution = Array<{
  variantKey: string;
  count: number;
  percent: number;
}>;

/**
 * Attributes available to a targeting rule. Server merges:
 *   - server-derived (cf-ipcountry → country, ua → userAgent, etc),
 *     namespaced under no prefix
 *   - SDK-supplied attributes (tenant business knowledge: plan, cohort,
 *     daysSinceSignup, etc), which OVERRIDE server values on conflict
 *   - `endUserId` is always present
 *
 * Tenant-defined keys can be anything serializable.
 */
export type TargetingAttributes = Record<string, unknown>;
