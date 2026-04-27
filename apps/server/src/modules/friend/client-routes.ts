/**
 * C-end client routes for the friend module.
 *
 * Mounted at /api/client/friend. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { friendService } from "./index";
import {
  ClientBlockSchema,
  ClientSendRequestSchema,
  BlockedUserIdParamSchema,
  FriendBlockListSchema,
  FriendRelationshipListSchema,
  FriendRequestListSchema,
  FriendRequestResponseSchema,
  MutualFriendsQuerySchema,
  PaginationQuerySchema,
  RelationshipIdParamSchema,
  RequestIdParamSchema,
} from "./validators";

const TAG = "Friend (Client)";

function serializeRequest(row: {
  id: string;
  organizationId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  message: string | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status,
    message: row.message,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    version: row.version,
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

function serializeBlock(row: {
  organizationId: string;
  blockerUserId: string;
  blockedUserId: string;
  createdAt: Date;
}) {
  return {
    organizationId: row.organizationId,
    blockerUserId: row.blockerUserId,
    blockedUserId: row.blockedUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const friendClientRouter = createClientRouter();

friendClientRouter.use("*", requireClientCredential);
friendClientRouter.use("*", requireClientUser);

// ─── Friend requests ─────────────────────────────────────────────

// POST /requests — send friend request
friendClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests",
    tags: [TAG],
    summary: "Send a friend request",
    request: {
      body: {
        content: { "application/json": { schema: ClientSendRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(FriendRequestResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { toUserId, message } = c.req.valid("json");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const row = await friendService.sendRequest(orgId, endUserId, toUserId, message);
    return c.json(ok(serializeRequest(row)), 201);
  },
);

// GET /requests/incoming — list incoming pending requests
friendClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/requests/incoming",
    tags: [TAG],
    summary: "List incoming pending friend requests",
    request: {},
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(FriendRequestListSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const rows = await friendService.listIncomingRequests(orgId, endUserId);
    return c.json(ok({ items: rows.map(serializeRequest) }), 200);
  },
);

// GET /requests/outgoing — list outgoing pending requests
friendClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/requests/outgoing",
    tags: [TAG],
    summary: "List outgoing pending friend requests",
    request: {},
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(FriendRequestListSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const rows = await friendService.listOutgoingRequests(orgId, endUserId);
    return c.json(ok({ items: rows.map(serializeRequest) }), 200);
  },
);

// POST /requests/:id/accept
friendClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests/{id}/accept",
    tags: [TAG],
    summary: "Accept a friend request",
    request: {
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendRequestResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const row = await friendService.acceptRequest(orgId, id, endUserId);
    return c.json(ok(serializeRequest(row)), 200);
  },
);

// POST /requests/:id/reject
friendClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests/{id}/reject",
    tags: [TAG],
    summary: "Reject a friend request",
    request: {
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendRequestResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const row = await friendService.rejectRequest(orgId, id, endUserId);
    return c.json(ok(serializeRequest(row)), 200);
  },
);

// POST /requests/:id/cancel
friendClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests/{id}/cancel",
    tags: [TAG],
    summary: "Cancel a friend request (sender only)",
    request: {
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FriendRequestResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const row = await friendService.cancelRequest(orgId, id, endUserId);
    return c.json(ok(serializeRequest(row)), 200);
  },
);

// ─── Friends list ────────────────────────────────────────────────

// GET /friends — list friends
friendClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/friends",
    tags: [TAG],
    summary: "List friends for an end user",
    request: {
      query: PaginationQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(FriendRelationshipListSchema,)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { limit, offset } = c.req.valid("query");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const rows = await friendService.listFriends(orgId, endUserId, { limit, offset });
    return c.json(ok({ items: rows.map(serializeRelationship), total: rows.length }), 200);
  },
);

// DELETE /friends/:id — remove friend
friendClientRouter.openapi(
  createClientRoute({
    method: "delete",
    path: "/friends/{id}",
    tags: [TAG],
    summary: "Remove a friend",
    request: {
      params: RelationshipIdParamSchema,
    },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const orgId = c.get("clientCredential")!.organizationId;
    await friendService.removeFriend(orgId, id);
    return c.json(ok(null), 200);
  },
);

// GET /friends/mutual — mutual friends
friendClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/friends/mutual",
    tags: [TAG],
    summary: "List mutual friends between two users",
    request: { query: MutualFriendsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(FriendRelationshipListSchema,)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { withUserId } = c.req.valid("query");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const rows = await friendService.getMutualFriends(orgId, endUserId, withUserId);
    // Raw SQL returns snake_case — map to camelCase
    const items = rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      userA: r.user_a,
      userB: r.user_b,
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      createdAt: typeof r.created_at === "string" ? r.created_at : String(r.created_at),
    }));
    return c.json(ok({ items, total: items.length }), 200);
  },
);

// ─── Blocks ──────────────────────────────────────────────────────

// POST /blocks — block user
friendClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/blocks",
    tags: [TAG],
    summary: "Block a user",
    request: {
      body: {
        content: { "application/json": { schema: ClientBlockSchema } },
      },
    },
    responses: {
      200: {
        description: "Blocked",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { blockedUserId } = c.req.valid("json");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    await friendService.blockUser(orgId, endUserId, blockedUserId);
    return c.json(ok(null), 200);
  },
);

// DELETE /blocks/:blockedUserId — unblock user
friendClientRouter.openapi(
  createClientRoute({
    method: "delete",
    path: "/blocks/{blockedUserId}",
    tags: [TAG],
    summary: "Unblock a user",
    request: {
      params: BlockedUserIdParamSchema,
    },
    responses: {
      200: {
        description: "Unblocked",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { blockedUserId } = c.req.valid("param");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    await friendService.unblockUser(orgId, endUserId, blockedUserId);
    return c.json(ok(null), 200);
  },
);

// GET /blocks — list blocked users
friendClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/blocks",
    tags: [TAG],
    summary: "List blocked users",
    request: {},
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(FriendBlockListSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const rows = await friendService.listBlocks(orgId, endUserId);
    return c.json(ok({ items: rows.map(serializeBlock) }), 200);
  },
);
