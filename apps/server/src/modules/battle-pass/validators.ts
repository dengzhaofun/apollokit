/**
 * Zod schemas for the battle-pass module.
 *
 * 共用于 HTTP I/O 和 service I/O 的输入校验。`.openapi()` 注解让
 * Scalar 在 /docs 正确渲染。
 */

import { z } from "@hono/zod-openapi";

import {
  BATTLE_PASS_CURVE_TYPES,
  BATTLE_PASS_TASK_CATEGORIES,
  BATTLE_PASS_TIER_GRANT_SOURCES,
} from "./types";

const CodeRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const RewardEntrySchema = z
  .object({
    type: z.enum(["item", "entity", "currency"]),
    id: z.string().min(1),
    count: z.number().int().positive(),
  })
  .openapi("RewardEntry");

const TierCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(CodeRegex)
  .openapi({
    description:
      "档位 code。[a-z0-9-_] 开头 [a-z0-9-_]。约定 'free' 为免费档。",
  });

const LevelCurveSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("uniform"),
      xpPerLevel: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("custom"),
      thresholds: z.array(z.number().int().nonnegative()).min(1),
    }),
    z.object({
      type: z.literal("arithmetic"),
      base: z.number().int().positive(),
      step: z.number().int(),
    }),
  ])
  .openapi("BattlePassLevelCurve");

const TierDefSchema = z
  .object({
    code: TierCodeSchema,
    order: z.number().int().nonnegative(),
    priceSku: z.string().nullable(),
    displayMeta: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("BattlePassTier");

const LevelRewardSchema = z
  .object({
    level: z.number().int().positive(),
    rewards: z.record(z.string(), z.array(RewardEntrySchema)),
  })
  .openapi("BattlePassLevelReward");

const BonusMilestoneSchema = z
  .object({
    atLevel: z.number().int().positive(),
    requiresTier: TierCodeSchema,
    rewards: z.array(RewardEntrySchema).min(1),
    displayName: z.string().min(1).max(200),
  })
  .openapi("BattlePassBonusMilestone");

// ─── Create / update config ─────────────────────────────────────

export const CreateConfigSchema = z
  .object({
    activityId: z.string().uuid(),
    code: z.string().min(1).max(64).regex(CodeRegex),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    maxLevel: z.number().int().positive().max(1000),
    levelCurve: LevelCurveSchema,
    tiers: z.array(TierDefSchema).min(1).max(10),
    levelRewards: z.array(LevelRewardSchema),
    bonusMilestones: z.array(BonusMilestoneSchema).optional(),
    allowLevelPurchase: z.boolean().optional(),
    levelPurchasePriceSku: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const tierCodes = new Set(val.tiers.map((t) => t.code));
    if (tierCodes.size !== val.tiers.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: "tier codes must be unique within a season",
      });
    }
    if (!tierCodes.has("free")) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: "a 'free' tier is required",
      });
    }
    if (val.levelCurve.type === "custom") {
      if (val.levelCurve.thresholds.length !== val.maxLevel) {
        ctx.addIssue({
          code: "custom",
          path: ["levelCurve", "thresholds"],
          message: `custom thresholds length must equal maxLevel (${val.maxLevel})`,
        });
      }
      // 保证单调递增
      for (let i = 1; i < val.levelCurve.thresholds.length; i++) {
        if (
          val.levelCurve.thresholds[i]! <= val.levelCurve.thresholds[i - 1]!
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["levelCurve", "thresholds", i],
            message: "thresholds must be strictly increasing",
          });
          break;
        }
      }
    }
    for (const lr of val.levelRewards) {
      if (lr.level > val.maxLevel) {
        ctx.addIssue({
          code: "custom",
          path: ["levelRewards"],
          message: `level ${lr.level} exceeds maxLevel ${val.maxLevel}`,
        });
      }
      for (const tc of Object.keys(lr.rewards)) {
        if (!tierCodes.has(tc)) {
          ctx.addIssue({
            code: "custom",
            path: ["levelRewards"],
            message: `unknown tier code in level rewards: ${tc}`,
          });
        }
      }
    }
    for (const bm of val.bonusMilestones ?? []) {
      if (bm.atLevel > val.maxLevel) {
        ctx.addIssue({
          code: "custom",
          path: ["bonusMilestones"],
          message: `milestone atLevel ${bm.atLevel} exceeds maxLevel`,
        });
      }
      if (!tierCodes.has(bm.requiresTier)) {
        ctx.addIssue({
          code: "custom",
          path: ["bonusMilestones"],
          message: `milestone requiresTier unknown: ${bm.requiresTier}`,
        });
      }
    }
  })
  .openapi("BattlePassCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    maxLevel: z.number().int().positive().max(1000).optional(),
    levelCurve: LevelCurveSchema.optional(),
    tiers: z.array(TierDefSchema).min(1).max(10).optional(),
    levelRewards: z.array(LevelRewardSchema).optional(),
    bonusMilestones: z.array(BonusMilestoneSchema).optional(),
    allowLevelPurchase: z.boolean().optional(),
    levelPurchasePriceSku: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("BattlePassUpdateConfig");

// ─── Bind tasks ─────────────────────────────────────────────────

export const BindTasksSchema = z
  .object({
    /** Replace 模式 —— 整体替换本季的 task 绑定。 */
    bindings: z
      .array(
        z.object({
          taskDefinitionId: z.string().uuid(),
          xpReward: z.number().int().positive(),
          category: z.enum(BATTLE_PASS_TASK_CATEGORIES),
          weekIndex: z.number().int().nonnegative().nullable().optional(),
          sortOrder: z.number().int().nonnegative().optional(),
        }),
      )
      .max(500),
  })
  .openapi("BattlePassBindTasks");

// ─── Grant tier / claim ─────────────────────────────────────────

export const GrantTierSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    tierCode: TierCodeSchema,
    source: z.enum(BATTLE_PASS_TIER_GRANT_SOURCES),
    externalOrderId: z.string().max(256).nullable().optional(),
  })
  .openapi("BattlePassGrantTier");

export const ClaimLevelSchema = z
  .object({
    level: z.number().int().positive(),
    tierCode: TierCodeSchema,
  })
  .openapi("BattlePassClaimLevel");

// ─── Path / query params ────────────────────────────────────────

export const SeasonIdParamSchema = z.object({
  seasonId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "seasonId", in: "path" },
      description: "Season config id.",
    }),
});

export const ConfigIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Season config id.",
    }),
});

// ─── Response schemas ───────────────────────────────────────────

export const BattlePassConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    activityId: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    maxLevel: z.number().int(),
    levelCurve: LevelCurveSchema,
    tiers: z.array(TierDefSchema),
    levelRewards: z.array(LevelRewardSchema),
    bonusMilestones: z.array(BonusMilestoneSchema),
    allowLevelPurchase: z.boolean(),
    levelPurchasePriceSku: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("BattlePassConfig");

export const BattlePassConfigListSchema = z
  .object({
    items: z.array(BattlePassConfigResponseSchema),
  })
  .openapi("BattlePassConfigList");

export const BattlePassSeasonTaskResponseSchema = z
  .object({
    id: z.string(),
    seasonId: z.string(),
    taskDefinitionId: z.string(),
    xpReward: z.number().int(),
    category: z.enum(BATTLE_PASS_TASK_CATEGORIES),
    weekIndex: z.number().int().nullable(),
    sortOrder: z.number().int(),
  })
  .openapi("BattlePassSeasonTask");

export const BattlePassSeasonTaskListSchema = z
  .object({
    items: z.array(BattlePassSeasonTaskResponseSchema),
  })
  .openapi("BattlePassSeasonTaskList");

export const BattlePassAggregateViewSchema = z
  .object({
    season: z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      maxLevel: z.number().int(),
      tiers: z.array(TierDefSchema),
      levelCurve: LevelCurveSchema,
    }),
    progress: z.object({
      currentXp: z.number().int(),
      currentLevel: z.number().int(),
      xpToNextLevel: z.number().int().nullable(),
      ownedTiers: z.array(z.string()),
    }),
    claimable: z.array(
      z.object({
        level: z.number().int(),
        tierCode: z.string(),
        rewardEntries: z.array(RewardEntrySchema),
      }),
    ),
    taskBindings: z.array(
      BattlePassSeasonTaskResponseSchema.omit({ id: true, seasonId: true }),
    ),
  })
  .openapi("BattlePassAggregateView");

/** Admin debug query: `?endUserId=...`. */
export const AdminAggregateQuerySchema = z.object({
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .openapi({
      param: { name: "endUserId", in: "query" },
      description:
        "The SaaS tenant's business user id — NOT the admin's Better Auth user id.",
    }),
});

export const BattlePassClaimOutcomeSchema = z
  .object({
    level: z.number().int(),
    tierCode: z.string(),
    idempotent: z.boolean(),
    rewardEntries: z.array(RewardEntrySchema),
  })
  .openapi("BattlePassClaimOutcome");

export const BattlePassClaimResponseSchema = z
  .object({
    results: z.array(BattlePassClaimOutcomeSchema),
  })
  .openapi("BattlePassClaimResponse");

export const BattlePassGrantTierOutcomeSchema = z
  .object({
    idempotent: z.boolean(),
    ownedTiers: z.array(z.string()),
  })
  .openapi("BattlePassGrantTierOutcome");

// ─── Input types (derived from zod) ────────────────────────────

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;
export type BindTasksInput = z.input<typeof BindTasksSchema>;
export type GrantTierInput = z.input<typeof GrantTierSchema>;
export type ClaimLevelInput = z.input<typeof ClaimLevelSchema>;
