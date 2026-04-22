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


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { taskService } from "./index";
import {
  ClaimResponseSchema,
  ClaimTierBodySchema,
  ClaimTierResponseSchema,
  ClientTaskListResponseSchema,
  ErrorResponseSchema,
  EventBodySchema,
  EventResponseSchema,
  TaskIdParamSchema,
  TaskListBodySchema,
} from "./validators";

const TAG = "Task (Client)";

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

export const taskClientRouter = createClientRouter();

taskClientRouter.use("*", requireClientCredential);
taskClientRouter.use("*", requireClientUser);

taskClientRouter.onError((err, c) => {
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

// ─── Event ingestion ────────────────────────────────────────────

taskClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: EventResponseSchema } },
      },
      ...errorResponses,
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

    return c.json({ processed }, 200);
  },
);

// ─── Task list ──────────────────────────────────────────────────

taskClientRouter.openapi(
  createClientRoute({
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
          "application/json": { schema: ClientTaskListResponseSchema },
        },
      },
      ...errorResponses,
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

    return c.json({ items }, 200);
  },
);

// ─── Claim ──────────────────────────────────────────────────────

taskClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: ClaimResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { taskId } = c.req.valid("param");

    const result = await taskService.claimReward(orgId, endUserId, taskId);

    return c.json(result, 200);
  },
);

// ─── Claim Tier (阶段性奖励) ───────────────────────────────────────

taskClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: ClaimTierResponseSchema } },
      },
      ...errorResponses,
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

    return c.json(result, 200);
  },
);
