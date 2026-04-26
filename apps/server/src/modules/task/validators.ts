/**
 * Zod schemas for the task module.
 *
 * Shared between HTTP validation and service-layer input typing.
 * `.openapi()` metadata is attached for the Scalar UI at /docs.
 */

import { z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { taskCategories, taskDefinitions } from "../../schema/task";
import { compileTaskFilter, FILTER_MAX_LENGTH } from "./filter";
import {
  CATEGORY_SCOPES,
  COUNTING_METHODS,
  TASK_ASSIGNMENT_SOURCES,
  TASK_PERIODS,
  TASK_VISIBILITIES,
} from "./types";

// ─── List filters ──────────────────────────────────────────────────

export const taskCategoryFilters = defineListFilter({
  scope: f.enumOf(CATEGORY_SCOPES, { column: taskCategories.scope }),
  isActive: f.boolean({ column: taskCategories.isActive }),
})
  .search({ columns: [taskCategories.name, taskCategories.alias] })
  .build();

export const ListTaskCategoriesQuerySchema =
  taskCategoryFilters.querySchema.openapi("ListTaskCategoriesQuery");

export const taskDefinitionFilters = defineListFilter({
  categoryId: f.uuid({ column: taskDefinitions.categoryId }),
  period: f.enumOf(TASK_PERIODS, { column: taskDefinitions.period }),
  countingMethod: f.enumOf(COUNTING_METHODS, {
    column: taskDefinitions.countingMethod,
  }),
  visibility: f.enumOf(TASK_VISIBILITIES, {
    column: taskDefinitions.visibility,
  }),
  isActive: f.boolean({ column: taskDefinitions.isActive }),
  isHidden: f.boolean({ column: taskDefinitions.isHidden }),
  parentId: f.string({
    column: taskDefinitions.parentId,
    where: (v: string) =>
      v === "null"
        ? sql`${taskDefinitions.parentId} IS NULL`
        : sql`${taskDefinitions.parentId} = ${v}`,
  }),
  activityId: f.string({
    column: taskDefinitions.activityId,
    where: (v: string) =>
      v === "null"
        ? sql`${taskDefinitions.activityId} IS NULL`
        : sql`${taskDefinitions.activityId} = ${v}`,
  }),
})
  .search({
    columns: [taskDefinitions.name, taskDefinitions.alias],
    // pg_trgm GIN index exists — see drizzle/0002_pg_trgm_search_indexes.sql.
    mode: "trgm",
  })
  .build();

export const ListTaskDefinitionsQuerySchema =
  taskDefinitionFilters.querySchema.openapi("ListTaskDefinitionsQuery");

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description: "Optional human-readable key, unique within the org.",
    example: "daily-login",
  });

const RewardItemSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const TierAliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const TaskRewardTierSchema = z
  .object({
    alias: z
      .string()
      .min(1)
      .max(64)
      .regex(TierAliasRegex, {
        message:
          "tier alias must start with [a-z0-9] and contain only [a-z0-9-_]",
      })
      .openapi({
        description:
          "Stable identifier for this tier, unique within the task. Used as the idempotency key on the claim ledger — keeping it stable lets admins add/remove/reorder tiers without invalidating prior claims.",
        example: "tier-1",
      }),
    threshold: z.number().int().positive().openapi({
      description:
        "currentValue >= threshold makes this tier claimable. Must be <= targetValue.",
      example: 3,
    }),
    rewards: z.array(RewardItemSchema).min(1).openapi({
      description: "Rewards granted when this tier is claimed.",
    }),
  })
  .openapi("TaskRewardTier");

/**
 * Cross-field validation shared by create & update validators for the
 * `rewardTiers` array. Keeps aliases unique, enforces strictly
 * increasing thresholds, and (when `targetValue` is known) requires
 * every threshold to fit within it.
 *
 * Exposed as a free function so the create superRefine and the update
 * superRefine can both call it — the update path only has
 * `targetValue` sometimes (patch may omit it), in which case the
 * target-bound check is skipped and deferred to the service layer when
 * it merges the patch with the existing row.
 */
function refineRewardTiers(
  tiers: Array<{ alias: string; threshold: number }> | undefined,
  targetValue: number | undefined,
  ctx: z.RefinementCtx,
) {
  if (!tiers || tiers.length === 0) return;
  const seenAliases = new Set<string>();
  let prevThreshold = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (seenAliases.has(t.alias)) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardTiers", i, "alias"],
        message: `duplicate tier alias: ${t.alias}`,
      });
    } else {
      seenAliases.add(t.alias);
    }
    if (t.threshold <= prevThreshold) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardTiers", i, "threshold"],
        message: "tier thresholds must be strictly increasing",
      });
    }
    if (targetValue !== undefined && t.threshold > targetValue) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardTiers", i, "threshold"],
        message: `tier threshold (${t.threshold}) must be <= targetValue (${targetValue})`,
      });
    }
    prevThreshold = t.threshold;
  }
}

const NavigationSchema = z
  .object({
    type: z.string().min(1).max(64),
    target: z.string().min(1).max(256),
    params: z.record(z.string(), z.unknown()).optional(),
    label: z.string().max(200).optional(),
  })
  .nullable()
  .optional()
  .openapi({
    description:
      "Client-side navigation config. Server stores it opaquely.",
  });

// ─── Category ─────────────────────────────────────────────────────

export const CreateCategorySchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Daily Quests" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    scope: z.enum(CATEGORY_SCOPES).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("TaskCreateCategory");

export const UpdateCategorySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    scope: z.enum(CATEGORY_SCOPES).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("TaskUpdateCategory");

// ─── Definition ───────────────────────────────────────────────────

export const CreateDefinitionSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).openapi({ example: "Win 3 battles" }),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    period: z.enum(TASK_PERIODS).openapi({
      description: "Reset cycle: daily, weekly, monthly, or none (permanent).",
    }),
    timezone: z.string().max(64).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    countingMethod: z.enum(COUNTING_METHODS).openapi({
      description:
        "How progress increments: event_count (+1), event_value (+data field), child_completion (SUM of children).",
    }),
    eventName: z.string().min(1).max(128).nullable().optional().openapi({
      description:
        "Event name to listen for. Required for event_count/event_value.",
      example: "purchase",
    }),
    eventValueField: z.string().min(1).max(128).nullable().optional().openapi({
      description:
        "Dot-path into eventData for event_value counting. e.g. 'amount'.",
      example: "amount",
    }),
    filter: z
      .string()
      .min(1)
      .max(FILTER_MAX_LENGTH)
      .nullable()
      .optional()
      .openapi({
        description:
          "Optional filtrex expression evaluated against eventData. The " +
          "event only advances progress if it returns truthy. Nested " +
          "fields use dot notation, e.g. `monsterId == \"dragon\" and " +
          "stats.level >= 10`.",
        example: 'monsterId == "dragon"',
      }),
    targetValue: z.number().int().positive().openapi({
      description: "Goal value to complete the task.",
      example: 3,
    }),
    parentProgressValue: z.number().int().positive().optional().openapi({
      description:
        "Progress contributed to parent task on completion. Default 1.",
    }),
    prerequisiteTaskIds: z.array(z.string().uuid()).optional().openapi({
      description: "Task definition IDs that must be completed first.",
    }),
    rewards: z.array(RewardItemSchema).min(1).openapi({
      description: "Rewards granted on completion.",
    }),
    rewardTiers: z
      .array(TaskRewardTierSchema)
      .default([])
      .optional()
      .openapi({
        description:
          "Staged (阶段性) rewards claimable at intermediate progress thresholds. Empty array keeps the legacy single-reward behavior. Aliases must be unique and thresholds strictly increasing and <= targetValue.",
      }),
    autoClaim: z.boolean().optional(),
    navigation: NavigationSchema,
    isActive: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    activityId: z.string().uuid().nullable().optional().openapi({
      description:
        "Soft link to an activity. Null means this is a permanent task.",
    }),
    activityNodeId: z.string().uuid().nullable().optional(),
    visibility: z.enum(TASK_VISIBILITIES).optional().openapi({
      description:
        "'broadcast' (default) → visible to all end users. 'assigned' → only visible to users with an active task_user_assignments row.",
    }),
    defaultAssignmentTtlSeconds: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .openapi({
        description:
          "Default TTL applied to assignments that don't specify their own expiry. Null = no default expiry.",
      }),
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    const cm = val.countingMethod;
    if (cm === "event_count" || cm === "event_value") {
      if (!val.eventName) {
        ctx.addIssue({
          code: "custom",
          path: ["eventName"],
          message: `eventName is required when countingMethod='${cm}'`,
        });
      }
    }
    if (cm === "event_value" && !val.eventValueField) {
      ctx.addIssue({
        code: "custom",
        path: ["eventValueField"],
        message: "eventValueField is required when countingMethod='event_value'",
      });
    }
    if (cm === "child_completion") {
      if (val.eventName) {
        ctx.addIssue({
          code: "custom",
          path: ["eventName"],
          message:
            "eventName must not be set when countingMethod='child_completion'",
        });
      }
      if (val.filter) {
        ctx.addIssue({
          code: "custom",
          path: ["filter"],
          message:
            "filter must not be set when countingMethod='child_completion'",
        });
      }
    }
    if (val.filter) {
      try {
        compileTaskFilter(val.filter);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          path: ["filter"],
          message: `invalid filter expression: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
    refineRewardTiers(val.rewardTiers, val.targetValue, ctx);
  })
  .openapi("TaskCreateDefinition");

export const UpdateDefinitionSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    period: z.enum(TASK_PERIODS).optional(),
    timezone: z.string().max(64).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    countingMethod: z.enum(COUNTING_METHODS).optional(),
    eventName: z.string().min(1).max(128).nullable().optional(),
    eventValueField: z.string().min(1).max(128).nullable().optional(),
    filter: z.string().min(1).max(FILTER_MAX_LENGTH).nullable().optional(),
    targetValue: z.number().int().positive().optional(),
    parentProgressValue: z.number().int().positive().optional(),
    prerequisiteTaskIds: z.array(z.string().uuid()).optional(),
    rewards: z.array(RewardItemSchema).min(1).optional(),
    rewardTiers: z.array(TaskRewardTierSchema).optional(),
    autoClaim: z.boolean().optional(),
    navigation: NavigationSchema,
    isActive: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    visibility: z.enum(TASK_VISIBILITIES).optional(),
    defaultAssignmentTtlSeconds: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    // Only validate shape here — cross-field rules that depend on
    // countingMethod live on the service layer (the caller may be
    // patching only `filter` while countingMethod is unchanged).
    if (val.filter) {
      try {
        compileTaskFilter(val.filter);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          path: ["filter"],
          message: `invalid filter expression: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
    // `targetValue` may be omitted in a patch; pass whatever we have
    // and let the service layer re-check against the merged row.
    refineRewardTiers(val.rewardTiers, val.targetValue, ctx);
  })
  .openapi("TaskUpdateDefinition");

// ─── Param schemas ────────────────────────────────────────────────

export const CategoryIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const DefinitionKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Task definition id or alias.",
    }),
});

export const TaskIdParamSchema = z.object({
  taskId: z
    .string()
    .uuid()
    .openapi({ param: { name: "taskId", in: "path" } }),
});

// ─── Client body schemas ──────────────────────────────────────────

export const EventBodySchema = z
  .object({
    eventName: z.string().min(1).max(128).openapi({
      description: "Business event name, e.g. 'purchase', 'login', 'battle_win'.",
      example: "purchase",
    }),
    eventData: z.record(z.string(), z.unknown()).default({}).openapi({
      description: "Arbitrary event payload. Used by event_value counting.",
    }),
    timestamp: z.string().datetime().optional().openapi({
      description:
        "ISO 8601 timestamp of the event. Defaults to now if omitted.",
    }),
  })
  .openapi("TaskEventBody");

export const TaskListBodySchema = z
  .object({
    categoryId: z.string().uuid().optional().openapi({
      description: "Filter by category.",
    }),
    period: z.enum(TASK_PERIODS).optional().openapi({
      description: "Filter by period type.",
    }),
    includeHidden: z.boolean().optional().openapi({
      description: "Include tasks whose prerequisites are not met.",
    }),
  })
  .openapi("TaskListBody");

export const ClaimTierBodySchema = z
  .object({
    taskId: z.string().uuid().openapi({
      description: "Task definition id whose tier is being claimed.",
    }),
    tierAlias: z.string().min(1).max(64).openapi({
      description: "Stable alias of the reward tier to claim.",
      example: "tier-1",
    }),
  })
  .openapi("TaskClaimTierBody");

// ─── Response schemas ─────────────────────────────────────────────

export const CategoryResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    scope: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TaskCategory");

export const CategoryListResponseSchema = pageOf(CategoryResponseSchema).openapi(
  "TaskCategoryList",
);

export const DefinitionResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    categoryId: z.string().nullable(),
    parentId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    period: z.string(),
    timezone: z.string(),
    weekStartsOn: z.number().int(),
    countingMethod: z.string(),
    eventName: z.string().nullable(),
    eventValueField: z.string().nullable(),
    filter: z.string().nullable(),
    targetValue: z.number().int(),
    parentProgressValue: z.number().int(),
    prerequisiteTaskIds: z.array(z.string()),
    rewards: z.array(RewardItemSchema),
    rewardTiers: z.array(TaskRewardTierSchema),
    autoClaim: z.boolean(),
    navigation: z
      .object({
        type: z.string(),
        target: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        label: z.string().optional(),
      })
      .nullable(),
    isActive: z.boolean(),
    isHidden: z.boolean(),
    visibility: z.string(),
    defaultAssignmentTtlSeconds: z.number().int().nullable(),
    sortOrder: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TaskDefinition");

export const DefinitionListResponseSchema = pageOf(DefinitionResponseSchema).openapi(
  "TaskDefinitionList",
);

export const ClientTaskViewSchema = z
  .object({
    id: z.string(),
    categoryId: z.string().nullable(),
    parentId: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    period: z.string(),
    countingMethod: z.string(),
    targetValue: z.number().int(),
    rewards: z.array(RewardItemSchema),
    rewardTiers: z.array(TaskRewardTierSchema).openapi({
      description: "Staged reward tier definitions configured for this task.",
    }),
    autoClaim: z.boolean(),
    navigation: z
      .object({
        type: z.string(),
        target: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        label: z.string().optional(),
      })
      .nullable(),
    sortOrder: z.number().int(),
    // Progress fields
    currentValue: z.number().int(),
    isCompleted: z.boolean(),
    completedAt: z.string().nullable(),
    claimedAt: z.string().nullable(),
    // Tier claim state (aliases already claimed this period)
    claimedTierAliases: z.array(z.string()).openapi({
      description:
        "Tier aliases the user has already claimed this period. Stale (past-period) rows are excluded.",
    }),
    // Prerequisite status
    prerequisitesMet: z.boolean(),
    // Assignment info (null for broadcast tasks; non-null only for
    // assigned-visibility tasks that are active for this user).
    assignment: z
      .object({
        assignedAt: z.string(),
        expiresAt: z.string().nullable(),
        source: z.string(),
      })
      .nullable()
      .openapi({
        description:
          "Present when the task has visibility='assigned' and the user has an active assignment. Null otherwise.",
      }),
  })
  .openapi("TaskClientView");

export const ClientTaskListResponseSchema = z
  .object({ items: z.array(ClientTaskViewSchema) })
  .openapi("TaskClientList");

export const EventResponseSchema = z
  .object({
    processed: z.number().int().openapi({
      description: "Number of task definitions that matched and were updated.",
    }),
  })
  .openapi("TaskEventResponse");

export const ClaimResponseSchema = z
  .object({
    taskId: z.string(),
    grantedRewards: z.array(RewardItemSchema),
    claimedAt: z.string(),
  })
  .openapi("TaskClaimResponse");

export const ClaimTierResponseSchema = z
  .object({
    taskId: z.string(),
    tierAlias: z.string(),
    grantedRewards: z.array(RewardItemSchema),
    claimedAt: z.string(),
  })
  .openapi("TaskClaimTierResponse");


// ─── Assignment bodies ────────────────────────────────────────────

/**
 * Soft cap on batch assignment size. Neon HTTP has no transactions and
 * each request is a single round-trip — the cap keeps latency bounded
 * and gives backpressure to accidental "assign to everyone" scripts.
 * Callers with larger cohorts must chunk.
 */
export const ASSIGNMENT_BATCH_MAX = 1000;

const EndUserIdSchema = z.string().min(1).max(256);

export const AssignTaskBodySchema = z
  .object({
    endUserIds: z
      .array(EndUserIdSchema)
      .min(1)
      .max(ASSIGNMENT_BATCH_MAX)
      .openapi({
        description: `Target end-user ids. 1..${ASSIGNMENT_BATCH_MAX} per call — chunk larger cohorts.`,
      }),
    source: z.enum(TASK_ASSIGNMENT_SOURCES).optional().openapi({
      description:
        "Who/what is performing the assignment. Defaults to 'manual' when omitted.",
    }),
    sourceRef: z.string().min(1).max(256).nullable().optional().openapi({
      description:
        "Free-form caller-defined pointer. e.g. a CRM request id, rule alias, admin user id.",
    }),
    expiresAt: z.string().datetime().nullable().optional().openapi({
      description:
        "Absolute ISO 8601 expiry. Mutually exclusive with ttlSeconds. Null keeps the assignment indefinite.",
    }),
    ttlSeconds: z.number().int().positive().optional().openapi({
      description:
        "Relative TTL in seconds. Mutually exclusive with expiresAt. Falls back to the definition's defaultAssignmentTtlSeconds when omitted.",
    }),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    allowReassign: z.boolean().optional().openapi({
      description:
        "If true, refresh assignedAt/expiresAt/source on already-assigned rows. Default false (no-op on existing active rows; revive revoked rows).",
    }),
  })
  .superRefine((val, ctx) => {
    if (val.expiresAt && val.ttlSeconds) {
      ctx.addIssue({
        code: "custom",
        path: ["ttlSeconds"],
        message: "expiresAt and ttlSeconds are mutually exclusive",
      });
    }
  })
  .openapi("TaskAssignBody");

export const RevokeAssignmentParamsSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Task definition id or alias.",
    }),
  endUserId: EndUserIdSchema.openapi({
    param: { name: "endUserId", in: "path" },
  }),
});

export const ListAssignmentsQuerySchema = z.object({
  endUserId: EndUserIdSchema.optional(),
  activeOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const AssignmentResponseSchema = z
  .object({
    taskId: z.string(),
    endUserId: z.string(),
    organizationId: z.string(),
    assignedAt: z.string(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    source: z.string(),
    sourceRef: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TaskAssignment");

export const AssignmentListResponseSchema = z
  .object({ items: z.array(AssignmentResponseSchema) })
  .openapi("TaskAssignmentList");

export const AssignBatchResponseSchema = z
  .object({
    assigned: z.number().int(),
    skipped: z.number().int(),
    items: z.array(AssignmentResponseSchema),
  })
  .openapi("TaskAssignBatchResponse");

// ─── Input types ──────────────────────────────────────────────────

export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;
export type CreateDefinitionInput = z.input<typeof CreateDefinitionSchema>;
export type UpdateDefinitionInput = z.input<typeof UpdateDefinitionSchema>;
export type AssignTaskInput = z.input<typeof AssignTaskBodySchema>;
