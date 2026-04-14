/**
 * C-end client routes for the mail module.
 *
 * Protected by `requireClientCredential` — requires a valid client
 * credential (cpk_ publishable key) in the x-api-key header. HMAC
 * verification of endUserId is done inline via the credential service.
 *
 * Exposes the inbox surface:
 *   - GET /messages          — list inbox, optional `since` to filter broadcasts
 *   - GET /messages/:id      — single mail detail (does NOT auto-mark read)
 *   - POST /messages/:id/read  — idempotent read mark
 *   - POST /messages/:id/claim — atomic reward claim
 *
 * The organizationId is resolved from the client credential (via
 * middleware), not from a session.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import type { InboxMessage, MailUserState } from "./types";
import { mailService } from "./index";
import {
  ClaimResultResponseSchema,
  EndUserBodySchema,
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

export const mailClientRouter = new OpenAPIHono<HonoEnv>();

mailClientRouter.use("*", requireClientCredential);

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
  createRoute({
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
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, since, limit } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const { items } = await mailService.listInbox(orgId, endUserId, {
      since: since ? new Date(since) : undefined,
      limit,
    });
    return c.json({ items: items.map(serializeInbox) }, 200);
  },
);

// GET /messages/:id — detail
mailClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/messages/{id}",
    tags: [TAG],
    summary: "Get a single inbox message (does not auto-mark read)",
    request: {
      params: IdParamSchema,
      query: InboxQuerySchema.pick({ endUserId: true }),
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const row = await mailService.getInboxMessage(orgId, endUserId, id);
    return c.json(serializeInbox(row), 200);
  },
);

// POST /messages/:id/read — mark as read
mailClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/messages/{id}/read",
    tags: [TAG],
    summary: "Mark a mail message as read (idempotent)",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: EndUserBodySchema } } },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const state = await mailService.markRead(orgId, endUserId, id);
    return c.json(serializeUserState(state), 200);
  },
);

// POST /messages/:id/claim — claim rewards
mailClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/messages/{id}/claim",
    tags: [TAG],
    summary: "Claim rewards attached to a mail message",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: EndUserBodySchema } } },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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
