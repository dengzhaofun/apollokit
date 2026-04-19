/**
 * C-end client routes for the check-in module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * These routes expose only the minimum surface for end users:
 * - Perform a check-in
 * - Query the authenticated end user's check-in state
 *
 * No config CRUD is exposed. The organizationId is resolved from the
 * client credential (middleware), not from a session.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { checkInService } from "./index";
import {
  CheckInResultSchema,
  CheckInUserStateViewSchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Check-In (Client)";

function serializeState(row: {
  configId: string;
  endUserId: string;
  organizationId: string;
  totalDays: number;
  currentStreak: number;
  longestStreak: number;
  currentCycleKey: string | null;
  currentCycleDays: number;
  lastCheckInDate: string | null;
  firstCheckInAt: Date | null;
  lastCheckInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    configId: row.configId,
    endUserId: row.endUserId,
    organizationId: row.organizationId,
    totalDays: row.totalDays,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    currentCycleKey: row.currentCycleKey,
    currentCycleDays: row.currentCycleDays,
    lastCheckInDate: row.lastCheckInDate,
    firstCheckInAt: row.firstCheckInAt?.toISOString() ?? null,
    lastCheckInAt: row.lastCheckInAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
};

// Client check-in request body — only the config key, endUserId comes from header
const ClientCheckInBodySchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "daily",
    }),
  })
  .openapi("ClientCheckInRequest");

const ClientStateQuerySchema = z.object({
  configKey: z.string().min(1).openapi({
    param: { name: "configKey", in: "query" },
    description: "Config id or alias.",
  }),
});

export const checkInClientRouter = new OpenAPIHono<HonoEnv>();

checkInClientRouter.use("*", requireClientCredential);
checkInClientRouter.use("*", requireClientUser);

checkInClientRouter.onError((err, c) => {
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

// POST /check-ins — perform a check-in
checkInClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/check-ins",
    tags: [TAG],
    summary: "Perform a check-in for the authenticated end user",
    request: {
      body: {
        content: { "application/json": { schema: ClientCheckInBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CheckInResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configKey } = c.req.valid("json");

    const result = await checkInService.checkIn({
      organizationId: orgId,
      configKey,
      endUserId,
    });

    return c.json(
      {
        alreadyCheckedIn: result.alreadyCheckedIn,
        justCompleted: result.justCompleted,
        state: serializeState(result.state),
        target: result.target,
        isCompleted: result.isCompleted,
        remaining: result.remaining,
      },
      200,
    );
  },
);

// GET /state?configKey=xxx — current user's check-in state
checkInClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/state",
    tags: [TAG],
    summary: "Get the authenticated end user's check-in state",
    request: {
      query: ClientStateQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: CheckInUserStateViewSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configKey } = c.req.valid("query");

    const view = await checkInService.getUserState({
      organizationId: orgId,
      configKey,
      endUserId,
    });

    return c.json(
      {
        state: serializeState(view.state),
        target: view.target,
        isCompleted: view.isCompleted,
        remaining: view.remaining,
      },
      200,
    );
  },
);
