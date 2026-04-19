/**
 * C-end client routes for the task module.
 *
 * Protected by `requireClientCredential` — requires a valid publishable
 * key (cpk_) in `x-api-key`. Per-endUser HMAC verification is inline.
 *
 * Exposed surface:
 *   POST /events            → business event ingestion
 *   POST /list              → task list with per-user progress
 *   POST /claim/:taskId     → manual reward claim
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { taskService } from "./index";
import {
  ClaimBodySchema,
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

export const taskClientRouter = new OpenAPIHono<HonoEnv>();

taskClientRouter.use("*", requireClientCredential);

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
        content: { "application/json": { schema: EventResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const credential = c.var.clientCredential!;
    const body = c.req.valid("json");

    // Verify HMAC
    await clientCredentialService.verifyRequest(
      credential.publishableKey,
      body.endUserId,
      body.userHash,
    );

    const now = body.timestamp ? new Date(body.timestamp) : undefined;

    const processed = await taskService.processEvent(
      credential.organizationId,
      body.endUserId,
      body.eventName,
      body.eventData,
      now,
    );

    return c.json({ processed }, 200);
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
          "application/json": { schema: ClientTaskListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const credential = c.var.clientCredential!;
    const body = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      credential.publishableKey,
      body.endUserId,
      body.userHash,
    );

    const items = await taskService.getTasksForUser(
      credential.organizationId,
      body.endUserId,
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
  createRoute({
    method: "post",
    path: "/claim/{taskId}",
    tags: [TAG],
    summary: "Manually claim task reward",
    request: {
      params: TaskIdParamSchema,
      body: {
        content: { "application/json": { schema: ClaimBodySchema } },
      },
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
    const credential = c.var.clientCredential!;
    const { taskId } = c.req.valid("param");
    const body = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      credential.publishableKey,
      body.endUserId,
      body.userHash,
    );

    const result = await taskService.claimReward(
      credential.organizationId,
      body.endUserId,
      taskId,
    );

    return c.json(result, 200);
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
        content: { "application/json": { schema: ClaimTierResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const credential = c.var.clientCredential!;
    const body = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      credential.publishableKey,
      body.endUserId,
      body.userHash,
    );

    const result = await taskService.claimTier(
      credential.organizationId,
      body.endUserId,
      body.taskId,
      body.tierAlias,
    );

    return c.json(result, 200);
  },
);
