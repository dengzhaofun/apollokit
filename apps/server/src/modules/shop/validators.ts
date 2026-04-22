/**
 * Zod + OpenAPI schemas for the shop module.
 *
 * Two orthogonal cross-field constraints make these schemas non-trivial:
 *
 *   1. `timeWindowType` → mutually exclusive field groups on the product.
 *      Each product chooses exactly one of {none, absolute, relative, cyclic}
 *      and only the matching column group may be non-null. We enforce this
 *      with `superRefine` rather than `z.discriminatedUnion` so the same
 *      base object can power both create (required fields) and update
 *      (partial fields) schemas — discriminatedUnion would force two
 *      parallel schema ladders.
 *
 *   2. `productType` → whether `rewardItems` may be empty. `regular`
 *      products must have at least one reward; `growth_pack` products get
 *      rewards from stage claims and `rewardItems` may be empty.
 *
 * Both checks live in the same `refineProduct*` helpers so the failure
 * messages stay next to each other and update semantics stay consistent.
 */

import { z } from "@hono/zod-openapi";

// ─── Primitives ──────────────────────────────────────────────────

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
  .openapi({ description: "Arbitrary JSON blob for tenant-specific extensions." });

const ItemEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const ColorSchema = z
  .string()
  .regex(/^#?[0-9a-fA-F]{3,8}$/)
  .openapi({ description: "Badge color hex (with or without leading #)." });

const UrlOrPathSchema = z
  .string()
  .min(1)
  .max(2048)
  .openapi({ description: "URL or CDN path to an image asset." });

// ─── Enums ───────────────────────────────────────────────────────

const TimeWindowTypeSchema = z.enum([
  "none",
  "absolute",
  "relative",
  "cyclic",
]);

const EligibilityAnchorSchema = z.enum(["user_created", "first_purchase"]);

const RefreshCycleSchema = z.enum(["daily", "weekly", "monthly"]);

const ProductTypeSchema = z.enum(["regular", "growth_pack"]);

const GrowthTriggerTypeSchema = z.enum([
  "accumulated_cost",
  "accumulated_payment",
  "custom_metric",
  "manual",
]);

// ─── Category ────────────────────────────────────────────────────

export const CreateCategorySchema = z
  .object({
    parentId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    coverImage: UrlOrPathSchema.nullable().optional(),
    icon: UrlOrPathSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ShopCreateCategory");

export const UpdateCategorySchema = z
  .object({
    parentId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: UrlOrPathSchema.nullable().optional(),
    icon: UrlOrPathSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ShopUpdateCategory");

export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;

// ─── Tag ─────────────────────────────────────────────────────────

export const CreateTagSchema = z
  .object({
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    color: ColorSchema.nullable().optional(),
    icon: UrlOrPathSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ShopCreateTag");

export const UpdateTagSchema = z
  .object({
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    color: ColorSchema.nullable().optional(),
    icon: UrlOrPathSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("ShopUpdateTag");

export type CreateTagInput = z.input<typeof CreateTagSchema>;
export type UpdateTagInput = z.input<typeof UpdateTagSchema>;

// ─── Product ─────────────────────────────────────────────────────
//
// Flat shape + superRefine enforcement of:
//   a) productType=regular  ⇒ rewardItems.length >= 1
//      productType=growth_pack ⇒ rewardItems may be []
//   b) timeWindowType discriminator: exactly the matching column group
//      must be non-null, cross-group columns must be null/undefined.
//
// Update schemas reuse the same refinement — for PATCH we only enforce
// a branch's cross-group constraint when `timeWindowType` is present in
// the patch; otherwise we trust the DB state and the service layer.

function refineProductTimeWindow(
  data: {
    timeWindowType?: "none" | "absolute" | "relative" | "cyclic";
    availableFrom?: string | null;
    availableTo?: string | null;
    eligibilityAnchor?: "user_created" | "first_purchase" | null;
    eligibilityWindowSeconds?: number | null;
    refreshCycle?: "daily" | "weekly" | "monthly" | null;
    refreshLimit?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  const t = data.timeWindowType;
  if (!t) return;

  const hasAbsolute = data.availableFrom != null || data.availableTo != null;
  const hasRelative =
    data.eligibilityAnchor != null || data.eligibilityWindowSeconds != null;
  const hasCyclic = data.refreshCycle != null || data.refreshLimit != null;

  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  switch (t) {
    case "none":
      if (hasAbsolute)
        issue(
          "availableFrom",
          "availableFrom/availableTo must be null when timeWindowType='none'",
        );
      if (hasRelative)
        issue(
          "eligibilityAnchor",
          "eligibility fields must be null when timeWindowType='none'",
        );
      if (hasCyclic)
        issue(
          "refreshCycle",
          "refresh fields must be null when timeWindowType='none'",
        );
      break;
    case "absolute":
      if (!data.availableFrom || !data.availableTo)
        issue(
          "availableFrom",
          "availableFrom AND availableTo are required when timeWindowType='absolute'",
        );
      if (
        data.availableFrom &&
        data.availableTo &&
        new Date(data.availableFrom) >= new Date(data.availableTo)
      )
        issue("availableTo", "availableTo must be strictly after availableFrom");
      if (hasRelative)
        issue(
          "eligibilityAnchor",
          "eligibility fields must be null when timeWindowType='absolute'",
        );
      if (hasCyclic)
        issue(
          "refreshCycle",
          "refresh fields must be null when timeWindowType='absolute'",
        );
      break;
    case "relative":
      if (!data.eligibilityAnchor || data.eligibilityWindowSeconds == null)
        issue(
          "eligibilityAnchor",
          "eligibilityAnchor AND eligibilityWindowSeconds are required when timeWindowType='relative'",
        );
      if (
        data.eligibilityWindowSeconds != null &&
        data.eligibilityWindowSeconds <= 0
      )
        issue(
          "eligibilityWindowSeconds",
          "eligibilityWindowSeconds must be positive",
        );
      if (hasAbsolute)
        issue(
          "availableFrom",
          "availableFrom/availableTo must be null when timeWindowType='relative'",
        );
      if (hasCyclic)
        issue(
          "refreshCycle",
          "refresh fields must be null when timeWindowType='relative'",
        );
      break;
    case "cyclic":
      if (!data.refreshCycle || data.refreshLimit == null)
        issue(
          "refreshCycle",
          "refreshCycle AND refreshLimit are required when timeWindowType='cyclic'",
        );
      if (data.refreshLimit != null && data.refreshLimit <= 0)
        issue("refreshLimit", "refreshLimit must be positive");
      if (hasAbsolute)
        issue(
          "availableFrom",
          "availableFrom/availableTo must be null when timeWindowType='cyclic'",
        );
      if (hasRelative)
        issue(
          "eligibilityAnchor",
          "eligibility fields must be null when timeWindowType='cyclic'",
        );
      break;
  }
}

function refineProductRewardsVsType(
  data: {
    productType?: "regular" | "growth_pack";
    rewardItems?: Array<{ type: string; id: string; count: number }>;
  },
  ctx: z.RefinementCtx,
) {
  if (
    data.productType === "regular" &&
    (!data.rewardItems || data.rewardItems.length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rewardItems"],
      message: "rewardItems must not be empty when productType='regular'",
    });
  }
}

const ProductBaseShape = {
  categoryId: z.string().uuid().nullable().optional(),
  alias: AliasSchema.nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  coverImage: UrlOrPathSchema.nullable().optional(),
  galleryImages: z.array(UrlOrPathSchema).max(20).nullable().optional(),
  productType: ProductTypeSchema.default("regular"),
  costItems: z.array(ItemEntrySchema).min(1),
  rewardItems: z.array(ItemEntrySchema).default([]),
  timeWindowType: TimeWindowTypeSchema.default("none"),
  availableFrom: z.string().datetime().nullable().optional(),
  availableTo: z.string().datetime().nullable().optional(),
  eligibilityAnchor: EligibilityAnchorSchema.nullable().optional(),
  eligibilityWindowSeconds: z.number().int().positive().nullable().optional(),
  refreshCycle: RefreshCycleSchema.nullable().optional(),
  refreshLimit: z.number().int().positive().nullable().optional(),
  userLimit: z.number().int().positive().nullable().optional(),
  globalLimit: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  activityId: z.string().uuid().nullable().optional(),
  activityNodeId: z.string().uuid().nullable().optional(),
  metadata: MetadataSchema,
  tagIds: z.array(z.string().uuid()).max(32).optional(),
};

export const CreateProductSchema = z
  .object(ProductBaseShape)
  .superRefine((d, ctx) => {
    refineProductRewardsVsType(d, ctx);
    refineProductTimeWindow(d, ctx);
  })
  .openapi("ShopCreateProduct");

export const UpdateProductSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: UrlOrPathSchema.nullable().optional(),
    galleryImages: z.array(UrlOrPathSchema).max(20).nullable().optional(),
    productType: ProductTypeSchema.optional(),
    costItems: z.array(ItemEntrySchema).min(1).optional(),
    rewardItems: z.array(ItemEntrySchema).optional(),
    timeWindowType: TimeWindowTypeSchema.optional(),
    availableFrom: z.string().datetime().nullable().optional(),
    availableTo: z.string().datetime().nullable().optional(),
    eligibilityAnchor: EligibilityAnchorSchema.nullable().optional(),
    eligibilityWindowSeconds: z.number().int().positive().nullable().optional(),
    refreshCycle: RefreshCycleSchema.nullable().optional(),
    refreshLimit: z.number().int().positive().nullable().optional(),
    userLimit: z.number().int().positive().nullable().optional(),
    globalLimit: z.number().int().positive().nullable().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
    tagIds: z.array(z.string().uuid()).max(32).optional(),
  })
  .superRefine((d, ctx) => {
    refineProductRewardsVsType(d, ctx);
    refineProductTimeWindow(d, ctx);
  })
  .openapi("ShopUpdateProduct");

export type CreateProductInput = z.input<typeof CreateProductSchema>;
export type UpdateProductInput = z.input<typeof UpdateProductSchema>;

// ─── Growth stage ────────────────────────────────────────────────
//
// triggerConfig shape depends on triggerType. We validate per-type
// shape in a refinement instead of separate discriminated union branches
// so the update path can PATCH individual fields.

function refineTriggerConfig(
  data: {
    triggerType?:
      | "accumulated_cost"
      | "accumulated_payment"
      | "custom_metric"
      | "manual";
    triggerConfig?: Record<string, unknown> | null;
  },
  ctx: z.RefinementCtx,
) {
  const t = data.triggerType;
  const cfg = data.triggerConfig;
  if (!t) return;

  const issue = (message: string) =>
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["triggerConfig"],
      message,
    });

  switch (t) {
    case "accumulated_cost":
      if (!cfg || typeof cfg.threshold !== "number" || cfg.threshold <= 0)
        issue(
          "accumulated_cost requires triggerConfig.threshold (positive number)",
        );
      break;
    case "accumulated_payment":
      if (
        !cfg ||
        typeof cfg.itemDefinitionId !== "string" ||
        typeof cfg.threshold !== "number" ||
        cfg.threshold <= 0
      )
        issue(
          "accumulated_payment requires triggerConfig { itemDefinitionId, threshold }",
        );
      break;
    case "custom_metric":
      if (!cfg || typeof cfg.metric !== "string")
        issue("custom_metric requires triggerConfig.metric (string)");
      break;
    case "manual":
      // no config required
      break;
  }
}

export const CreateGrowthStageSchema = z
  .object({
    stageIndex: z.number().int().min(0),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    triggerType: GrowthTriggerTypeSchema,
    triggerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    rewardItems: z.array(ItemEntrySchema).min(1),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .superRefine(refineTriggerConfig)
  .openapi("ShopCreateGrowthStage");

export const UpdateGrowthStageSchema = z
  .object({
    stageIndex: z.number().int().min(0).optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    triggerType: GrowthTriggerTypeSchema.optional(),
    triggerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    rewardItems: z.array(ItemEntrySchema).min(1).optional(),
    sortOrder: z.number().int().optional(),
    metadata: MetadataSchema,
  })
  .superRefine(refineTriggerConfig)
  .openapi("ShopUpdateGrowthStage");

export const UpsertStagesSchema = z
  .object({
    stages: z.array(CreateGrowthStageSchema).min(1).max(32),
  })
  .openapi("ShopUpsertGrowthStages");

export type CreateGrowthStageInput = z.input<typeof CreateGrowthStageSchema>;
export type UpdateGrowthStageInput = z.input<typeof UpdateGrowthStageSchema>;
export type UpsertStagesInput = z.input<typeof UpsertStagesSchema>;

// ─── Purchase / Claim ────────────────────────────────────────────

export const PurchaseSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "Tenant's business user id.",
      example: "user-42",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ShopPurchaseRequest");

export const ClaimStageSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ShopClaimStageRequest");

export type PurchaseInput = z.input<typeof PurchaseSchema>;
export type ClaimStageInput = z.input<typeof ClaimStageSchema>;

// ─── Client-credentials (C-end) requests ─────────────────────────
//
// The caller's `endUserId` is populated by the `requireClientUser`
// middleware from the `x-end-user-id` header (HMAC verified there).
// Request bodies and query strings only carry action-specific payloads.

export const ClientPurchaseSchema = z
  .object({
    productKey: z.string().min(1).openapi({
      description: "Product id or alias.",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ShopClientPurchaseRequest");

export const ClientClaimStageSchema = z
  .object({
    stageId: z.string().uuid().openapi({
      description: "Growth stage to claim.",
    }),
    idempotencyKey: z.string().max(256).optional(),
  })
  .openapi("ShopClientClaimStageRequest");

export const ClientListUserProductsQuerySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
    productType: ProductTypeSchema.optional(),
  })
  .openapi("ShopClientListUserProductsQuery");

export type ClientPurchaseInput = z.input<typeof ClientPurchaseSchema>;
export type ClientClaimStageInput = z.input<typeof ClientClaimStageSchema>;
export type ClientListUserProductsQuery = z.input<
  typeof ClientListUserProductsQuerySchema
>;

// ─── List queries ────────────────────────────────────────────────

export const ListProductsQuerySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    includeDescendantCategories: z
      .enum(["true", "false"])
      .optional()
      .openapi({
        description:
          "When 'true' and categoryId is set, walk the category subtree.",
      }),
    tagId: z.string().uuid().optional(),
    productType: ProductTypeSchema.optional(),
    isActive: z.enum(["true", "false"]).optional(),
    timeWindowType: TimeWindowTypeSchema.optional(),
    availableAt: z.string().datetime().optional().openapi({
      description:
        "Restrict to products whose absolute time-window contains this instant.",
    }),
    activityId: z.string().uuid().optional().openapi({
      description:
        "Only list products linked to this activity. Overrides the default (activityId IS NULL) filter.",
    }),
    includeActivity: z.enum(["true", "false"]).optional().openapi({
      description:
        "When 'true', include activity-scoped products in the result. Default lists standalone products only.",
    }),
  })
  .openapi("ShopListProductsQuery");

export type ListProductsQuery = z.input<typeof ListProductsQuerySchema>;

export const ListUserProductsQuerySchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
    productType: ProductTypeSchema.optional(),
  })
  .openapi("ShopListUserProductsQuery");

export type ListUserProductsQuery = z.input<typeof ListUserProductsQuerySchema>;

// ─── Params ──────────────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const KeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({ param: { name: "key", in: "path" }, description: "Id or alias." }),
});

export const ProductIdParamSchema = z.object({
  productId: z
    .string()
    .min(1)
    .openapi({ param: { name: "productId", in: "path" } }),
});

export const StageIdParamSchema = z.object({
  stageId: z
    .string()
    .min(1)
    .openapi({ param: { name: "stageId", in: "path" } }),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z
    .string()
    .min(1)
    .openapi({ param: { name: "endUserId", in: "path" } }),
});

export const ProductAndStageParamSchema = z.object({
  productId: z
    .string()
    .min(1)
    .openapi({ param: { name: "productId", in: "path" } }),
  stageId: z
    .string()
    .min(1)
    .openapi({ param: { name: "stageId", in: "path" } }),
});

export const EndUserAndStageParamSchema = z.object({
  endUserId: z
    .string()
    .min(1)
    .openapi({ param: { name: "endUserId", in: "path" } }),
  stageId: z
    .string()
    .min(1)
    .openapi({ param: { name: "stageId", in: "path" } }),
});

// ─── Response schemas ────────────────────────────────────────────

const ItemResponseSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int(),
});

export const ShopCategoryResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    parentId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    coverImage: z.string().nullable(),
    icon: z.string().nullable(),
    level: z.number().int(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ShopCategory");

export const ShopCategoryTreeNodeSchema: z.ZodType<unknown> = z
  .lazy(() =>
    ShopCategoryResponseSchema.extend({
      children: z.array(ShopCategoryTreeNodeSchema),
    }),
  )
  .openapi("ShopCategoryTreeNode");

export const ShopTagResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ShopTag");

export const ShopProductResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    categoryId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    coverImage: z.string().nullable(),
    galleryImages: z.array(z.string()).nullable(),
    productType: ProductTypeSchema,
    costItems: z.array(ItemResponseSchema),
    rewardItems: z.array(ItemResponseSchema),
    timeWindowType: TimeWindowTypeSchema,
    availableFrom: z.string().nullable(),
    availableTo: z.string().nullable(),
    eligibilityAnchor: EligibilityAnchorSchema.nullable(),
    eligibilityWindowSeconds: z.number().int().nullable(),
    refreshCycle: RefreshCycleSchema.nullable(),
    refreshLimit: z.number().int().nullable(),
    userLimit: z.number().int().nullable(),
    globalLimit: z.number().int().nullable(),
    globalCount: z.number().int(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tags: z.array(ShopTagResponseSchema).optional(),
  })
  .openapi("ShopProduct");

export const ShopGrowthStageResponseSchema = z
  .object({
    id: z.string(),
    productId: z.string(),
    organizationId: z.string(),
    stageIndex: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    triggerType: GrowthTriggerTypeSchema,
    triggerConfig: z.record(z.string(), z.unknown()).nullable(),
    rewardItems: z.array(ItemResponseSchema),
    sortOrder: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("ShopGrowthStage");

export const PurchaseResultSchema = z
  .object({
    success: z.literal(true),
    purchaseId: z.string(),
    productId: z.string(),
    productType: ProductTypeSchema,
    costItems: z.array(ItemResponseSchema),
    rewardItems: z.array(ItemResponseSchema),
  })
  .openapi("ShopPurchaseResult");

export const ClaimStageResultSchema = z
  .object({
    success: z.literal(true),
    claimId: z.string(),
    stageId: z.string(),
    productId: z.string(),
    rewardItems: z.array(ItemResponseSchema),
  })
  .openapi("ShopClaimStageResult");

export const UserProductViewSchema = ShopProductResponseSchema.extend({
  eligibility: z.object({
    status: z.enum([
      "available",
      "not_started",
      "expired",
      "out_of_stock",
      "user_limit",
      "cycle_limit",
    ]),
    resetsAt: z.string().nullable().optional(),
    availableUntil: z.string().nullable().optional(),
  }),
  userPurchaseState: z
    .object({
      productId: z.string(),
      endUserId: z.string(),
      organizationId: z.string(),
      totalCount: z.number().int(),
      cycleCount: z.number().int(),
      cycleResetAt: z.string().nullable(),
      firstPurchaseAt: z.string().nullable(),
    })
    .nullable(),
  tags: z.array(ShopTagResponseSchema),
}).openapi("ShopUserProductView");

export const CategoryListResponseSchema = z
  .object({ items: z.array(ShopCategoryResponseSchema) })
  .openapi("ShopCategoryList");

export const CategoryTreeResponseSchema = z
  .object({ items: z.array(ShopCategoryTreeNodeSchema) })
  .openapi("ShopCategoryTree");

export const TagListResponseSchema = z
  .object({ items: z.array(ShopTagResponseSchema) })
  .openapi("ShopTagList");

export const ProductListResponseSchema = z
  .object({ items: z.array(ShopProductResponseSchema) })
  .openapi("ShopProductList");

export const GrowthStageListResponseSchema = z
  .object({ items: z.array(ShopGrowthStageResponseSchema) })
  .openapi("ShopGrowthStageList");

export const UserProductListResponseSchema = z
  .object({ items: z.array(UserProductViewSchema) })
  .openapi("ShopUserProductList");

