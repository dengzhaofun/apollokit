/**
 * Zod schemas for the check-in module.
 *
 * These schemas are used for BOTH service input validation and HTTP
 * request/response bodies. `.openapi()` metadata is attached so Scalar
 * auto-renders fields in `/docs`.
 *
 * Rule for target validation: `target` must be a positive integer and
 * must fit within the chosen `resetMode`:
 *   - week  → 1..7
 *   - month → 1..31
 *   - none  → any positive integer (no upper bound — represents a
 *             cumulative goal across all time, could legitimately be
 *             in the hundreds)
 *
 * Cross-field validation is done via `.superRefine()` on the create
 * schema — Zod's per-field chained rules can't see sibling values.
 */

import { z } from "@hono/zod-openapi";

import { RESET_MODES } from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const TimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .default("UTC")
  .openapi({
    description: "IANA timezone id, e.g. 'Asia/Shanghai'.",
    example: "Asia/Shanghai",
  });

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message:
      "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description:
      "Optional human-readable key, unique within the project.",
    example: "daily",
  });

const ResetModeSchema = z
  .enum(RESET_MODES)
  .openapi({
    description:
      "Cycle reset behavior: 'none' (cumulative), 'week' (natural week), 'month' (natural month).",
  });

const WeekStartsOnSchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .default(1)
  .openapi({
    description: "0=Sunday ... 6=Saturday. Only meaningful when resetMode='week'.",
  });

const TargetSchema = z
  .number()
  .int()
  .positive()
  .nullable()
  .optional()
  .openapi({
    description:
      "Optional per-cycle goal in days. null means no target (infinite check-in, only tracks days).",
  });

function validateTargetForMode(
  target: number | null | undefined,
  mode: (typeof RESET_MODES)[number],
  ctx: z.RefinementCtx,
) {
  if (target === null || target === undefined) return;
  if (mode === "week" && (target < 1 || target > 7)) {
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: "target for resetMode='week' must be between 1 and 7",
    });
  }
  if (mode === "month" && (target < 1 || target > 31)) {
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: "target for resetMode='month' must be between 1 and 31",
    });
  }
}

/**
 * Service-layer input types are derived from zod schemas via `z.input` so
 * there is a single source of truth for "what the service accepts". We
 * use `z.input` (not `z.infer`) because we want the pre-parse shape —
 * optional/defaulted fields stay optional so non-HTTP callers (future
 * cron jobs / MCP / tests) can omit them.
 */
const ActivityIdSchema = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .openapi({
    description:
      "When set, the config is an activity-scoped check-in that belongs to the given activity. Null = standalone.",
  });

const ActivityNodeIdSchema = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .openapi({
    description:
      "When set alongside activityId, points at the specific activity node this config is mounted on.",
  });

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Daily Check-In" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    resetMode: ResetModeSchema,
    weekStartsOn: WeekStartsOnSchema.optional(),
    target: TargetSchema,
    timezone: TimezoneSchema.optional(),
    isActive: z.boolean().optional(),
    activityId: ActivityIdSchema,
    activityNodeId: ActivityNodeIdSchema,
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    validateTargetForMode(val.target ?? null, val.resetMode, ctx);
  })
  .openapi("CheckInCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    weekStartsOn: WeekStartsOnSchema.optional(),
    target: TargetSchema,
    timezone: TimezoneSchema.optional(),
    isActive: z.boolean().optional(),
    activityId: ActivityIdSchema,
    activityNodeId: ActivityNodeIdSchema,
    metadata: MetadataSchema,
  })
  .openapi("CheckInUpdateConfig");

/** Shared input types — derived from zod, used by both HTTP and service. */
export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

export const ConfigKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Config id or alias.",
    }),
});

export const ConfigIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Config id.",
    }),
});

export const UserStateParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Config id or alias.",
    }),
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .openapi({
      param: { name: "endUserId", in: "path" },
      description:
        "The SaaS tenant's business user id — NOT the admin's Better Auth user id.",
    }),
});

export const CheckInBodySchema = z
  .object({
    endUserId: z
      .string()
      .min(1)
      .max(256)
      .openapi({
        description:
          "The SaaS tenant's business user id — NOT the admin's Better Auth user id.",
        example: "biz-user-42",
      }),
  })
  .openapi("CheckInRequest");

export const CheckInConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    resetMode: ResetModeSchema,
    weekStartsOn: z.number().int(),
    target: z.number().int().nullable(),
    timezone: z.string(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CheckInConfig");

export const CheckInUserStateSchema = z
  .object({
    configId: z.string(),
    endUserId: z.string(),
    organizationId: z.string(),
    totalDays: z.number().int(),
    currentStreak: z.number().int(),
    longestStreak: z.number().int(),
    currentCycleKey: z.string().nullable(),
    currentCycleDays: z.number().int(),
    lastCheckInDate: z.string().nullable(),
    firstCheckInAt: z.string().nullable(),
    lastCheckInAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CheckInUserState");

export const CheckInUserStateViewSchema = z
  .object({
    state: CheckInUserStateSchema,
    target: z.number().int().nullable(),
    isCompleted: z.boolean(),
    remaining: z.number().int().nullable(),
  })
  .openapi("CheckInUserStateView");

const RewardItemSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

export const CheckInResultSchema = z
  .object({
    alreadyCheckedIn: z.boolean(),
    justCompleted: z.boolean(),
    state: CheckInUserStateSchema,
    target: z.number().int().nullable(),
    isCompleted: z.boolean(),
    remaining: z.number().int().nullable(),
    rewards: z.array(RewardItemSchema).nullable().optional(),
  })
  .openapi("CheckInResult");

// ─── Reward schemas ─────────────────────────────────────────────

export const CreateRewardSchema = z
  .object({
    dayNumber: z.number().int().positive().openapi({
      description: "Which day in the sequence (1-based).",
      example: 1,
    }),
    rewardItems: z.array(RewardItemSchema).min(1).openapi({
      description: "Items to grant on this day.",
    }),
    metadata: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional(),
  })
  .openapi("CheckInCreateReward");

export const UpdateRewardSchema = z
  .object({
    dayNumber: z.number().int().positive().optional(),
    rewardItems: z.array(RewardItemSchema).min(1).optional(),
    metadata: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional(),
  })
  .openapi("CheckInUpdateReward");

export const RewardIdParamSchema = z.object({
  rewardId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "rewardId", in: "path" },
      description: "Reward id.",
    }),
});

export const CheckInRewardResponseSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    organizationId: z.string(),
    dayNumber: z.number().int(),
    rewardItems: z.array(RewardItemSchema),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CheckInReward");

export const RewardListResponseSchema = z
  .object({
    items: z.array(CheckInRewardResponseSchema),
  })
  .openapi("CheckInRewardList");

export const ConfigListResponseSchema = z
  .object({
    items: z.array(CheckInConfigResponseSchema),
  })
  .openapi("CheckInConfigList");

export const UserStateListResponseSchema = z
  .object({
    items: z.array(CheckInUserStateSchema),
  })
  .openapi("CheckInUserStateList");
