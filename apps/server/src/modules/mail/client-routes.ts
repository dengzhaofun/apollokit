/**
 * C-end client routes for the mail module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Exposes the inbox surface:
 *   - GET /messages            — list inbox, optional `since` to filter broadcasts
 *   - GET /messages/:id        — single mail detail (does NOT auto-mark read)
 *   - POST /messages/:id/read  — idempotent read mark
 *   - POST /messages/:id/claim — atomic reward claim
 *
 * The organizationId is resolved from the client credential (via
 * middleware), not from a session.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import type { InboxMessage, MailUserState } from "./types";
import { mailService } from "./index";
import {
  ClaimResultResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
  InboxItemResponseSchema,
  InboxListResponseSchema,
  InboxQuerySchema,
  MailUserStateResponseSchema,
} from "./validators";

const TAG = "Mail (Client)";

function serializeInbox(row: InboxMessage) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    rewards: row.rewards,
    requireRead: row.requireRead,
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
  };
}

function serializeUserState(row: MailUserState) {
  return {
    messageId: row.messageId,
    endUserId: row.endUserId,
    readAt: row.readAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
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
  403: {
    description: "Forbidden",
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

export const mailClientRouter = createClientRouter();

mailClientRouter.use("*", requireClientCredential);
mailClientRouter.use("*", requireClientUser);

mailClientRouter.onError((err, c) => {
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

// GET /messages — inbox
mailClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/messages",
    tags: [TAG],
    summary: "List an end user's mail inbox",
    request: { query: InboxQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: InboxListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { since, limit } = c.req.valid("query");
    const { items } = await mailService.listInbox(orgId, endUserId, {
      since: since ? new Date(since) : undefined,
      limit,
    });
    return c.json({ items: items.map(serializeInbox) }, 200);
  },
);

// GET /messages/:id — detail
mailClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/messages/{id}",
    tags: [TAG],
    summary: "Get a single inbox message (does not auto-mark read)",
    request: {
      params: IdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: InboxItemResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const row = await mailService.getInboxMessage(orgId, endUserId, id);
    return c.json(serializeInbox(row), 200);
  },
);

// POST /messages/:id/read — mark as read
mailClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/messages/{id}/read",
    tags: [TAG],
    summary: "Mark a mail message as read (idempotent)",
    request: {
      params: IdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: MailUserStateResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const state = await mailService.markRead(orgId, endUserId, id);
    return c.json(serializeUserState(state), 200);
  },
);

// POST /messages/:id/claim — claim rewards
mailClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/messages/{id}/claim",
    tags: [TAG],
    summary: "Claim rewards attached to a mail message",
    request: {
      params: IdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ClaimResultResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const result = await mailService.claim(orgId, endUserId, id);
    return c.json(
      {
        messageId: result.messageId,
        endUserId: result.endUserId,
        rewards: result.rewards,
        claimedAt: result.claimedAt.toISOString(),
        readAt: result.readAt?.toISOString() ?? null,
      },
      200,
    );
  },
);
