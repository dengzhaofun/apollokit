/**
 * C-end client routes for the task module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Exposed surface:
 *   POST /events            → business event ingestion
 *   POST /list              → task list with per-user progress
 *   POST /claim/:taskId     → manual reward claim
 *   POST /claim-tier        → manual staged-reward tier claim
 */

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { taskService } from "./index";
import {
  ClaimResponseSchema,
  ClaimTierBodySchema,
  ClaimTierResponseSchema,
  ClientTaskListResponseSchema,
  EventBodySchema,
  EventResponseSchema,
  TaskIdParamSchema,
  TaskListBodySchema,
} from "./validators";

const TAG = "Task (Client)";

export const taskClientRouter = makeApiRouter();

taskClientRouter.use("*", requireClientCredential);
taskClientRouter.use("*", requireClientUser);

// ─── Event ingestion ────────────────────────────────────────────

taskClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/events",
    tags: [TAG],
    summary: "Submit a business event to update task progress",
    request: {
      body: {
        content: { "application/json": { schema: EventBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(EventResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const body = c.req.valid("json");

    const now = body.timestamp ? new Date(body.timestamp) : undefined;

    const processed = await taskService.processEvent(
      orgId,
      endUserId,
      body.eventName,
      body.eventData,
      now,
    );

    return c.json(ok({ processed }), 200);
  },
);

// ─── Task list ──────────────────────────────────────────────────

taskClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/list",
    tags: [TAG],
    summary: "List tasks with per-user progress",
    request: {
      body: {
        content: { "application/json": { schema: TaskListBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ClientTaskListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const body = c.req.valid("json");

    const items = await taskService.getTasksForUser(
      orgId,
      endUserId,
      {
        categoryId: body.categoryId,
        period: body.period,
        includeHidden: body.includeHidden,
      },
    );

    return c.json(ok({ items }), 200);
  },
);

// ─── Claim ──────────────────────────────────────────────────────

taskClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/claim/{taskId}",
    tags: [TAG],
    summary: "Manually claim task reward",
    request: {
      params: TaskIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ClaimResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { taskId } = c.req.valid("param");

    const result = await taskService.claimReward(orgId, endUserId, taskId);

    return c.json(ok(result), 200);
  },
);

// ─── Claim Tier (阶段性奖励) ───────────────────────────────────────

taskClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/claim-tier",
    tags: [TAG],
    summary: "Manually claim a staged-reward tier (阶段性奖励)",
    request: {
      body: {
        content: { "application/json": { schema: ClaimTierBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ClaimTierResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const body = c.req.valid("json");

    const result = await taskService.claimTier(
      orgId,
      endUserId,
      body.taskId,
      body.tierAlias,
    );

    return c.json(ok(result), 200);
  },
);
