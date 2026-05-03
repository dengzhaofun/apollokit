/**
 * Admin-facing HTTP routes for the shop module.
 *
 * Protected by `requireAdminOrApiKey`. Routes follow the same serialize →
 * OpenAPI-declared → body shape pattern as `exchange/routes.ts`.
 */

import type { HonoEnv } from "../../env";
import { MoveBodySchema } from "../../lib/fractional-order";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import type { RewardEntry } from "../../lib/rewards";
import { shopService } from "./index";
import type {
  ShopCategory,
  ShopGrowthStage,
  ShopProduct,
  ShopTag,
  ShopUserPurchaseState,
  UserProductView,
} from "./types";
import {
  CategoryListResponseSchema,
  CategoryTreeResponseSchema,
  ClaimStageResultSchema,
  ClaimStageSchema,
  CreateCategorySchema,
  CreateGrowthStageSchema,
  CreateProductSchema,
  CreateTagSchema,
  EndUserAndStageParamSchema,
  EndUserIdParamSchema,
  GrowthStageListResponseSchema,
  IdParamSchema,
  KeyParamSchema,
  ListProductsQuerySchema,
  ListUserProductsQuerySchema,
  ProductAndStageParamSchema,
  ProductIdParamSchema,
  ProductListResponseSchema,
  PurchaseResultSchema,
  PurchaseSchema,
  ShopCategoryResponseSchema,
  ShopGrowthStageResponseSchema,
  ShopProductResponseSchema,
  ShopTagResponseSchema,
  StageIdParamSchema,
  TagListResponseSchema,
  UpdateCategorySchema,
  UpdateGrowthStageSchema,
  UpdateProductSchema,
  UpdateTagSchema,
  UpsertStagesSchema,
  UserProductListResponseSchema,
} from "./validators";

const TAG_CAT = "Shop Categories";
const TAG_TAG = "Shop Tags";
const TAG_PROD = "Shop Products";
const TAG_STG = "Shop Growth Stages";
const TAG_EXEC = "Shop Execution";

// ─── Serializers ─────────────────────────────────────────────────

function serializeCategory(row: ShopCategory) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    coverImage: row.coverImage,
    icon: row.icon,
    level: row.level,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type TreeNode = ShopCategory & { children: TreeNode[] };
function serializeTree(node: TreeNode): unknown {
  return {
    ...serializeCategory(node),
    children: node.children.map(serializeTree),
  };
}

function serializeTag(row: ShopTag) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProduct(row: ShopProduct & { tags?: ShopTag[] }) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    coverImage: row.coverImage,
    galleryImages: (row.galleryImages ?? null) as string[] | null,
    productType: row.productType as "regular" | "growth_pack",
    costItems: row.costItems as RewardEntry[],
    rewardItems: row.rewardItems as RewardEntry[],
    timeWindowType: row.timeWindowType as
      | "none"
      | "absolute"
      | "relative"
      | "cyclic",
    availableFrom: row.availableFrom ? row.availableFrom.toISOString() : null,
    availableTo: row.availableTo ? row.availableTo.toISOString() : null,
    eligibilityAnchor: row.eligibilityAnchor as
      | "user_created"
      | "first_purchase"
      | null,
    eligibilityWindowSeconds: row.eligibilityWindowSeconds,
    refreshCycle: row.refreshCycle as
      | "daily"
      | "weekly"
      | "monthly"
      | null,
    refreshLimit: row.refreshLimit,
    userLimit: row.userLimit,
    globalLimit: row.globalLimit,
    globalCount: row.globalCount,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tags: (row.tags ?? []).map(serializeTag),
  };
}

function serializeStage(row: ShopGrowthStage) {
  return {
    id: row.id,
    productId: row.productId,
    organizationId: row.organizationId,
    stageIndex: row.stageIndex,
    name: row.name,
    description: row.description,
    triggerType: row.triggerType as
      | "accumulated_cost"
      | "accumulated_payment"
      | "custom_metric"
      | "manual",
    triggerConfig: (row.triggerConfig ?? null) as Record<string, unknown> | null,
    rewardItems: row.rewardItems as RewardEntry[],
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeState(row: ShopUserPurchaseState) {
  return {
    productId: row.productId,
    endUserId: row.endUserId,
    organizationId: row.organizationId,
    totalCount: row.totalCount,
    cycleCount: row.cycleCount,
    cycleResetAt: row.cycleResetAt ? row.cycleResetAt.toISOString() : null,
    firstPurchaseAt: row.firstPurchaseAt
      ? row.firstPurchaseAt.toISOString()
      : null,
  };
}

function serializeUserProduct(row: UserProductView) {
  return {
    ...serializeProduct(row),
    eligibility: {
      status: row.eligibility.status,
      resetsAt: row.eligibility.resetsAt
        ? row.eligibility.resetsAt.toISOString()
        : null,
      availableUntil: row.eligibility.availableUntil
        ? row.eligibility.availableUntil.toISOString()
        : null,
    },
    userPurchaseState: row.userPurchaseState
      ? serializeState(row.userPurchaseState)
      : null,
    tags: row.tags.map(serializeTag),
  };
}

// ─── Router ──────────────────────────────────────────────────────

export const shopRouter = createAdminRouter();

shopRouter.use("*", requireAdminOrApiKey);
shopRouter.use("*", requirePermissionByMethod("shop"));

// ─── Categories ──────────────────────────────────────────────────

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "Create a shop category",
    request: {
      body: {
        content: { "application/json": { schema: CreateCategorySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(ShopCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.createCategory(orgId, c.req.valid("json"));
    return c.json(ok(serializeCategory(row)), 201);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "List shop categories (flat)",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CategoryListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await shopService.listCategories(orgId);
    return c.json(ok({ items: rows.map(serializeCategory) }), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/categories/tree",
    tags: [TAG_CAT],
    summary: "List shop categories as a hydrated tree",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CategoryTreeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const tree = await shopService.listCategoryTree(orgId);
    return c.json(ok({ items: tree.map(serializeTree) }), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/categories/{key}",
    tags: [TAG_CAT],
    summary: "Get a shop category by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.getCategory(orgId, c.req.valid("param").key);
    return c.json(ok(serializeCategory(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Update a shop category",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateCategorySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.updateCategory(
      orgId,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeCategory(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/categories/{key}/move",
    tags: [TAG_CAT],
    summary: "Move a shop category (drag/top/bottom/up/down)",
    request: {
      params: KeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ShopCategoryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await shopService.moveCategory(orgId, key, body);
    return c.json(ok(serializeCategory(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Delete a shop category",
    request: { params: IdParamSchema },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    await shopService.deleteCategory(orgId, c.req.valid("param").id);
    return c.json(ok(null), 200);
  },
);

// ─── Tags ────────────────────────────────────────────────────────

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/tags",
    tags: [TAG_TAG],
    summary: "Create a shop tag",
    request: {
      body: { content: { "application/json": { schema: CreateTagSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(ShopTagResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.createTag(orgId, c.req.valid("json"));
    return c.json(ok(serializeTag(row)), 201);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/tags",
    tags: [TAG_TAG],
    summary: "List shop tags",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TagListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await shopService.listTags(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeTag), nextCursor: page.nextCursor }),
      200,
    );
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/tags/{key}",
    tags: [TAG_TAG],
    summary: "Get a shop tag by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopTagResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.getTag(orgId, c.req.valid("param").key);
    return c.json(ok(serializeTag(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/tags/{id}",
    tags: [TAG_TAG],
    summary: "Update a shop tag",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: UpdateTagSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopTagResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.updateTag(
      orgId,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeTag(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/tags/{key}/move",
    tags: [TAG_TAG],
    summary: "Move a shop tag (drag/top/bottom/up/down)",
    request: {
      params: KeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ShopTagResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await shopService.moveTag(orgId, key, body);
    return c.json(ok(serializeTag(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/tags/{id}",
    tags: [TAG_TAG],
    summary: "Delete a shop tag",
    request: { params: IdParamSchema },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    await shopService.deleteTag(orgId, c.req.valid("param").id);
    return c.json(ok(null), 200);
  },
);

// ─── Products ────────────────────────────────────────────────────

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/products",
    tags: [TAG_PROD],
    summary: "Create a shop product",
    request: {
      body: {
        content: { "application/json": { schema: CreateProductSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(ShopProductResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.createProduct(orgId, c.req.valid("json"));
    return c.json(ok(serializeProduct(row)), 201);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/products",
    tags: [TAG_PROD],
    summary: "List shop products",
    request: { query: ListProductsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ProductListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await shopService.listProducts(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeProduct), nextCursor: page.nextCursor }),
      200,
    );
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/products/{key}",
    tags: [TAG_PROD],
    summary: "Get a shop product by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopProductResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.getProduct(orgId, c.req.valid("param").key);
    return c.json(ok(serializeProduct(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/products/{id}",
    tags: [TAG_PROD],
    summary: "Update a shop product",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateProductSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ShopProductResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.updateProduct(
      orgId,
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeProduct(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/products/{key}/move",
    tags: [TAG_PROD],
    summary: "Move a shop product (drag/top/bottom/up/down, scoped per category)",
    request: {
      params: KeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ShopProductResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await shopService.moveProduct(orgId, key, body);
    return c.json(ok(serializeProduct(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/products/{id}",
    tags: [TAG_PROD],
    summary: "Delete a shop product",
    request: { params: IdParamSchema },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    await shopService.deleteProduct(orgId, c.req.valid("param").id);
    return c.json(ok(null), 200);
  },
);

// ─── Growth stages ───────────────────────────────────────────────

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/products/{productId}/stages",
    tags: [TAG_STG],
    summary: "List growth stages for a product",
    request: { params: ProductIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(GrowthStageListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await shopService.listStages(
      orgId,
      c.req.valid("param").productId,
    );
    return c.json(ok({ items: rows.map(serializeStage) }), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/products/{productId}/stages",
    tags: [TAG_STG],
    summary: "Create a growth stage for a product",
    request: {
      params: ProductIdParamSchema,
      body: {
        content: { "application/json": { schema: CreateGrowthStageSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(ShopGrowthStageResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.createStage(
      orgId,
      c.req.valid("param").productId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeStage(row)), 201);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/products/{productId}/stages",
    tags: [TAG_STG],
    summary: "Replace all growth stages for a product",
    request: {
      params: ProductIdParamSchema,
      body: {
        content: { "application/json": { schema: UpsertStagesSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(GrowthStageListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const rows = await shopService.upsertStages(
      orgId,
      c.req.valid("param").productId,
      c.req.valid("json"),
    );
    return c.json(ok({ items: rows.map(serializeStage) }), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/stages/{stageId}",
    tags: [TAG_STG],
    summary: "Update a single growth stage",
    request: {
      params: StageIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateGrowthStageSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ShopGrowthStageResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await shopService.updateStage(
      orgId,
      c.req.valid("param").stageId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeStage(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/stages/{stageId}/move",
    tags: [TAG_STG],
    summary: "Move a growth stage (drag/top/bottom/up/down, scoped per product)",
    request: {
      params: StageIdParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ShopGrowthStageResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { stageId } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await shopService.moveGrowthStage(orgId, stageId, body);
    return c.json(ok(serializeStage(row)), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/stages/{stageId}",
    tags: [TAG_STG],
    summary: "Delete a growth stage",
    request: { params: StageIdParamSchema },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    await shopService.deleteStage(orgId, c.req.valid("param").stageId);
    return c.json(ok(null), 200);
  },
);

// ─── Purchase / claim (admin "acts on behalf of endUser") ───────

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/products/{id}/purchase",
    tags: [TAG_EXEC],
    summary: "Purchase a product on behalf of an end user",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: PurchaseSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PurchaseResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await shopService.purchase({
      organizationId: orgId,
      endUserId: body.endUserId,
      productKey: id,
      idempotencyKey: body.idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/users/{endUserId}/stages/{stageId}/claim",
    tags: [TAG_EXEC],
    summary: "Claim a growth stage reward on behalf of an end user",
    request: {
      params: EndUserAndStageParamSchema,
      body: { content: { "application/json": { schema: ClaimStageSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ClaimStageResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId, stageId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await shopService.claimGrowthStage({
      organizationId: orgId,
      endUserId,
      stageId,
      idempotencyKey: body.idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

shopRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/users/{endUserId}/products",
    tags: [TAG_EXEC],
    summary: "List products with per-user eligibility for an end user",
    request: {
      params: EndUserIdParamSchema,
      query: ListUserProductsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(UserProductListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId } = c.req.valid("param");
    const query = c.req.valid("query");
    const views = await shopService.listUserProducts({
      organizationId: orgId,
      endUserId,
      query,
    });
    return c.json(ok({ items: views.map(serializeUserProduct) }), 200);
  },
);

// Avoid unused-import linting — these are imported for future route
// overloads that share the same param shapes.
void ProductAndStageParamSchema;
