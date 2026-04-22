/**
 * Admin-facing HTTP routes for the mail module.
 *
 * Admins can send, list, inspect, revoke, and hard-delete mail messages.
 * Programmatic idempotency fields (`originSource`, `originSourceId`) are
 * NOT exposed on admin HTTP — admin manual sends always leave those null
 * and bypass the partial-unique origin index. Programmatic callers go
 * through `mailService.createMessage` / `sendUnicast` directly.
 */

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import type { MailMessage, MailMessageWithStats } from "./types";
import { mailService } from "./index";
import {
  CreateMailSchema,
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

export const mailRouter = makeApiRouter();

mailRouter.use("*", requireAdminOrApiKey);

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
        content: { "application/json": { schema: envelopeOf(MailMessageResponseSchema) } },
      },
      ...commonErrorResponses,
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
    return c.json(ok(serializeMessage(row)), 201);
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
        content: { "application/json": { schema: envelopeOf(MailListResponseSchema) } },
      },
      ...commonErrorResponses,
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
      ok({ items: items.map(serializeMessage), nextCursor }),
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
          "application/json": { schema: envelopeOf(MailMessageWithStatsResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await mailService.getMessage(orgId, id);
    return c.json(ok(serializeMessageWithStats(row)), 200);
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
      200: {
        description: "Revoked",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mailService.revokeMessage(orgId, id);
    return c.json(ok(null), 200);
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
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await mailService.deleteMessage(orgId, id);
    return c.json(ok(null), 200);
  },
);
