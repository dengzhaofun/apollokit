/**
 * Admin-facing HTTP routes for the check-in module.
 *
 * This is the ONLY file in the module that knows about Hono. It translates
 * Zod-validated inputs into service calls and maps typed errors onto HTTP
 * responses. No business logic lives here.
 *
 * Every route is guarded by `requireAuth` — unauthenticated requests get
 * 401, and sessions without an active organization get 400. Downstream
 * handlers can safely read `c.var.user.id` and
 * `c.var.session.activeOrganizationId` without null checks.
 *
 * Error handling: handlers throw `ModuleError` subclasses; a router-level
 * `onError` maps them onto JSON responses with the right status code.
 * This is cleaner than returning c.json(..., err.httpStatus) per handler,
 * because @hono/zod-openapi requires every `c.json` status literal to
 * match a specific declared response type — a runtime-typed status won't
 * narrow.
 *
 * No public (tenant-frontend) routes yet. When we add them they'll mount
 * under a different base path with API-key / JWT auth and reuse the same
 * `checkInService` singleton.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAuth } from "../../middleware/require-auth";
import { ModuleError } from "./errors";
import { checkInService } from "./index";
import {
  CheckInBodySchema,
  CheckInConfigResponseSchema,
  CheckInResultSchema,
  CheckInUserStateViewSchema,
  ConfigIdParamSchema,
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  CreateConfigSchema,
  ErrorResponseSchema,
  UpdateConfigSchema,
  UserStateParamSchema,
} from "./validators";

const TAG = "Check-In";

/**
 * Serialize a Drizzle row to a JSON-friendly shape. Drizzle's `jsonb` column
 * comes back already-parsed, and `timestamp` columns come back as `Date` —
 * we convert to ISO strings so the OpenAPI schema (which declares `string`)
 * is honest and the wire format is stable.
 */
function serializeConfig(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  resetMode: string;
  weekStartsOn: number;
  target: number | null;
  timezone: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    resetMode: row.resetMode as "none" | "week" | "month",
    weekStartsOn: row.weekStartsOn,
    target: row.target,
    timezone: row.timezone,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const checkInRouter = new OpenAPIHono<HonoEnv>();

checkInRouter.use("*", requireAuth);

checkInRouter.onError((err, c) => {
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
  throw err; // let the global app.onError return 500
});

// POST /check-in/configs — create
checkInRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a check-in config for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: CheckInConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await checkInService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

// GET /check-in/configs — list
checkInRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List check-in configs for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ConfigListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await checkInService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

// GET /check-in/configs/:key — by id or alias
checkInRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a check-in config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: CheckInConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await checkInService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

// PATCH /check-in/configs/:id — update
checkInRouter.openapi(
  createRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update a check-in config",
    request: {
      params: ConfigIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateConfigSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: CheckInConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await checkInService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeConfig(row), 200);
  },
);

// DELETE /check-in/configs/:id
checkInRouter.openapi(
  createRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete a check-in config (cascades to user states)",
    request: { params: ConfigIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await checkInService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// POST /check-in/configs/:key/check-ins — perform a check-in
checkInRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs/{key}/check-ins",
    tags: [TAG],
    summary: "Check in an end user against this config",
    request: {
      params: ConfigKeyParamSchema,
      body: {
        content: { "application/json": { schema: CheckInBodySchema } },
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const { endUserId } = c.req.valid("json");
    const result = await checkInService.checkIn({
      organizationId: orgId,
      configKey: key,
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

// GET /check-in/configs/:key/users/:endUserId/state
checkInRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{key}/users/{endUserId}/state",
    tags: [TAG],
    summary: "Fetch an end user's aggregate state for a config",
    request: { params: UserStateParamSchema },
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { key, endUserId } = c.req.valid("param");
    const view = await checkInService.getUserState({
      organizationId: orgId,
      configKey: key,
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
