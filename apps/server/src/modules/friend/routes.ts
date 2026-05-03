/**
 * Admin-facing HTTP routes for the friend module.
 *
 * Guarded by `requireAdminOrApiKey`. Exposes settings CRUD and admin
 * relationship browsing/deletion.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { FriendSettingsNotFound, ModuleError } from "./errors";
import { friendService } from "./index";
import {
  FriendRelationshipListSchema,
  FriendSettingsResponseSchema,
  PaginationQuerySchema,
  RelationshipIdParamSchema,
  UpsertSettingsSchema,
} from "./validators";

const TAG = "Friend";

function serializeSettings(row: {
  id: string;
  tenantId: string;
  maxFriends: number;
  maxBlocked: number;
  maxPendingRequests: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
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
  tenantId: string;
  userA: string;
  userB: string;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userA: row.userA,
    userB: row.userB,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const friendRouter = createAdminRouter();

friendRouter.use("*", requireAdminOrApiKey);
friendRouter.use("*", requirePermissionByMethod("friend"));

// GET /friend/settings
friendRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    summary: "Get friend settings for the current project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendSettingsResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await friendService.getSettings(orgId);
    if (!row) throw new FriendSettingsNotFound();
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// PUT /friend/settings
friendRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    summary: "Create or update friend settings for the current project",
    request: {
      body: {
        content: { "application/json": { schema: UpsertSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendSettingsResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await friendService.upsertSettings(orgId, c.req.valid("json"));
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// GET /friend/relationships — admin: list all (paginated)
friendRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/relationships",
    tags: [TAG],
    summary: "List all friend relationships in this project (admin)",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendRelationshipListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { limit, offset } = c.req.valid("query");
    const result = await friendService.listRelationships(orgId, { limit, offset });
    return c.json(ok({
        items: result.items.map(serializeRelationship),
        total: result.total,
      }), 200,);
  },
);

// DELETE /friend/relationships/:id — admin: force remove
friendRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/relationships/{id}",
    tags: [TAG],
    summary: "Force-remove a friend relationship (admin)",
    request: { params: RelationshipIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await friendService.deleteRelationship(orgId, id);
    return c.json(ok(null), 200);
  },
);
