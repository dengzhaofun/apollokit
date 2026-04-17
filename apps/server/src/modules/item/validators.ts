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
    example: "gold",
  });

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

// ─── Category ───────────────────────────────────────────────────────

export const CreateCategorySchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Currency" }),
    alias: AliasSchema.nullable().optional(),
    icon: z.string().max(2000).nullable().optional().openapi({
      description: "Icon URL for this category.",
    }),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ItemCreateCategory");

export const UpdateCategorySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ItemUpdateCategory");

export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;

// ─── Definition ─────────────────────────────────────────────────────

export const CreateDefinitionSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Gold Coin" }),
    alias: AliasSchema.nullable().optional(),
    categoryId: z.string().uuid().nullable().optional().openapi({
      description: "FK to item_categories. null = uncategorized.",
    }),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional().openapi({
      description: "Icon URL for this item.",
    }),
    stackable: z.boolean().default(true),
    stackLimit: z.number().int().positive().nullable().optional().openapi({
      description:
        "Per-stack quantity cap. null = unlimited (currency). Ignored if stackable=false.",
    }),
    holdLimit: z.number().int().positive().nullable().optional().openapi({
      description:
        "Max total qty a user can own. null = unlimited. 1 = unique (hero).",
    }),
    isCurrency: z.boolean().optional().openapi({
      description:
        "Mark this definition as a currency. Enables currency-only pickers (e.g. storage-box accepted currencies).",
    }),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ItemCreateDefinition");

export const UpdateDefinitionSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(2000).nullable().optional(),
    stackable: z.boolean().optional(),
    stackLimit: z.number().int().positive().nullable().optional(),
    holdLimit: z.number().int().positive().nullable().optional(),
    isCurrency: z.boolean().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ItemUpdateDefinition");

export type CreateDefinitionInput = z.input<typeof CreateDefinitionSchema>;
export type UpdateDefinitionInput = z.input<typeof UpdateDefinitionSchema>;

// ─── Grant / Deduct ─────────────────────────────────────────────────

const GrantEntrySchema = z.object({
  definitionId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const GrantItemsSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    grants: z.array(GrantEntrySchema).min(1).openapi({
      description: "Array of items to grant.",
    }),
    source: z.string().min(1).max(128).openapi({
      description: "Source identifier for audit trail.",
      example: "admin_grant",
    }),
    sourceId: z.string().max(256).optional().openapi({
      description: "Optional source-specific ID for idempotency.",
    }),
  })
  .openapi("ItemGrantRequest");

export const DeductItemsSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    deductions: z.array(GrantEntrySchema).min(1).openapi({
      description: "Array of items to deduct.",
    }),
    source: z.string().min(1).max(128).openapi({
      description: "Source identifier for audit trail.",
      example: "exchange",
    }),
    sourceId: z.string().max(256).optional().openapi({
      description: "Optional source-specific ID for idempotency.",
    }),
  })
  .openapi("ItemDeductRequest");

export type GrantItemsInput = z.input<typeof GrantItemsSchema>;
export type DeductItemsInput = z.input<typeof DeductItemsSchema>;

// ─── Param schemas ──────────────────────────────────────────────────

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

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's business id.",
  }),
});

export const InventoryQuerySchema = z.object({
  definitionId: z.string().uuid().optional().openapi({
    param: { name: "definitionId", in: "query" },
    description: "Filter by definition ID.",
  }),
});

// ─── Response schemas ───────────────────────────────────────────────

export const ItemCategoryResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    icon: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ItemCategory");

export const ItemDefinitionResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    categoryId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    stackable: z.boolean(),
    stackLimit: z.number().int().nullable(),
    holdLimit: z.number().int().nullable(),
    isCurrency: z.boolean(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ItemDefinition");

const InventoryStackSchema = z.object({
  id: z.string(),
  quantity: z.number().int(),
  instanceData: z.unknown().nullable(),
});

export const InventoryViewSchema = z
  .object({
    definitionId: z.string(),
    definitionAlias: z.string().nullable(),
    definitionName: z.string(),
    icon: z.string().nullable(),
    stackable: z.boolean(),
    totalQuantity: z.number().int(),
    stacks: z.array(InventoryStackSchema),
  })
  .openapi("ItemInventoryView");

export const GrantResultSchema = z
  .object({
    grants: z.array(
      z.object({
        definitionId: z.string(),
        quantityBefore: z.number().int(),
        quantityAfter: z.number().int(),
        delta: z.number().int(),
      }),
    ),
  })
  .openapi("ItemGrantResult");

export const DeductResultSchema = z
  .object({
    deductions: z.array(
      z.object({
        definitionId: z.string(),
        quantityBefore: z.number().int(),
        quantityAfter: z.number().int(),
        delta: z.number().int(),
      }),
    ),
  })
  .openapi("ItemDeductResult");

export const BalanceResponseSchema = z
  .object({
    definitionId: z.string(),
    balance: z.number().int(),
  })
  .openapi("ItemBalance");

export const CategoryListResponseSchema = z
  .object({ items: z.array(ItemCategoryResponseSchema) })
  .openapi("ItemCategoryList");

export const DefinitionListResponseSchema = z
  .object({ items: z.array(ItemDefinitionResponseSchema) })
  .openapi("ItemDefinitionList");

export const InventoryListResponseSchema = z
  .object({ items: z.array(InventoryViewSchema) })
  .openapi("ItemInventoryList");

// ─── Use Item ─────────────────────────────────────────────────────

export const UseItemSchema = z
  .object({
    definitionId: z.string().uuid().openapi({
      description: "The item definition to use.",
    }),
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
    }),
    userHash: z.string().optional(),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("UseItemRequest");

const ItemEntryResponseSchema = z.object({
  definitionId: z.string(),
  quantity: z.number().int(),
});

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

export const UseItemResponseSchema = z
  .object({
    definitionId: z.string(),
    definitionName: z.string(),
    lotteryResult: z
      .object({
        batchId: z.string(),
        poolId: z.string(),
        endUserId: z.string(),
        costItems: z.array(ItemEntryResponseSchema),
        pulls: z.array(PullResultEntrySchema),
      })
      .nullable(),
  })
  .openapi("UseItemResult");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("ItemErrorResponse");
