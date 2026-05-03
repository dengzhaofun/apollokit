/**
 * C-end client routes for the shop module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Mirror surface of admin routes is intentionally narrow: only the three
 * actions a tenant frontend actually needs — list, purchase, claim.
 * Catalog management stays admin-only.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { shopService } from "./index";
import {
  ClaimStageResultSchema,
  ClientClaimStageSchema,
  ClientListUserProductsQuerySchema,
  ClientPurchaseSchema,
  PurchaseResultSchema,
  UserProductListResponseSchema,
} from "./validators";
import type { UserProductView } from "./types";

const TAG = "Shop (Client)";

function serializeUserProduct(row: UserProductView) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    categoryId: row.categoryId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    coverImage: row.coverImage,
    galleryImages: (row.galleryImages ?? null) as string[] | null,
    productType: row.productType as "regular" | "growth_pack",
    costItems: row.costItems,
    rewardItems: row.rewardItems,
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
    refreshCycle: row.refreshCycle as "daily" | "weekly" | "monthly" | null,
    refreshLimit: row.refreshLimit,
    userLimit: row.userLimit,
    globalLimit: row.globalLimit,
    globalCount: row.globalCount,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
      ? {
          productId: row.userPurchaseState.productId,
          endUserId: row.userPurchaseState.endUserId,
          tenantId: row.userPurchaseState.tenantId,
          totalCount: row.userPurchaseState.totalCount,
          cycleCount: row.userPurchaseState.cycleCount,
          cycleResetAt: row.userPurchaseState.cycleResetAt
            ? row.userPurchaseState.cycleResetAt.toISOString()
            : null,
          firstPurchaseAt: row.userPurchaseState.firstPurchaseAt
            ? row.userPurchaseState.firstPurchaseAt.toISOString()
            : null,
        }
      : null,
    tags: row.tags.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      alias: t.alias,
      name: t.name,
      color: t.color,
      icon: t.icon,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
      metadata: (t.metadata ?? null) as Record<string, unknown> | null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

export const shopClientRouter = createClientRouter();

shopClientRouter.use("*", requireClientCredential);
shopClientRouter.use("*", requireClientUser);

// POST /purchase — execute a purchase on behalf of the calling end user
shopClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/purchase",
    tags: [TAG],
    summary: "Purchase a product as the calling end user",
    request: {
      body: {
        content: { "application/json": { schema: ClientPurchaseSchema } },
      },
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { productKey, idempotencyKey } = c.req.valid("json");

    const result = await shopService.purchase({
      tenantId: orgId,
      endUserId,
      productKey,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

// POST /claim-stage — claim a growth-pack stage reward
shopClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/claim-stage",
    tags: [TAG],
    summary: "Claim a growth-pack stage reward as the calling end user",
    request: {
      body: {
        content: { "application/json": { schema: ClientClaimStageSchema } },
      },
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { stageId, idempotencyKey } = c.req.valid("json");

    const result = await shopService.claimGrowthStage({
      tenantId: orgId,
      endUserId,
      stageId,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

// GET /products — list products with the calling end user's eligibility
shopClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/products",
    tags: [TAG],
    summary: "List products with per-user eligibility",
    request: { query: ClientListUserProductsQuerySchema },
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { categoryId, tagId, productType } = c.req.valid("query");

    const views = await shopService.listUserProducts({
      tenantId: orgId,
      endUserId,
      query: { categoryId, tagId, productType },
    });
    return c.json(ok({ items: views.map(serializeUserProduct) }), 200);
  },
);
