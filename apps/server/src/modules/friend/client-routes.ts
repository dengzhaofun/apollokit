/**
 * C-end client routes for the friend module.
 *
 * Protected by `requireClientCredential` — requires a valid client
 * credential (cpk_ publishable key) in the x-api-key header. HMAC
 * verification of endUserId is done inline via the credential service.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { friendService } from "./index";
import {
  ClientActionSchema,
  ClientBlockSchema,
  ClientSendRequestSchema,
  ClientUnblockSchema,
  BlockedUserIdParamSchema,
  EndUserQuerySchema,
  ErrorResponseSchema,
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

export const friendClientRouter = new OpenAPIHono<HonoEnv>();

friendClientRouter.use("*", requireClientCredential);

friendClientRouter.onError((err, c) => {
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

// ─── Friend requests ─────────────────────────────────────────────

// POST /requests — send friend request
friendClientRouter.openapi(
  createRoute({
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
          "application/json": { schema: FriendRequestResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, toUserId, userHash, message } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.sendRequest(orgId, endUserId, toUserId, message);
    return c.json(serializeRequest(row), 201);
  },
);

// GET /requests/incoming — list incoming pending requests
friendClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/requests/incoming",
    tags: [TAG],
    summary: "List incoming pending friend requests",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: FriendRequestListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendService.listIncomingRequests(orgId, endUserId);
    return c.json({ items: rows.map(serializeRequest) }, 200);
  },
);

// GET /requests/outgoing — list outgoing pending requests
friendClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/requests/outgoing",
    tags: [TAG],
    summary: "List outgoing pending friend requests",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: FriendRequestListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendService.listOutgoingRequests(orgId, endUserId);
    return c.json({ items: rows.map(serializeRequest) }, 200);
  },
);

// POST /requests/:id/accept
friendClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/requests/{id}/accept",
    tags: [TAG],
    summary: "Accept a friend request",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendRequestResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.acceptRequest(orgId, id, endUserId);
    return c.json(serializeRequest(row), 200);
  },
);

// POST /requests/:id/reject
friendClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/requests/{id}/reject",
    tags: [TAG],
    summary: "Reject a friend request",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendRequestResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.rejectRequest(orgId, id, endUserId);
    return c.json(serializeRequest(row), 200);
  },
);

// POST /requests/:id/cancel
friendClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/requests/{id}/cancel",
    tags: [TAG],
    summary: "Cancel a friend request (sender only)",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FriendRequestResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendService.cancelRequest(orgId, id, endUserId);
    return c.json(serializeRequest(row), 200);
  },
);

// ─── Friends list ────────────────────────────────────────────────

// GET /friends — list friends
friendClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/friends",
    tags: [TAG],
    summary: "List friends for an end user",
    request: {
      query: EndUserQuerySchema.merge(PaginationQuerySchema),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: FriendRelationshipListSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, limit, offset } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendService.listFriends(orgId, endUserId, { limit, offset });
    return c.json({ items: rows.map(serializeRelationship), total: rows.length }, 200);
  },
);

// DELETE /friends/:id — remove friend
friendClientRouter.openapi(
  createRoute({
    method: "delete",
    path: "/friends/{id}",
    tags: [TAG],
    summary: "Remove a friend",
    request: {
      params: RelationshipIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientActionSchema } },
      },
    },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await friendService.removeFriend(orgId, id);
    return c.body(null, 204);
  },
);

// GET /friends/mutual — mutual friends
friendClientRouter.openapi(
  createRoute({
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
            schema: FriendRelationshipListSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, withUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
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
    return c.json({ items, total: items.length }, 200);
  },
);

// ─── Blocks ──────────────────────────────────────────────────────

// POST /blocks — block user
friendClientRouter.openapi(
  createRoute({
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
      204: { description: "Blocked" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, blockedUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await friendService.blockUser(orgId, endUserId, blockedUserId);
    return c.body(null, 204);
  },
);

// DELETE /blocks/:blockedUserId — unblock user
friendClientRouter.openapi(
  createRoute({
    method: "delete",
    path: "/blocks/{blockedUserId}",
    tags: [TAG],
    summary: "Unblock a user",
    request: {
      params: BlockedUserIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientUnblockSchema } },
      },
    },
    responses: {
      204: { description: "Unblocked" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { blockedUserId } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await friendService.unblockUser(orgId, endUserId, blockedUserId);
    return c.body(null, 204);
  },
);

// GET /blocks — list blocked users
friendClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/blocks",
    tags: [TAG],
    summary: "List blocked users",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: FriendBlockListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendService.listBlocks(orgId, endUserId);
    return c.json({ items: rows.map(serializeBlock) }, 200);
  },
);
