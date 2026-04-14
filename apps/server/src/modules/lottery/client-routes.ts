/**
 * C-end client routes for the lottery module.
 *
 * Protected by `requireClientCredential`. HMAC verification inline.
 * Exposes: pull, multi-pull, user state, pull history.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { lotteryService } from "./index";
import {
  ClientPullSchema,
  ClientMultiPullSchema,
  PoolKeyParamSchema,
  PullResultResponseSchema,
  LotteryUserStateResponseSchema,
  PullLogListResponseSchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Lottery (Client)";

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

export const lotteryClientRouter = new OpenAPIHono<HonoEnv>();

lotteryClientRouter.use("*", requireClientCredential);

lotteryClientRouter.onError((err, c) => {
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

// POST /pull — single pull
lotteryClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/pull",
    tags: [TAG],
    summary: "Execute a single lottery pull",
    request: {
      body: {
        content: { "application/json": { schema: ClientPullSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PullResultResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { poolId, endUserId, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await lotteryService.pull({
      organizationId: orgId,
      endUserId,
      poolKey: poolId,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);

// POST /multi-pull — batch pull
lotteryClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/multi-pull",
    tags: [TAG],
    summary: "Execute multiple lottery pulls",
    request: {
      body: {
        content: { "application/json": { schema: ClientMultiPullSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PullResultResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { poolId, endUserId, count, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await lotteryService.multiPull({
      organizationId: orgId,
      endUserId,
      poolKey: poolId,
      count,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);

// GET /pools/{poolKey}/state — user's pity state
lotteryClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/state",
    tags: [TAG],
    summary: "Get current user's pity state for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: LotteryUserStateResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    // For client routes, endUserId comes from a query param or header
    // Following exchange pattern: the client sends endUserId in query
    const endUserId = c.req.query("endUserId");
    if (!endUserId) {
      return c.json({ error: "endUserId query parameter required" }, 400);
    }
    const state = await lotteryService.getUserState({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(state, 200);
  },
);

// GET /pools/{poolKey}/history — user's pull history
lotteryClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/history",
    tags: [TAG],
    summary: "Get current user's pull history for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PullLogListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const endUserId = c.req.query("endUserId");
    if (!endUserId) {
      return c.json({ error: "endUserId query parameter required" }, 400);
    }
    const rows = await lotteryService.getPullHistory({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          poolId: r.poolId,
          endUserId: r.endUserId,
          batchId: r.batchId,
          batchIndex: r.batchIndex,
          prizeId: r.prizeId,
          tierId: r.tierId,
          tierName: r.tierName,
          prizeName: r.prizeName,
          rewardItems: r.rewardItems,
          pityTriggered: r.pityTriggered,
          pityRuleId: r.pityRuleId,
          costItems: r.costItems,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      200,
    );
  },
);
