/**
 * Zod schemas for the experiment module.
 *
 * Used for BOTH service input validation AND HTTP request/response
 * bodies. `.openapi(...)` metadata keeps Scalar's docs honest and the
 * generated SDK types accurate.
 */

import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { EXPERIMENT_STATUSES } from "./types";

const KeyRegex = /^[a-z][a-z0-9_]*$/;

const ExperimentKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(KeyRegex, {
    message:
      "key must start with [a-z] and contain only [a-z0-9_]",
  })
  .openapi({
    description:
      "Stable identifier referenced from client code. Lowercase, digits, underscore. Cannot be changed after creation.",
    example: "onboarding_flow",
  });

const VariantKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(KeyRegex, {
    message: "variant_key must start with [a-z] and contain only [a-z0-9_]",
  })
  .openapi({
    description: "Per-experiment-unique variant identifier.",
    example: "control",
  });

const StatusSchema = z.enum(EXPERIMENT_STATUSES).openapi({
  description: "Experiment lifecycle status.",
});

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

export const TrafficAllocationEntrySchema = z
  .object({
    variant_key: VariantKeySchema,
    percent: z
      .number()
      .min(0)
      .max(100)
      .openapi({ description: "Traffic share, 0..100. Sum across all entries must equal 100." }),
  })
  .openapi("ExperimentTrafficSlice");

export const TrafficAllocationSchema = z
  .array(TrafficAllocationEntrySchema)
  .openapi({
    description:
      "Traffic split. Each entry references a variant_key on this experiment; sum of percent must equal exactly 100. Pass [] for a draft that hasn't configured allocation yet.",
  });

/**
 * Targeting rule schema. Wire shape is **any JSONLogic-compatible JSON**
 * — a tagged-union tree like `{ "in": [{ "var": "country" }, ["JP"] ] }`.
 * We do not strongly-type the AST here; the service layer's
 * `evaluateCondition()` (shared with the trigger module) is the
 * sandbox + validator at runtime. Wire-level we only enforce a 16KB
 * size cap to bound the cost of each evaluate call.
 */
const TARGETING_RULES_MAX_BYTES = 16384;
export const TargetingRulesSchema = z
  .unknown()
  .nullable()
  .refine(
    (val) => {
      if (val == null) return true;
      try {
        return JSON.stringify(val).length <= TARGETING_RULES_MAX_BYTES;
      } catch {
        return false;
      }
    },
    { message: `targeting_rules must serialize to ≤ ${TARGETING_RULES_MAX_BYTES} bytes` },
  )
  .openapi({
    description:
      "JSONLogic targeting rule. null / {} matches all users. Non-matching users are OMITTED from evaluate response — no assignment, no exposure event.",
    example: {
      and: [
        { in: [{ var: "country" }, ["JP", "KR"]] },
        { "==": [{ var: "plan" }, "free"] },
      ],
    },
  });

/**
 * Primary metric definition for the decision panel. Optional —
 * experiments can be created without one and operators bind it later.
 */
export const PrimaryMetricSchema = z
  .object({
    event: z
      .string()
      .min(1)
      .max(128)
      .openapi({ description: "Event name to count as a conversion." }),
    filter: z
      .unknown()
      .nullable()
      .optional()
      .openapi({
        description:
          "Optional JSONLogic sub-filter against the conversion event's event_data.",
      }),
    denominator: z.enum(["exposed_users", "events"]).openapi({
      description:
        "How to compute the rate. exposed_users = converted_unique_users / exposed_unique_users (Bernoulli, what z-test math expects). events = total_event_count / exposed_unique_users (per-user count).",
    }),
  })
  .openapi("ExperimentPrimaryMetric");

// ─── Experiment CRUD ─────────────────────────────────────────────

export const CreateExperimentSchema = z
  .object({
    key: ExperimentKeySchema,
    name: z.string().min(1).max(200).openapi({ example: "Onboarding flow A/B" }),
    description: z.string().max(2000).nullable().optional(),
    controlVariantKey: VariantKeySchema.default("control").openapi({
      description:
        "Variant returned when no assignment row exists (e.g. paused experiments, never-seen users).",
    }),
    trafficAllocation: TrafficAllocationSchema.default([]),
    targetingRules: TargetingRulesSchema.optional(),
    primaryMetric: PrimaryMetricSchema.nullable().optional(),
    metricWindowDays: z.number().int().min(1).max(30).optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExperimentCreate");

export const UpdateExperimentSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    controlVariantKey: VariantKeySchema.optional(),
    trafficAllocation: TrafficAllocationSchema.optional(),
    targetingRules: TargetingRulesSchema.optional(),
    primaryMetric: PrimaryMetricSchema.nullable().optional(),
    metricWindowDays: z.number().int().min(1).max(30).optional(),
    metadata: MetadataSchema,
  })
  .openapi("ExperimentUpdate");

export const TransitionStatusSchema = z
  .object({
    to: StatusSchema,
  })
  .openapi("ExperimentTransition");

// ─── Variants ────────────────────────────────────────────────────

export const CreateVariantSchema = z
  .object({
    variantKey: VariantKeySchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    isControl: z.boolean().default(false),
    configJson: z.unknown().nullable().optional().openapi({
      description:
        "Optional remote-config payload; clients receive it via evaluate. Leave null for pure traffic-split usage.",
    }),
  })
  .openapi("ExperimentVariantCreate");

export const UpdateVariantSchema = z
  .object({
    variantKey: VariantKeySchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    isControl: z.boolean().optional(),
    configJson: z.unknown().nullable().optional(),
  })
  .openapi("ExperimentVariantUpdate");

export const VariantMoveSchema = z
  .object({
    before: z.string().uuid().optional(),
    after: z.string().uuid().optional(),
    position: z.enum(["first", "last"]).optional(),
  })
  .refine(
    (val) =>
      [val.before, val.after, val.position].filter((v) => v !== undefined)
        .length === 1,
    {
      message:
        "Exactly one of `before`, `after`, or `position` must be provided",
    },
  )
  .openapi("ExperimentVariantMove");

// ─── Evaluate (client) ──────────────────────────────────────────

const ATTRIBUTES_MAX_BYTES = 4096;

export const EvaluateRequestSchema = z
  .object({
    experiment_keys: z
      .array(ExperimentKeySchema)
      .min(1)
      .max(50)
      .openapi({
        description: "List of experiment keys to evaluate in one round-trip.",
        example: ["onboarding_flow"],
      }),
    attributes: z
      .record(z.string(), z.unknown())
      .optional()
      .refine(
        (val) => {
          if (val == null) return true;
          try {
            return JSON.stringify(val).length <= ATTRIBUTES_MAX_BYTES;
          } catch {
            return false;
          }
        },
        { message: `attributes must serialize to ≤ ${ATTRIBUTES_MAX_BYTES} bytes` },
      )
      .openapi({
        description:
          "User attributes for targeting rule evaluation. Tenant-defined keys (plan, cohort, daysSinceSignup, etc). Server-derived keys like `country` and `userAgent` are merged in automatically — SDK values OVERRIDE server-derived on conflict, so the tenant can spoof for testing if needed.",
        example: { plan: "free", cohort: "beta", country: "JP" },
      }),
  })
  .openapi("ExperimentEvaluateRequest");

export const EvaluatedVariantSchema = z
  .object({
    variantKey: z.string(),
    config: z.unknown().nullable(),
  })
  .openapi("ExperimentEvaluatedVariant");

export const EvaluateResponseSchema = z
  .object({
    /**
     * Map keyed by `experiment.key`. Experiments in `draft` (or
     * unknown to this org) are OMITTED — clients should treat absence
     * as "no variant; show default UI".
     */
    results: z.record(z.string(), EvaluatedVariantSchema),
  })
  .openapi("ExperimentEvaluateResponse");

// ─── Bucketing preview (admin) ──────────────────────────────────

export const PreviewBucketingRequestSchema = z
  .object({
    end_user_id: z.string().min(1).max(256).optional().openapi({
      description:
        "Optional. If supplied, returns this user's variant. If omitted, only the sampled distribution is returned.",
    }),
    sample_size: z
      .number()
      .int()
      .min(100)
      .max(10_000)
      .default(1000)
      .openapi({
        description:
          "Number of synthetic endUserIds to sample for the distribution chart.",
      }),
    attributes_sample: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({
        description:
          "Optional fixed attributes used during sampling. Lets the operator preview targeting-rule hit rate against a representative attribute profile (e.g. { country: 'JP', plan: 'free' }).",
      }),
  })
  .openapi("ExperimentPreviewBucketingRequest");

export const PreviewBucketingResponseSchema = z
  .object({
    userVariant: z
      .object({ variantId: z.string(), variantKey: z.string() })
      .nullable(),
    distribution: z.array(
      z.object({
        variantKey: z.string(),
        count: z.number().int(),
        percent: z.number(),
      }),
    ),
    /**
     * v1.5: when targeting_rules is set, fraction of the synthetic
     * sample that PASSED targeting (i.e. would actually be assigned).
     * Lets the admin estimate experiment coverage. Null when no rules.
     */
    targetingHitRate: z.number().nullable(),
  })
  .openapi("ExperimentPreviewBucketingResponse");

// ─── Path params ────────────────────────────────────────────────

export const ExperimentKeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Experiment id (uuid) or key (alias).",
  }),
});

export const ExperimentIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Experiment id.",
  }),
});

export const VariantIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Variant id.",
  }),
});

// ─── Response shapes ────────────────────────────────────────────

export const ExperimentResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: StatusSchema,
    trafficAllocation: TrafficAllocationSchema,
    controlVariantKey: z.string(),
    targetingRules: z.unknown(),
    primaryMetric: PrimaryMetricSchema.nullable(),
    metricWindowDays: z.number().int(),
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** Convenience counters joined in by the route layer. */
    variantsCount: z.number().int().optional(),
    assignedUsers: z.number().int().optional(),
  })
  .openapi("Experiment");

export const VariantResponseSchema = z
  .object({
    id: z.string(),
    experimentId: z.string(),
    tenantId: z.string(),
    variantKey: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isControl: z.boolean(),
    configJson: z.unknown().nullable(),
    sortOrder: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** Convenience counter joined in by the route layer. */
    assignedUsers: z.number().int().optional(),
  })
  .openapi("ExperimentVariant");

export const AssignmentResponseSchema = z
  .object({
    experimentId: z.string(),
    endUserId: z.string(),
    tenantId: z.string(),
    variantId: z.string(),
    variantKey: z.string(),
    assignedAt: z.string(),
  })
  .openapi("ExperimentAssignment");

export const ExperimentListResponseSchema = pageOf(
  ExperimentResponseSchema,
).openapi("ExperimentList");

export const VariantListResponseSchema = z
  .object({ items: z.array(VariantResponseSchema) })
  .openapi("ExperimentVariantList");

export const AssignmentListResponseSchema = pageOf(
  AssignmentResponseSchema,
).openapi("ExperimentAssignmentList");

// ─── Inferred input types (for service.ts signatures) ───────────

export type CreateExperimentInput = z.input<typeof CreateExperimentSchema>;
export type UpdateExperimentInput = z.input<typeof UpdateExperimentSchema>;
export type CreateVariantInput = z.input<typeof CreateVariantSchema>;
export type UpdateVariantInput = z.input<typeof UpdateVariantSchema>;
export type VariantMoveInput = z.input<typeof VariantMoveSchema>;
export type PreviewBucketingInput = z.input<
  typeof PreviewBucketingRequestSchema
>;
export type EvaluateInput = z.input<typeof EvaluateRequestSchema>;
