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
 * The tenantId is resolved from the client credential (via
 * middleware), not from a session.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import type { InboxMessage, MailUserState } from "./types";
import { mailService } from "./index";
import {
  ClaimResultResponseSchema,
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

export const mailClientRouter = createClientRouter();

mailClientRouter.use("*", requireClientCredential);
mailClientRouter.use("*", requireClientUser);

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
        content: { "application/json": { schema: envelopeOf(InboxListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { since, limit } = c.req.valid("query");
    const { items } = await mailService.listInbox(orgId, endUserId, {
      since: since ? new Date(since) : undefined,
      limit,
    });
    return c.json(ok({ items: items.map(serializeInbox) }), 200);
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
        content: { "application/json": { schema: envelopeOf(InboxItemResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const row = await mailService.getInboxMessage(orgId, endUserId, id);
    return c.json(ok(serializeInbox(row)), 200);
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
          "application/json": { schema: envelopeOf(MailUserStateResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const state = await mailService.markRead(orgId, endUserId, id);
    return c.json(ok(serializeUserState(state)), 200);
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
        content: { "application/json": { schema: envelopeOf(ClaimResultResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const result = await mailService.claim(orgId, endUserId, id);
    return c.json(ok({
        messageId: result.messageId,
        endUserId: result.endUserId,
        rewards: result.rewards,
        claimedAt: result.claimedAt.toISOString(),
        readAt: result.readAt?.toISOString() ?? null,
      }), 200,);
  },
);
