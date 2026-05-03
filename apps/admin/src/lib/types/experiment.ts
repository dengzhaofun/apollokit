/**
 * Admin-side type mirrors for the experiment module.
 *
 * Mirrors the OpenAPI response shapes — wire format (Date → string).
 * These are hand-written for v1 while the SDK is still draft; once the
 * server's openapi.json is regenerated and `pnpm sdks:generate` runs,
 * the SDK package will export equivalent types and we can switch to
 * importing from `@apollokit/client` instead.
 */

export type ExperimentStatus = "draft" | "running" | "paused" | "archived"

export interface ExperimentTrafficSlice {
  variant_key: string
  percent: number
}

/**
 * JSONLogic targeting rule. Wire shape is "any JSONLogic-compatible
 * JSON". null / {} = match all users. We store/transit the raw tree
 * — the builder UI is the only thing that really cares about its
 * shape.
 */
export type ExperimentTargetingRules = unknown

/**
 * Primary metric for the decision panel.
 *
 * `denominator`:
 *   - "exposed_users" → conversion rate = converted_users / exposed_users
 *     (canonical Bernoulli; what compareProportions expects)
 *   - "events"        → average events per exposed user
 */
export interface ExperimentPrimaryMetric {
  event: string
  filter?: unknown | null
  denominator: "exposed_users" | "events"
}

export interface Experiment {
  id: string
  tenantId: string
  key: string
  name: string
  description: string | null
  status: ExperimentStatus
  trafficAllocation: ExperimentTrafficSlice[]
  controlVariantKey: string
  targetingRules: ExperimentTargetingRules
  primaryMetric: ExperimentPrimaryMetric | null
  metricWindowDays: number
  startedAt: string | null
  endedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  variantsCount?: number
  assignedUsers?: number
}

export interface ExperimentVariant {
  id: string
  experimentId: string
  tenantId: string
  variantKey: string
  name: string
  description: string | null
  isControl: boolean
  configJson: unknown | null
  sortOrder: string
  createdAt: string
  updatedAt: string
  assignedUsers?: number
}

export interface ExperimentAssignment {
  experimentId: string
  endUserId: string
  tenantId: string
  variantId: string
  variantKey: string
  assignedAt: string
}

export interface CreateExperimentInput {
  key: string
  name: string
  description?: string | null
  controlVariantKey?: string
  trafficAllocation?: ExperimentTrafficSlice[]
  targetingRules?: ExperimentTargetingRules
  primaryMetric?: ExperimentPrimaryMetric | null
  metricWindowDays?: number
  metadata?: Record<string, unknown> | null
}

export interface UpdateExperimentInput {
  name?: string
  description?: string | null
  controlVariantKey?: string
  trafficAllocation?: ExperimentTrafficSlice[]
  targetingRules?: ExperimentTargetingRules
  primaryMetric?: ExperimentPrimaryMetric | null
  metricWindowDays?: number
  metadata?: Record<string, unknown> | null
}

export interface CreateVariantInput {
  variantKey: string
  name: string
  description?: string | null
  isControl?: boolean
  configJson?: unknown | null
}

export interface UpdateVariantInput {
  variantKey?: string
  name?: string
  description?: string | null
  isControl?: boolean
  configJson?: unknown | null
}

export interface BucketingDistributionEntry {
  variantKey: string
  count: number
  percent: number
}

export interface PreviewBucketingResult {
  userVariant: { variantId: string; variantKey: string } | null
  distribution: BucketingDistributionEntry[]
  /** v1.5: % of sampled users that passed targeting. Null = no rule. */
  targetingHitRate: number | null
}

/** Tinybird `experiment_metric_breakdown` row shape. */
export interface ExperimentMetricBreakdownRow {
  variant_key: string
  exposed_users: number
  converted_users: number
  event_count: number
}
