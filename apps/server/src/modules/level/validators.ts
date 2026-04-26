/**
 * Zod schemas for the level module.
 *
 * Shared between HTTP validation (routes.ts / client-routes.ts) and
 * service-layer input typing (`z.input<typeof ...>` below). `.openapi()`
 * metadata is attached so the Scalar UI at /docs renders helpful fields.
 *
 * The `UnlockRuleSchema` uses `z.lazy` for the recursive `all`/`any`
 * combinators — Zod resolves the thunk at validation time so circular
 * references work fine.
 *
 * `ClaimRewardsBodySchema` uses `.superRefine()` because `starTier` is
 * required only when `type === "star"` — field-level rules can't see
 * sibling values.
 */

import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { CLAIM_TYPES, LEVEL_STATUSES } from "./types";

// ─── Shared helpers ──────────────────────────────────────────────

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
    description: "Optional human-readable key, unique within its parent.",
    example: "world-1-1",
  });

const RewardItemSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

// `.openapi("LevelUnlockRule")` registers this lazy schema as a named
// component so zod-to-openapi emits a `$ref` at recursion sites instead
// of re-walking the schema. Without it, `isOptionalSchema` recurses
// forever on the self-reference and the whole `/openapi.json` 500s.
const UnlockRuleSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("auto") }),
    z.object({ type: z.literal("level_clear"), levelId: z.string() }),
    z.object({
      type: z.literal("level_stars"),
      levelId: z.string(),
      stars: z.number().int().min(1),
    }),
    z.object({ type: z.literal("stage_clear"), stageId: z.string() }),
    z.object({
      type: z.literal("star_threshold"),
      threshold: z.number().int().min(1),
    }),
    z.object({
      type: z.literal("all"),
      rules: z.array(UnlockRuleSchema).min(1),
    }),
    z.object({
      type: z.literal("any"),
      rules: z.array(UnlockRuleSchema).min(1),
    }),
  ]),
).openapi("LevelUnlockRule");

const StarRewardTierSchema = z.object({
  stars: z.number().int().min(1),
  rewards: z.array(RewardItemSchema).min(1),
});

// ─── Config CRUD ─────────────────────────────────────────────────

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Main Campaign" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().max(1024).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    hasStages: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().max(1024).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    hasStages: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelUpdateConfig");

export const ConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    coverImage: z.string().nullable(),
    icon: z.string().nullable(),
    hasStages: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LevelConfig");

export const ConfigListResponseSchema = pageOf(ConfigResponseSchema).openapi(
  "LevelConfigList",
);

// ─── Stage CRUD ──────────────────────────────────────────────────

export const CreateStageSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    unlockRule: UnlockRuleSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelCreateStage");

export const UpdateStageSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    unlockRule: UnlockRuleSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelUpdateStage");

export const StageResponseSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    unlockRule: z.unknown().nullable(),
    sortOrder: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LevelStage");

export const StageListResponseSchema = z
  .object({
    items: z.array(StageResponseSchema),
  })
  .openapi("LevelStageList");

// ─── Level CRUD ──────────────────────────────────────────────────

export const CreateLevelSchema = z
  .object({
    stageId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    difficulty: z.string().max(64).nullable().optional(),
    maxStars: z.number().int().min(0).optional(),
    unlockRule: UnlockRuleSchema.nullable().optional(),
    clearRewards: z.array(RewardItemSchema).nullable().optional(),
    starRewards: z.array(StarRewardTierSchema).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelCreateLevel");

export const UpdateLevelSchema = z
  .object({
    stageId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    difficulty: z.string().max(64).nullable().optional(),
    maxStars: z.number().int().min(0).optional(),
    unlockRule: UnlockRuleSchema.nullable().optional(),
    clearRewards: z.array(RewardItemSchema).nullable().optional(),
    starRewards: z.array(StarRewardTierSchema).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LevelUpdateLevel");

export const LevelResponseSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    stageId: z.string().nullable(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    difficulty: z.string().nullable(),
    maxStars: z.number().int(),
    unlockRule: z.unknown().nullable(),
    clearRewards: z.array(RewardItemSchema).nullable(),
    starRewards: z.array(StarRewardTierSchema).nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LevelLevel");

export const LevelListResponseSchema = z
  .object({
    items: z.array(LevelResponseSchema),
  })
  .openapi("LevelLevelList");

// ─── Shared input types ──────────────────────────────────────────

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;
export type CreateStageInput = z.input<typeof CreateStageSchema>;
export type UpdateStageInput = z.input<typeof UpdateStageSchema>;
export type CreateLevelInput = z.input<typeof CreateLevelSchema>;
export type UpdateLevelInput = z.input<typeof UpdateLevelSchema>;

// ─── Param schemas ───────────────────────────────────────────────

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
    .openapi({ param: { name: "id", in: "path" } }),
});

export const StageIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const LevelIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

// ─── Client body schemas ─────────────────────────────────────────

export const ReportClearBodySchema = z
  .object({
    stars: z.number().int().min(0).optional().openapi({
      description: "Number of stars earned on this clear (0 if omitted).",
    }),
    score: z.number().int().optional().openapi({
      description: "Score achieved on this clear.",
    }),
  })
  .openapi("LevelReportClearBody");

export const ClaimRewardsBodySchema = z
  .object({
    type: z.enum(CLAIM_TYPES).openapi({
      description: "What to claim: 'clear' for clear rewards, 'star' for a star reward tier.",
    }),
    starTier: z.number().int().min(1).optional().openapi({
      description:
        "The star count of the tier to claim. Required when type='star'.",
    }),
  })
  .superRefine((val, ctx) => {
    if (val.type === "star" && val.starTier == null) {
      ctx.addIssue({
        code: "custom",
        path: ["starTier"],
        message: "starTier is required when type='star'",
      });
    }
  })
  .openapi("LevelClaimRewardsBody");

// ─── Client response schemas ─────────────────────────────────────

export const ClientLevelViewSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    stageId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    difficulty: z.string().nullable(),
    maxStars: z.number().int(),
    sortOrder: z.number().int(),
    unlocked: z.boolean(),
    status: z.enum(LEVEL_STATUSES).nullable(),
    stars: z.number().int(),
    bestScore: z.number().int().nullable(),
    rewardsClaimed: z.boolean(),
    starRewardsClaimed: z.array(z.number().int()),
    clearRewards: z.array(RewardItemSchema).nullable(),
    starRewards: z.array(StarRewardTierSchema).nullable(),
  })
  .openapi("LevelClientLevelView");

export const ClientStageViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.number().int(),
    unlocked: z.boolean(),
    levels: z.array(ClientLevelViewSchema),
  })
  .openapi("LevelClientStageView");

export const ClientConfigOverviewSchema = z
  .object({
    config: ConfigResponseSchema,
    stages: z.array(ClientStageViewSchema),
    levels: z.array(ClientLevelViewSchema),
    totals: z.object({
      levelCount: z.number().int(),
      clearedCount: z.number().int(),
      totalStars: z.number().int(),
      maxPossibleStars: z.number().int(),
    }),
  })
  .openapi("LevelClientConfigOverview");

export const ClientConfigSummarySchema = z
  .object({
    config: ConfigResponseSchema,
    levelCount: z.number().int(),
    clearedCount: z.number().int(),
    totalStars: z.number().int(),
  })
  .openapi("LevelClientConfigSummary");

export const ClientConfigListResponseSchema = z
  .object({
    items: z.array(ClientConfigSummarySchema),
  })
  .openapi("LevelClientConfigList");

export const ReportClearResponseSchema = z
  .object({
    levelId: z.string(),
    stars: z.number().int(),
    bestScore: z.number().int().nullable(),
    firstClear: z.boolean(),
    newlyUnlocked: z.array(z.string()),
  })
  .openapi("LevelReportClearResponse");

export const ClaimRewardsResponseSchema = z
  .object({
    levelId: z.string(),
    type: z.enum(CLAIM_TYPES),
    grantedRewards: z.array(RewardItemSchema),
    claimedAt: z.string(),
  })
  .openapi("LevelClaimRewardsResponse");
