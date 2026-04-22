/**
 * Admin-facing routes for the invite module.
 *
 * Mounted at /api/invite in src/index.ts. Session cookie required;
 * organizationId is read from session.activeOrganizationId.
 */


import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import { inviteService } from "./index";
import {
  AdminListRelationshipsQuerySchema,
  EndUserIdParamSchema,
  ErrorResponseSchema,
  InviteCodeViewSchema,
  InviteRelationshipListSchema,
  InviteRelationshipViewSchema,
  InviteSettingsViewSchema,
  InviteSummaryViewSchema,
  RelationshipIdParamSchema,
  UpsertInviteSettingsSchema,
} from "./validators";

const TAG = "Invite (Admin)";

function serializeSettings(row: {
  organizationId: string;
  enabled: boolean;
  codeLength: number;
  allowSelfInvite: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    organizationId: row.organizationId,
    enabled: row.enabled,
    codeLength: row.codeLength,
    allowSelfInvite: row.allowSelfInvite,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRelationship(row: {
  id: string;
  organizationId: string;
  inviterEndUserId: string;
  inviteeEndUserId: string;
  inviterCodeSnapshot: string;
  boundAt: Date;
  qualifiedAt: Date | null;
  qualifiedReason: string | null;
  metadata: unknown;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    inviterEndUserId: row.inviterEndUserId,
    inviteeEndUserId: row.inviteeEndUserId,
    inviterCodeSnapshot: row.inviterCodeSnapshot,
    boundAt: row.boundAt.toISOString(),
    qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    qualifiedReason: row.qualifiedReason,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  };
}

function serializeSummary(s: {
  myCode: string;
  myCodeRotatedAt: Date | null;
  boundCount: number;
  qualifiedCount: number;
  invitedBy: { inviterEndUserId: string; boundAt: Date; qualifiedAt: Date | null } | null;
}) {
  return {
    myCode: s.myCode,
    myCodeRotatedAt: s.myCodeRotatedAt?.toISOString() ?? null,
    boundCount: s.boundCount,
    qualifiedCount: s.qualifiedCount,
    invitedBy: s.invitedBy
      ? {
          inviterEndUserId: s.invitedBy.inviterEndUserId,
          boundAt: s.invitedBy.boundAt.toISOString(),
          qualifiedAt: s.invitedBy.qualifiedAt?.toISOString() ?? null,
        }
      : null,
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
};

export const inviteRouter = createAdminRouter();

inviteRouter.use("*", requireAuth);

inviteRouter.onError((err, c) => {
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

/* ── GET /settings ────────────────────────────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    responses: {
      200: {
        description: "Current invite settings (or defaults if never upserted).",
        content: {
          "application/json": {
            schema: InviteSettingsViewSchema.nullable(),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await inviteService.getSettings(orgId);
    return c.json(row ? serializeSettings(row) : null, 200);
  },
);

/* ── PUT /settings ────────────────────────────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    request: {
      body: {
        content: { "application/json": { schema: UpsertInviteSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "Updated settings row.",
        content: {
          "application/json": { schema: InviteSettingsViewSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const row = await inviteService.upsertSettings(orgId, body);
    return c.json(serializeSettings(row), 200);
  },
);

/* ── GET /relationships ──────────────────────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/relationships",
    tags: [TAG],
    request: { query: AdminListRelationshipsQuerySchema },
    responses: {
      200: {
        description: "Paged invite relationships.",
        content: {
          "application/json": { schema: InviteRelationshipListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const query = c.req.valid("query");
    const { items, total } = await inviteService.adminListRelationships(orgId, {
      limit: query.limit,
      offset: query.offset,
      inviterEndUserId: query.inviterEndUserId,
      qualifiedOnly: query.qualifiedOnly,
    });
    return c.json(
      { items: items.map(serializeRelationship), total },
      200,
    );
  },
);

/* ── DELETE /relationships/:id ───────────────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/relationships/{id}",
    tags: [TAG],
    request: { params: RelationshipIdParamSchema },
    responses: {
      204: { description: "Deleted." },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await inviteService.adminRevokeRelationship(orgId, id);
    return c.body(null, 204);
  },
);

/* ── GET /users/:endUserId/stats ─────────────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/users/{endUserId}/stats",
    tags: [TAG],
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Summary for an end user.",
        content: { "application/json": { schema: InviteSummaryViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const summary = await inviteService.adminGetUserStats(orgId, endUserId);
    return c.json(serializeSummary(summary), 200);
  },
);

/* ── POST /users/:endUserId/reset-code ───────────────────── */

inviteRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/users/{endUserId}/reset-code",
    tags: [TAG],
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "New code generated.",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const result = await inviteService.adminResetUserCode(orgId, endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt.toISOString(),
      },
      200,
    );
  },
);

// Suppress unused-import warning if `z` ends up not being referenced here.
void z;

// Suppress unused-import warnings for schemas only used in openapi declarations.
void InviteRelationshipViewSchema;
