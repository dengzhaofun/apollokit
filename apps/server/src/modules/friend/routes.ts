/**
 * Admin-facing HTTP routes for the friend module.
 *
 * Guarded by `requireAdminOrApiKey`. Exposes settings CRUD and admin
 * relationship browsing/deletion.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { FriendSettingsNotFound, ModuleError } from "./errors";
import { friendService } from "./index";
import {
  ErrorResponseSchema,
  FriendRelationshipListSchema,
  FriendSettingsResponseSchema,
  PaginationQuerySchema,
  RelationshipIdParamSchema,
  UpsertSettingsSchema,
} from "./validators";

const TAG = "Friend";

function serializeSettings(row: {
  id: string;
  organizationId: string;
  maxFriends: number;
  maxBlocked: number;
  maxPendingRequests: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    maxFriends: row.maxFriends,
    maxBlocked: row.maxBlocked,
    maxPendingRequests: row.maxPendingRequests,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRelationship(row: {
  id: string;
  organizationId: string;
  userA: string;
  userB: string;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userA: row.userA,
    userB: row.userB,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
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

export const friendRouter = new OpenAPIHono<HonoEnv>();

friendRouter.use("*", requireAdminOrApiKey);

friendRouter.onError((err, c) => {
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

// GET /friend/settings
friendRouter.openapi(
  createRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    summary: "Get friend settings for the current organization",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendSettingsResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.getSettings(orgId);
    if (!row) throw new FriendSettingsNotFound();
    return c.json(serializeSettings(row), 200);
  },
);

// PUT /friend/settings
friendRouter.openapi(
  createRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    summary: "Create or update friend settings for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: UpsertSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendSettingsResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.upsertSettings(orgId, c.req.valid("json"));
    return c.json(serializeSettings(row), 200);
  },
);

// GET /friend/relationships — admin: list all (paginated)
friendRouter.openapi(
  createRoute({
    method: "get",
    path: "/relationships",
    tags: [TAG],
    summary: "List all friend relationships in this organization (admin)",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendRelationshipListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { limit, offset } = c.req.valid("query");
    const result = await friendService.listRelationships(orgId, { limit, offset });
    return c.json(
      {
        items: result.items.map(serializeRelationship),
        total: result.total,
      },
      200,
    );
  },
);

// DELETE /friend/relationships/:id — admin: force remove
friendRouter.openapi(
  createRoute({
    method: "delete",
    path: "/relationships/{id}",
    tags: [TAG],
    summary: "Force-remove a friend relationship (admin)",
    request: { params: RelationshipIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await friendService.deleteRelationship(orgId, id);
    return c.body(null, 204);
  },
);
