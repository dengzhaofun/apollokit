/**
 * Zod schemas for the assist-pool module.
 *
 * Shared between service input validation and HTTP I/O. `.openapi()`
 * metadata feeds the Scalar doc page. `z.input` (not `z.infer`) is the
 * source of truth for service input types — optional/defaulted fields
 * stay optional so non-HTTP callers (cron, tests) can omit them.
 */

import { z } from "@hono/zod-openapi";

import { ASSIST_POLICY_KINDS, ASSIST_POOL_MODES, ASSIST_POOL_STATUSES } from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description:
      "Optional human-readable key, unique within the organization.",
    example: "cut-a-slice",
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const RewardItemSchema = z
  .object({
    type: z.enum(["item", "entity", "currency"]),
    id: z.string(),
    count: z.number().int().positive(),
  })
  .openapi("AssistPoolRewardItem");

const FixedPolicySchema = z
  .object({
    kind: z.literal("fixed"),
    amount: z.number().int().positive(),
  })
  .openapi("AssistPoolFixedPolicy");

const UniformPolicySchema = z
  .object({
    kind: z.literal("uniform"),
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .refine((v) => v.max >= v.min, {
    message: "uniform policy: max must be >= min",
    path: ["max"],
  })
  .openapi("AssistPoolUniformPolicy");

const DecayingPolicySchema = z
  .object({
    kind: z.literal("decaying"),
    base: z.number().int().positive(),
    tailRatio: z.number().min(0).max(1),
    tailFloor: z.number().int().positive(),
  })
  .openapi("AssistPoolDecayingPolicy");

const ContributionPolicySchema = z
  .discriminatedUnion("kind", [
    FixedPolicySchema,
    UniformPolicySchema,
    DecayingPolicySchema,
  ])
  .openapi("AssistPoolContributionPolicy");

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "砍一刀" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    mode: z.enum(ASSIST_POOL_MODES).default("decrement"),
    targetAmount: z.number().int().positive().openapi({
      description:
        "Total work to complete the pool. For mode='decrement' the instance starts here and counts down to 0. For mode='accumulate' it starts at 0 and grows here.",
    }),
    contributionPolicy: ContributionPolicySchema,
    perAssisterLimit: z.number().int().positive().default(1),
    initiatorCanAssist: z.boolean().default(false),
    expiresInSeconds: z.number().int().positive().default(86400),
    maxInstancesPerInitiator: z.number().int().positive().nullable().optional(),
    rewards: z.array(RewardItemSchema).default([]),
    isActive: z.boolean().default(true),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("AssistPoolCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    // `mode`, `targetAmount`, `contributionPolicy`, `expiresInSeconds` are
    // deliberately immutable post-create — changing them mid-flight would
    // break every in-flight instance. Create a new config instead.
    perAssisterLimit: z.number().int().positive().optional(),
    initiatorCanAssist: z.boolean().optional(),
    maxInstancesPerInitiator: z.number().int().positive().nullable().optional(),
    rewards: z.array(RewardItemSchema).optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("AssistPoolUpdateConfig");

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
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      description: "Config id.",
    }),
});

export const InstanceIdParamSchema = z.object({
  instanceId: z
    .string()
    .uuid()
    .openapi({
      param: { name: "instanceId", in: "path" },
      description: "Instance id.",
    }),
});

export const AdminInitiateBodySchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "cut-a-slice",
    }),
    initiatorEndUserId: z.string().min(1).max(256),
  })
  .openapi("AssistPoolAdminInitiate");

export const AdminContributeBodySchema = z
  .object({
    assisterEndUserId: z.string().min(1).max(256),
  })
  .openapi("AssistPoolAdminContribute");

export const ClientInitiateBodySchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "cut-a-slice",
    }),
  })
  .openapi("AssistPoolClientInitiate");

export const ListInstancesQuerySchema = z.object({
  configKey: z.string().optional().openapi({
    param: { name: "configKey", in: "query" },
  }),
  initiatorEndUserId: z.string().optional().openapi({
    param: { name: "initiatorEndUserId", in: "query" },
  }),
  status: z
    .enum(ASSIST_POOL_STATUSES)
    .optional()
    .openapi({
      param: { name: "status", in: "query" },
    }),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .openapi({ param: { name: "limit", in: "query" } }),
});

export const ListConfigsQuerySchema = z.object({
  activityId: z
    .string()
    .uuid()
    .optional()
    .openapi({ param: { name: "activityId", in: "query" } }),
  includeActivity: z
    .enum(["true", "false"])
    .optional()
    .openapi({ param: { name: "includeActivity", in: "query" } }),
});

// ─── Response shapes ───────────────────────────────────────────────

export const AssistPoolConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    mode: z.enum(ASSIST_POOL_MODES),
    targetAmount: z.number().int(),
    contributionPolicy: ContributionPolicySchema,
    perAssisterLimit: z.number().int(),
    initiatorCanAssist: z.boolean(),
    expiresInSeconds: z.number().int(),
    maxInstancesPerInitiator: z.number().int().nullable(),
    rewards: z.array(RewardItemSchema),
    isActive: z.boolean(),
    activityId: z.string().nullable(),
    activityNodeId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("AssistPoolConfig");

export const AssistPoolInstanceResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    configId: z.string(),
    initiatorEndUserId: z.string(),
    status: z.enum(ASSIST_POOL_STATUSES),
    remaining: z.number().int(),
    targetAmount: z.number().int(),
    contributionCount: z.number().int(),
    expiresAt: z.string(),
    completedAt: z.string().nullable(),
    rewardGrantedAt: z.string().nullable(),
    version: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("AssistPoolInstance");

export const AssistPoolContributionResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    instanceId: z.string(),
    assisterEndUserId: z.string(),
    amount: z.number().int(),
    remainingAfter: z.number().int(),
    createdAt: z.string(),
  })
  .openapi("AssistPoolContribution");

export const AssistPoolContributeResultSchema = z
  .object({
    instance: AssistPoolInstanceResponseSchema,
    contribution: AssistPoolContributionResponseSchema,
    completed: z.boolean(),
    rewards: z.array(RewardItemSchema).nullable(),
  })
  .openapi("AssistPoolContributeResult");

export const AssistPoolConfigListSchema = z
  .object({ items: z.array(AssistPoolConfigResponseSchema) })
  .openapi("AssistPoolConfigList");

export const AssistPoolInstanceListSchema = z
  .object({ items: z.array(AssistPoolInstanceResponseSchema) })
  .openapi("AssistPoolInstanceList");

export const AssistPoolContributionListSchema = z
  .object({ items: z.array(AssistPoolContributionResponseSchema) })
  .openapi("AssistPoolContributionList");

