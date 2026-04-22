/**
 * C-end client routes for the assist-pool module.
 *
 * Auth matches other client-routes (see check-in/client-routes.ts):
 *   requireClientCredential → tenant org id from cpk_
 *   requireClientUser       → endUserId from session (Channel A) or HMAC (B)
 *
 * Player surface:
 *   - POST /instances                       — initiate a pool for myself
 *   - GET  /instances?configKey=...         — list my own instances
 *   - GET  /instances/:instanceId           — fetch an instance (read-only, any org member)
 *   - POST /instances/:instanceId/contribute — assist someone else's instance
 */

import { createRoute, z } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { assistPoolService } from "./index";
import type { AssistPoolContribution, AssistPoolInstance } from "./types";
import {
  AssistPoolContributeResultSchema,
  AssistPoolInstanceListSchema,
  AssistPoolInstanceResponseSchema,
  ClientInitiateBodySchema,
  InstanceIdParamSchema,
} from "./validators";

const TAG = "Assist Pool (Client)";

function serializeInstance(row: AssistPoolInstance) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    configId: row.configId,
    initiatorEndUserId: row.initiatorEndUserId,
    status: row.status as "in_progress" | "completed" | "expired",
    remaining: row.remaining,
    targetAmount: row.targetAmount,
    contributionCount: row.contributionCount,
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    rewardGrantedAt: row.rewardGrantedAt?.toISOString() ?? null,
    version: row.version,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeContribution(row: AssistPoolContribution) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    instanceId: row.instanceId,
    assisterEndUserId: row.assisterEndUserId,
    amount: row.amount,
    remainingAfter: row.remainingAfter,
    createdAt: row.createdAt.toISOString(),
  };
}

const ClientListQuerySchema = z.object({
  configKey: z.string().optional().openapi({
    param: { name: "configKey", in: "query" },
  }),
});

export const assistPoolClientRouter = makeApiRouter();

assistPoolClientRouter.use("*", requireClientCredential);
assistPoolClientRouter.use("*", requireClientUser);

// POST /instances
assistPoolClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances",
    tags: [TAG],
    summary: "Initiate an assist-pool instance for the authenticated end user",
    request: {
      body: {
        content: { "application/json": { schema: ClientInitiateBodySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configKey } = c.req.valid("json");

    const row = await assistPoolService.initiateInstance({
      organizationId: orgId,
      configKey,
      initiatorEndUserId: endUserId,
    });
    return c.json(ok(serializeInstance(row)), 201);
  },
);

// GET /instances (mine)
assistPoolClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances",
    tags: [TAG],
    summary: "List the authenticated end user's assist-pool instances",
    request: { query: ClientListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configKey } = c.req.valid("query");

    const rows = await assistPoolService.listInstances({
      organizationId: orgId,
      configKey,
      initiatorEndUserId: endUserId,
    });
    return c.json(ok({ items: rows.map(serializeInstance) }), 200);
  },
);

// GET /instances/:instanceId
assistPoolClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances/{instanceId}",
    tags: [TAG],
    summary:
      "Fetch an assist-pool instance (readable by any authenticated end user within the org, so a friend can view the pool before helping)",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const { instanceId } = c.req.valid("param");
    const row = await assistPoolService.getInstance(orgId, instanceId);
    return c.json(ok(serializeInstance(row)), 200);
  },
);

// POST /instances/:instanceId/contribute
assistPoolClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/contribute",
    tags: [TAG],
    summary:
      "Contribute to an instance as the authenticated end user (helps someone else's pool)",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolContributeResultSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const res = await assistPoolService.contribute({
      organizationId: orgId,
      instanceId,
      assisterEndUserId: endUserId,
    });
    return c.json(
      ok({
        instance: serializeInstance(res.instance),
        contribution: serializeContribution(res.contribution),
        completed: res.completed,
        rewards: res.rewards ? res.rewards.rewards : null,
      }),
      200,
    );
  },
);
