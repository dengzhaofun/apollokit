/**
 * C-end client routes for the check-in module.
 *
 * Protected by `requireClientCredential` — requires a valid client
 * credential (cpk_ publishable key) in the x-api-key header. HMAC
 * verification of endUserId is done inline via the credential service.
 *
 * These routes expose only the minimum surface for end users:
 * - Perform a check-in
 * - Query a user's check-in state
 *
 * No config CRUD is exposed. The organizationId is resolved from the
 * client credential, not from a session.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
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

// Client check-in request body includes endUserId + userHash for HMAC
const ClientCheckInBodySchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "daily",
    }),
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    userHash: z.string().optional().openapi({
      description:
        "HMAC-SHA256(endUserId, clientSecret). Required unless dev mode is enabled.",
    }),
  })
  .openapi("ClientCheckInRequest");

const ClientStateQuerySchema = z.object({
  configKey: z.string().min(1).openapi({
    param: { name: "configKey", in: "query" },
    description: "Config id or alias.",
  }),
});

const ClientStateParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's business id.",
  }),
});

export const checkInClientRouter = new OpenAPIHono<HonoEnv>();

checkInClientRouter.use("*", requireClientCredential);

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
    summary: "Perform a check-in for an end user",
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
    // Verify HMAC via the credential service
    const publishableKey = c.req.header("x-api-key")!;
    const { configKey, endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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

// GET /users/:endUserId/state?configKey=xxx
checkInClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/state",
    tags: [TAG],
    summary: "Get an end user's check-in state",
    request: {
      params: ClientStateParamSchema,
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
    // For GET requests, HMAC is passed in x-user-hash header
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("param");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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
