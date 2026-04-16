/**
 * C-end client routes for the shop module.
 *
 * Protected by `requireClientCredential` (publishable-key gate). HMAC of
 * `endUserId` is verified inline in each handler against the secret bound
 * to the publishable key — we can't do it in middleware because the
 * `endUserId` lives in the body / query, not the headers.
 *
 * Mirror surface of admin routes is intentionally narrow: only the three
 * actions a tenant frontend actually needs — list, purchase, claim.
 * Catalog management stays admin-only.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { shopService } from "./index";
import {
  ClaimStageResultSchema,
  ClientClaimStageSchema,
  ClientListUserProductsQuerySchema,
  ClientPurchaseSchema,
  ErrorResponseSchema,
  PurchaseResultSchema,
  UserProductListResponseSchema,
} from "./validators";
import type { UserProductView } from "./types";

const TAG = "Shop (Client)";

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

// Re-implement the user-product serializer locally — keeping `routes.ts`
// and `client-routes.ts` independently importable means we don't rely on
// the admin file's internals.
function serializeUserProduct(row: UserProductView) {
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
          organizationId: row.userPurchaseState.organizationId,
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
      organizationId: t.organizationId,
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

export const shopClientRouter = new OpenAPIHono<HonoEnv>();

shopClientRouter.use("*", requireClientCredential);

shopClientRouter.onError((err, c) => {
  if (err instanceof ModuleError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId: c.get("requestId"),
      },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  throw err;
});

// POST /purchase — execute a purchase on behalf of the calling end user
shopClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: PurchaseResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { productKey, endUserId, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await shopService.purchase({
      organizationId: orgId,
      endUserId,
      productKey,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);

// POST /claim-stage — claim a growth-pack stage reward
shopClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: ClaimStageResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { stageId, endUserId, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await shopService.claimGrowthStage({
      organizationId: orgId,
      endUserId,
      stageId,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);

// GET /products — list products with the calling end user's eligibility
shopClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/products",
    tags: [TAG],
    summary: "List products with per-user eligibility",
    request: { query: ClientListUserProductsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: UserProductListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash, categoryId, tagId, productType } =
      c.req.valid("query");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const views = await shopService.listUserProducts({
      organizationId: orgId,
      endUserId,
      query: { categoryId, tagId, productType },
    });
    return c.json({ items: views.map(serializeUserProduct) }, 200);
  },
);
