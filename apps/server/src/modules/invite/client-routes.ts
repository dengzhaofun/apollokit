/**
 * C-end client routes for the invite module.
 *
 * Mounted at /api/invite/client. Two auth flavors share the same
 * requireClientCredential middleware (which only validates publishable
 * key existence / enabled / expired) — each handler then calls the
 * appropriate verification method:
 *
 *   - HMAC flow  (my-code, summary, invitees, reset-my-code):
 *     handler calls clientCredentialService.verifyRequest(pk, endUserId, userHash).
 *     Used by the end user's client (browser / game client) proving its
 *     identity = endUserId via HMAC(endUserId, clientSecret).
 *
 *   - Server flow (bind, qualify):
 *     handler reads x-api-secret header and calls
 *     clientCredentialService.verifyServerRequest(pk, providedSecret).
 *     Used by the customer's own game server (it has the secret).
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { InvalidSecret } from "../client-credentials/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { inviteService } from "./index";
import {
  ClientBindBodySchema,
  ClientMyCodeQuerySchema,
  ClientQualifyBodySchema,
  ClientResetCodeBodySchema,
  ErrorResponseSchema,
  InviteCodeViewSchema,
  InviteRelationshipListSchema,
  InviteRelationshipViewSchema,
  InviteSummaryViewSchema,
  PaginationQuerySchema,
} from "./validators";

const TAG = "Invite (Client)";

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

export const inviteClientRouter = new OpenAPIHono<HonoEnv>();

inviteClientRouter.use("*", requireClientCredential);

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

async function requireServerSecret(c: Context<HonoEnv>): Promise<string> {
  const cred = c.get("clientCredential")!;
  const providedSecret = c.req.header("x-api-secret");
  if (!providedSecret) throw new InvalidSecret();
  await clientCredentialService.verifyServerRequest(cred.publishableKey, providedSecret);
  return cred.organizationId;
}

/* ── GET /my-code (HMAC flow) ─────────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/my-code",
    tags: [TAG],
    request: { query: ClientMyCodeQuerySchema },
    responses: {
      200: {
        description: "Current invite code (generated on first call).",
        content: { "application/json": { schema: InviteCodeViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const orgId = cred.organizationId;
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

/* ── POST /reset-my-code (HMAC flow) ─────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/reset-my-code",
    tags: [TAG],
    request: {
      body: {
        content: { "application/json": { schema: ClientResetCodeBodySchema } },
      },
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
    const cred = c.get("clientCredential")!;
    const body = c.req.valid("json");
    await clientCredentialService.verifyRequest(cred.publishableKey, body.endUserId, body.userHash);
    const result = await inviteService.resetCode(cred.organizationId, body.endUserId);
    return c.json(
      {
        code: result.code,
        rotatedAt: result.rotatedAt.toISOString(),
      },
      200,
    );
  },
);

/* ── GET /summary (HMAC flow) ─────────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/summary",
    tags: [TAG],
    request: { query: ClientMyCodeQuerySchema },
    responses: {
      200: {
        description: "Summary for the end user.",
        content: { "application/json": { schema: InviteSummaryViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const summary = await inviteService.getSummary(cred.organizationId, endUserId);
    return c.json(serializeSummary(summary), 200);
  },
);

/* ── GET /invitees (HMAC flow) ────────────────────────────── */

const InviteesQuerySchema = ClientMyCodeQuerySchema.merge(PaginationQuerySchema);

inviteClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/invitees",
    tags: [TAG],
    request: { query: InviteesQuerySchema },
    responses: {
      200: {
        description: "Paged list of users this end user has invited.",
        content: { "application/json": { schema: InviteRelationshipListSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const cred = c.get("clientCredential")!;
    const { endUserId, userHash, limit, offset } = c.req.valid("query");
    await clientCredentialService.verifyRequest(cred.publishableKey, endUserId, userHash);
    const { items, total } = await inviteService.listMyInvitees(
      cred.organizationId,
      endUserId,
      { limit, offset },
    );
    return c.json({ items: items.map(serializeRelationship), total }, 200);
  },
);

/* ── POST /bind (Server flow) ─────────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/bind",
    tags: [TAG],
    request: {
      headers: z.object({
        "x-api-secret": z.string().openapi({
          description: "Client secret (csk_...). Required for server-to-server calls.",
        }),
      }),
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
    const orgId = await requireServerSecret(c);
    const body = c.req.valid("json");
    const { relationship, alreadyBound } = await inviteService.bind(orgId, body);
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyBound },
      200,
    );
  },
);

/* ── POST /qualify (Server flow) ──────────────────────────── */

inviteClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/qualify",
    tags: [TAG],
    request: {
      headers: z.object({
        "x-api-secret": z.string().openapi({
          description: "Client secret (csk_...). Required for server-to-server calls.",
        }),
      }),
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
    const orgId = await requireServerSecret(c);
    const body = c.req.valid("json");
    const { relationship, alreadyQualified } = await inviteService.qualify(orgId, body);
    return c.json(
      { relationship: serializeRelationship(relationship), alreadyQualified },
      200,
    );
  },
);
