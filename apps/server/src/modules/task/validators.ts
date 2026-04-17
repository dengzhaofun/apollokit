/**
 * Zod schemas for the task module.
 *
 * Shared between HTTP validation and service-layer input typing.
 * `.openapi()` metadata is attached for the Scalar UI at /docs.
 */

import { z } from "@hono/zod-openapi";

import { CATEGORY_SCOPES, COUNTING_METHODS, TASK_PERIODS } from "./types";

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
  type: z.enum(["item", "entity"]),
  id: z.string(),
  count: z.number().int().positive(),
});

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
    }
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
    targetValue: z.number().int().positive().optional(),
    parentProgressValue: z.number().int().positive().optional(),
    prerequisiteTaskIds: z.array(z.string().uuid()).optional(),
    rewards: z.array(RewardItemSchema).min(1).optional(),
    autoClaim: z.boolean().optional(),
    navigation: NavigationSchema,
    isActive: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
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

export const ClientUserHashBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    userHash: z.string().optional().openapi({
      description:
        "HMAC-SHA256(endUserId, clientSecret). Required unless dev mode.",
    }),
  })
  .openapi("TaskClientUserHashBody");

export const EventBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    userHash: z.string().optional(),
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
    endUserId: z.string().min(1).max(256),
    userHash: z.string().optional(),
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

export const ClaimBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    userHash: z.string().optional(),
  })
  .openapi("TaskClaimBody");

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

export const CategoryListResponseSchema = z
  .object({ items: z.array(CategoryResponseSchema) })
  .openapi("TaskCategoryList");

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
    targetValue: z.number().int(),
    parentProgressValue: z.number().int(),
    prerequisiteTaskIds: z.array(z.string()),
    rewards: z.array(RewardItemSchema),
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
    sortOrder: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TaskDefinition");

export const DefinitionListResponseSchema = z
  .object({ items: z.array(DefinitionResponseSchema) })
  .openapi("TaskDefinitionList");

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
    // Prerequisite status
    prerequisitesMet: z.boolean(),
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

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("TaskErrorResponse");

// ─── Input types ──────────────────────────────────────────────────

export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;
export type CreateDefinitionInput = z.input<typeof CreateDefinitionSchema>;
export type UpdateDefinitionInput = z.input<typeof UpdateDefinitionSchema>;
