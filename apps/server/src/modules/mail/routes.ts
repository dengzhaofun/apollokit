/**
 * Admin-facing HTTP routes for the mail module.
 *
 * Admins can send, list, inspect, revoke, and hard-delete mail messages.
 * Programmatic idempotency fields (`originSource`, `originSourceId`) are
 * NOT exposed on admin HTTP — admin manual sends always leave those null
 * and bypass the partial-unique origin index. Programmatic callers go
 * through `mailService.createMessage` / `sendUnicast` directly.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import type { MailMessage, MailMessageWithStats } from "./types";
import { ModuleError } from "./errors";
import { mailService } from "./index";
import {
  CreateMailSchema,
  ErrorResponseSchema,
  IdParamSchema,
  ListMailQuerySchema,
  MailListResponseSchema,
  MailMessageResponseSchema,
  MailMessageWithStatsResponseSchema,
} from "./validators";

const TAG = "Mail (Admin)";

function serializeMessage(row: MailMessage) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    content: row.content,
    rewards: row.rewards as RewardEntry[],
    targetType: row.targetType as "broadcast" | "multicast",
    targetUserIds: row.targetUserIds ?? null,
    requireRead: row.requireRead,
    senderAdminId: row.senderAdminId,
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    originSource: row.originSource,
    originSourceId: row.originSourceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMessageWithStats(row: MailMessageWithStats) {
  return {
    ...serializeMessage(row),
    readCount: row.readCount,
    claimCount: row.claimCount,
    targetCount: row.targetCount,
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

export const mailRouter = new OpenAPIHono<HonoEnv>();

mailRouter.use("*", requireAdminOrApiKey);

mailRouter.onError((err, c) => {
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

// POST /messages — send a broadcast or multicast mail
mailRouter.openapi(
  createRoute({
    method: "post",
    path: "/messages",
    tags: [TAG],
    summary: "Send a mail message (broadcast or multicast)",
    request: {
      body: { content: { "application/json": { schema: CreateMailSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: MailMessageResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const adminId = c.var.user?.id ?? null;
    const input = c.req.valid("json");
    const row = await mailService.createMessage(orgId, {
      ...input,
      senderAdminId: adminId,
    });
    return c.json(serializeMessage(row), 201);
  },
);

// GET /messages — list mail messages with cursor pagination
mailRouter.openapi(
  createRoute({
    method: "get",
    path: "/messages",
    tags: [TAG],
    summary: "List mail messages for the active org",
    request: { query: ListMailQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: MailListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const query = c.req.valid("query");
    const { items, nextCursor } = await mailService.listMessages(orgId, {
      limit: query.limit,
      cursor: query.cursor,
      targetType: query.targetType,
    });
    return c.json(
      { items: items.map(serializeMessage), nextCursor },
      200,
    );
  },
);

// GET /messages/:id — detail + aggregate stats
mailRouter.openapi(
  createRoute({
    method: "get",
    path: "/messages/{id}",
    tags: [TAG],
    summary: "Get a mail message by id (with read/claim stats)",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: MailMessageWithStatsResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await mailService.getMessage(orgId, id);
    return c.json(serializeMessageWithStats(row), 200);
  },
);

// POST /messages/:id/revoke — soft delete
mailRouter.openapi(
  createRoute({
    method: "post",
    path: "/messages/{id}/revoke",
    tags: [TAG],
    summary: "Revoke (soft-delete) a mail message",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Revoked" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mailService.revokeMessage(orgId, id);
    return c.body(null, 204);
  },
);

// DELETE /messages/:id — hard delete (cascades to mail_user_states)
mailRouter.openapi(
  createRoute({
    method: "delete",
    path: "/messages/{id}",
    tags: [TAG],
    summary: "Hard-delete a mail message (cascades to user states)",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mailService.deleteMessage(orgId, id);
    return c.body(null, 204);
  },
);
