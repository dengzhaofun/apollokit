/**
 * C-end client routes for the invite module.
 *
 * Mounted at /api/client/invite. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no auth fields in body or query.
 */


import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { inviteService } from "./index";
import {
  ClientBindBodySchema,
  ClientQualifyBodySchema,
  ErrorResponseSchema,
  InviteCodeViewSchema,
  InviteRelationshipListSchema,
  InviteRelationshipViewSchema,
  InviteSummaryViewSchema,
  PaginationQuerySchema,
} from "./validators";

const TAG = "Invite (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

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
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const inviteClientRouter = createClientRouter();

inviteClientRouter.use("*", requireClientCredential);
inviteClientRouter.use("*", requireClientUser);

inviteClientRouter.onError((err, c) => {
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

/* ── GET /my-code ─────────────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/my-code",
    tags: [TAG],
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "Current invite code (generated on first call).",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const result = await inviteService.getOrCreateMyCode(orgId, endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt?.toISOString() ?? null,
      },
      200,
    );
  },
);

/* ── POST /reset-my-code ──────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/reset-my-code",
    tags: [TAG],
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "Rotated invite code.",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const result = await inviteService.resetCode(orgId, endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt.toISOString(),
      },
      200,
    );
  },
);

/* ── GET /summary ─────────────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/summary",
    tags: [TAG],
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "Summary for the end user.",
        content: { "application/json": { schema: InviteSummaryViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const summary = await inviteService.getSummary(orgId, endUserId);
    return c.json(serializeSummary(summary), 200);
  },
);

/* ── GET /invitees ────────────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/invitees",
    tags: [TAG],
    request: {
      headers: authHeaders,
      query: PaginationQuerySchema,
    },
    responses: {
      200: {
        description: "Paged list of users this end user has invited.",
        content: { "application/json": { schema: InviteRelationshipListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { limit, offset } = c.req.valid("query");
    const { items, total } = await inviteService.listMyInvitees(orgId, endUserId, {
      limit,
      offset,
    });
    return c.json({ items: items.map(serializeRelationship), total }, 200);
  },
);

/* ── POST /bind ───────────────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/bind",
    tags: [TAG],
    request: {
      headers: authHeaders,
      body: {
        content: { "application/json": { schema: ClientBindBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Relationship bound (or existing for idempotent bind).",
        content: {
          "application/json": {
            schema: z
              .object({
                relationship: InviteRelationshipViewSchema,
                alreadyBound: z.boolean(),
              })
              .openapi("BindResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const body = c.req.valid("json");
    const { relationship, alreadyBound } = await inviteService.bind(orgId, {
      code: body.code,
      inviteeEndUserId: c.var.endUserId!,
    });
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyBound },
      200,
    );
  },
);

/* ── POST /qualify ────────────────────────────────────────────── */

inviteClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/qualify",
    tags: [TAG],
    request: {
      headers: authHeaders,
      body: {
        content: { "application/json": { schema: ClientQualifyBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Relationship qualified (or existing for idempotent qualify).",
        content: {
          "application/json": {
            schema: z
              .object({
                relationship: InviteRelationshipViewSchema,
                alreadyQualified: z.boolean(),
              })
              .openapi("QualifyResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const body = c.req.valid("json");
    const { relationship, alreadyQualified } = await inviteService.qualify(orgId, {
      inviteeEndUserId: c.var.endUserId!,
      qualifiedReason: body.qualifiedReason ?? null,
    });
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyQualified },
      200,
    );
  },
);
