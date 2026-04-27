/**
 * C-end client routes for the lottery module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Exposes: pull, multi-pull, user state, pull history.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { lotteryService } from "./index";
import {
  ClientPullSchema,
  ClientMultiPullSchema,
  PoolKeyParamSchema,
  PullResultResponseSchema,
  LotteryUserStateResponseSchema,
  PullLogListResponseSchema,
  } from "./validators";

const TAG = "Lottery (Client)";

export const lotteryClientRouter = createClientRouter();

lotteryClientRouter.use("*", requireClientCredential);
lotteryClientRouter.use("*", requireClientUser);

// POST /pull — single pull
lotteryClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: envelopeOf(PullResultResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { poolId, idempotencyKey } = c.req.valid("json");

    const result = await lotteryService.pull({
      organizationId: orgId,
      endUserId,
      poolKey: poolId,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

// POST /multi-pull — batch pull
lotteryClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: envelopeOf(PullResultResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { poolId, count, idempotencyKey } = c.req.valid("json");

    const result = await lotteryService.multiPull({
      organizationId: orgId,
      endUserId,
      poolKey: poolId,
      count,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

// GET /pools/{poolKey}/state — user's pity state
lotteryClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/pools/{poolKey}/state",
    tags: [TAG],
    summary: "Get current user's pity state for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(LotteryUserStateResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { poolKey } = c.req.valid("param");
    const state = await lotteryService.getUserState({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(ok(state), 200);
  },
);

// GET /pools/{poolKey}/history — user's pull history
lotteryClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/pools/{poolKey}/history",
    tags: [TAG],
    summary: "Get current user's pull history for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PullLogListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { poolKey } = c.req.valid("param");
    const rows = await lotteryService.getPullHistory({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(ok({
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
      }), 200,);
  },
);
