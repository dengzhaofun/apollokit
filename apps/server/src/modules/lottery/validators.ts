import { z } from "@hono/zod-openapi";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description: "Optional human-readable key, unique within the organization.",
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const ItemEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const ItemEntryResponseSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int(),
});

// ─── Pool ──────────────────────────────────────────────────────

export const CreatePoolSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Lucky Wheel" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    costPerPull: z.array(ItemEntrySchema).default([]).openapi({
      description:
        "Cost per single pull. Empty array for item-triggered pools.",
    }),
    isActive: z.boolean().optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    globalPullLimit: z.number().int().positive().nullable().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryCreatePool");

export const UpdatePoolSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    costPerPull: z.array(ItemEntrySchema).optional(),
    isActive: z.boolean().optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    globalPullLimit: z.number().int().positive().nullable().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryUpdatePool");

export type CreatePoolInput = z.input<typeof CreatePoolSchema>;
export type UpdatePoolInput = z.input<typeof UpdatePoolSchema>;

// ─── Tier ──────────────────────────────────────────────────────

export const CreateTierSchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "SSR" }),
    alias: AliasSchema.nullable().optional(),
    baseWeight: z.number().int().positive().openapi({
      description: "Relative weight for tier selection.",
      example: 6,
    }),
    color: z.string().max(20).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryCreateTier");

export const UpdateTierSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    alias: AliasSchema.nullable().optional(),
    baseWeight: z.number().int().positive().optional(),
    color: z.string().max(20).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryUpdateTier");

export type CreateTierInput = z.input<typeof CreateTierSchema>;
export type UpdateTierInput = z.input<typeof UpdateTierSchema>;

// ─── Prize ─────────────────────────────────────────────────────

export const CreatePrizeSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "100 Diamonds" }),
    description: z.string().max(2000).nullable().optional(),
    rewardItems: z.array(ItemEntrySchema).openapi({
      description: "Items granted on win. Empty array for 'Better luck next time'.",
    }),
    weight: z.number().int().positive().default(100).openapi({
      description: "Selection weight (relative).",
    }),
    isRateUp: z.boolean().optional(),
    rateUpWeight: z.number().int().nonnegative().optional(),
    globalStockLimit: z.number().int().positive().nullable().optional(),
    fallbackPrizeId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryCreatePrize");

export const UpdatePrizeSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    rewardItems: z.array(ItemEntrySchema).optional(),
    weight: z.number().int().positive().optional(),
    isRateUp: z.boolean().optional(),
    rateUpWeight: z.number().int().nonnegative().optional(),
    globalStockLimit: z.number().int().positive().nullable().optional(),
    fallbackPrizeId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryUpdatePrize");

export type CreatePrizeInput = z.input<typeof CreatePrizeSchema>;
export type UpdatePrizeInput = z.input<typeof UpdatePrizeSchema>;

// ─── Pity Rule ─────────────────────────────────────────────────

export const CreatePityRuleSchema = z
  .object({
    guaranteeTierId: z.string().uuid().openapi({
      description: "The tier this rule guarantees.",
    }),
    hardPityThreshold: z.number().int().positive().openapi({
      description: "After this many pulls without the tier, force it.",
      example: 90,
    }),
    softPityStartAt: z.number().int().positive().nullable().optional().openapi({
      description: "Start boosting tier weight after this many pulls.",
      example: 74,
    }),
    softPityWeightIncrement: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .openapi({
        description: "Extra weight added per pull after soft pity starts.",
        example: 60,
      }),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryCreatePityRule");

export const UpdatePityRuleSchema = z
  .object({
    hardPityThreshold: z.number().int().positive().optional(),
    softPityStartAt: z.number().int().positive().nullable().optional(),
    softPityWeightIncrement: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("LotteryUpdatePityRule");

export type CreatePityRuleInput = z.input<typeof CreatePityRuleSchema>;
export type UpdatePityRuleInput = z.input<typeof UpdatePityRuleSchema>;

// ─── Pull ──────────────────────────────────────────────────────

export const PullSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("LotteryPullRequest");

export const MultiPullSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    count: z.number().int().min(2).max(100).openapi({
      description: "Number of pulls to execute.",
      example: 10,
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("LotteryMultiPullRequest");

export const ClientPullSchema = z
  .object({
    poolId: z.string().uuid().openapi({
      description: "The lottery pool to pull from.",
    }),
    endUserId: z.string().min(1).max(256),
    userHash: z.string().optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ClientLotteryPullRequest");

export const ClientMultiPullSchema = z
  .object({
    poolId: z.string().uuid(),
    endUserId: z.string().min(1).max(256),
    count: z.number().int().min(2).max(100),
    userHash: z.string().optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ClientLotteryMultiPullRequest");

// ─── Params ────────────────────────────────────────────────────

export const KeyParamSchema = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Id or alias.",
  }),
});

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "UUID.",
  }),
});

export const PoolKeyParamSchema = z.object({
  poolKey: z.string().min(1).openapi({
    param: { name: "poolKey", in: "path" },
    description: "Pool id or alias.",
  }),
});

export const TierIdParamSchema = z.object({
  tierId: z.string().min(1).openapi({
    param: { name: "tierId", in: "path" },
    description: "Tier UUID.",
  }),
});

export const PrizeIdParamSchema = z.object({
  prizeId: z.string().min(1).openapi({
    param: { name: "prizeId", in: "path" },
    description: "Prize UUID.",
  }),
});

export const RuleIdParamSchema = z.object({
  ruleId: z.string().min(1).openapi({
    param: { name: "ruleId", in: "path" },
    description: "Pity rule UUID.",
  }),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).openapi({
    param: { name: "endUserId", in: "path" },
    description: "End user id.",
  }),
});

// ─── Response schemas ──────────────────────────────────────────

export const LotteryPoolResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    costPerPull: z.array(ItemEntryResponseSchema),
    isActive: z.boolean(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    globalPullLimit: z.number().int().nullable(),
    globalPullCount: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LotteryPool");

export const LotteryTierResponseSchema = z
  .object({
    id: z.string(),
    poolId: z.string(),
    organizationId: z.string(),
    name: z.string(),
    alias: z.string().nullable(),
    baseWeight: z.number().int(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LotteryTier");

export const LotteryPrizeResponseSchema = z
  .object({
    id: z.string(),
    tierId: z.string().nullable(),
    poolId: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    rewardItems: z.array(ItemEntryResponseSchema),
    weight: z.number().int(),
    isRateUp: z.boolean(),
    rateUpWeight: z.number().int(),
    globalStockLimit: z.number().int().nullable(),
    globalStockUsed: z.number().int(),
    fallbackPrizeId: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LotteryPrize");

export const LotteryPityRuleResponseSchema = z
  .object({
    id: z.string(),
    poolId: z.string(),
    organizationId: z.string(),
    guaranteeTierId: z.string(),
    hardPityThreshold: z.number().int(),
    softPityStartAt: z.number().int().nullable(),
    softPityWeightIncrement: z.number().int().nullable(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LotteryPityRule");

export const LotteryUserStateResponseSchema = z
  .object({
    poolId: z.string(),
    endUserId: z.string(),
    totalPullCount: z.number().int(),
    pityCounters: z.record(z.string(), z.number()),
  })
  .openapi("LotteryUserState");

const PullResultEntrySchema = z.object({
  batchIndex: z.number().int(),
  prizeId: z.string(),
  prizeName: z.string(),
  tierId: z.string().nullable(),
  tierName: z.string().nullable(),
  rewardItems: z.array(ItemEntryResponseSchema),
  pityTriggered: z.boolean(),
  pityRuleId: z.string().nullable(),
});

export const PullResultResponseSchema = z
  .object({
    batchId: z.string(),
    poolId: z.string(),
    endUserId: z.string(),
    costItems: z.array(ItemEntryResponseSchema),
    pulls: z.array(PullResultEntrySchema),
  })
  .openapi("LotteryPullResult");

export const PoolListResponseSchema = z
  .object({ items: z.array(LotteryPoolResponseSchema) })
  .openapi("LotteryPoolList");

export const TierListResponseSchema = z
  .object({ items: z.array(LotteryTierResponseSchema) })
  .openapi("LotteryTierList");

export const PrizeListResponseSchema = z
  .object({ items: z.array(LotteryPrizeResponseSchema) })
  .openapi("LotteryPrizeList");

export const PityRuleListResponseSchema = z
  .object({ items: z.array(LotteryPityRuleResponseSchema) })
  .openapi("LotteryPityRuleList");

export const PullLogResponseSchema = z
  .object({
    id: z.string(),
    poolId: z.string(),
    endUserId: z.string(),
    batchId: z.string(),
    batchIndex: z.number().int(),
    prizeId: z.string(),
    tierId: z.string().nullable(),
    tierName: z.string().nullable(),
    prizeName: z.string(),
    rewardItems: z.array(ItemEntryResponseSchema),
    pityTriggered: z.boolean(),
    pityRuleId: z.string().nullable(),
    costItems: z.array(ItemEntryResponseSchema),
    createdAt: z.string(),
  })
  .openapi("LotteryPullLog");

export const PullLogListResponseSchema = z
  .object({ items: z.array(PullLogResponseSchema) })
  .openapi("LotteryPullLogList");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("LotteryErrorResponse");
