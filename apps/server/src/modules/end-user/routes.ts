/**
 * Admin-facing HTTP routes for the end-user module.
 *
 * Currently exposes:
 *   POST   /sync                     — upsert from a tenant-owned identity
 *   GET    /                         — list players in the current org
 *   GET    /:id                      — single player view
 *   PATCH  /:id                      — update name / image / emailVerified
 *   POST   /:id/disable              — soft-ban + revoke all sessions
 *   POST   /:id/enable               — lift the soft-ban
 *   POST   /:id/sign-out-all         — revoke sessions without banning
 *   DELETE /:id                      — hard delete (cascades)
 *   GET    /sessions                 — list all sessions for the org
 *   GET    /:id/sessions             — list sessions for a single player
 *   DELETE /:id/sessions/:sessionId  — revoke a specific session
 *   GET    /accounts                 — list all auth accounts for the org
 *   GET    /:id/accounts             — list auth accounts for a single player
 *   GET    /verifications            — list email verifications for the org
 *
 * All routes are behind `requireTenantSessionOrApiKey` — tenant backends hit
 * these with their admin API key, never with the cpk_ publishable key.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";

import { endUserService } from "./index";
import {
  EndUserIdParamSchema,
  EndUserListResponseSchema,
  EndUserViewSchema,
  ListEndUsersQuerySchema,
  SignOutAllResponseSchema,
  SyncEndUserResponseSchema,
  SyncEndUserSchema,
  UpdateEndUserSchema,
  EndUserSessionViewSchema,
  EndUserSessionIdParamSchema,
  EndUserSessionListResponseSchema,
  ListEndUserSessionsQuerySchema,
  EndUserAccountViewSchema,
  EndUserAccountListResponseSchema,
  ListEndUserAccountsQuerySchema,
  EndUserVerificationListResponseSchema,
  ListEndUserVerificationsQuerySchema,
} from "./validators";

const TAG = "End User";

export const endUserRouter = createAdminRouter();

endUserRouter.use("*", requireTenantSessionOrApiKey);
endUserRouter.use("*", requirePermissionByMethod("endUser"));

// POST /sync — upsert from tenant identity
endUserRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/sync",
    tags: [TAG],
    summary:
      "Upsert an end-user from a tenant-owned identity; safe to call repeatedly",
    request: {
      body: {
        content: { "application/json": { schema: SyncEndUserSchema } },
      },
    },
    responses: {
      200: {
        description: "Merged onto an existing end-user",
        content: {
          "application/json": { schema: envelopeOf(SyncEndUserResponseSchema) },
        },
      },
      201: {
        description: "New end-user created",
        content: {
          "application/json": { schema: envelopeOf(SyncEndUserResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const result = await endUserService.syncUser(orgId, input);
    return c.json(ok(result), result.created ? 201 : 200);
  },
);

// GET / — list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List end-users for the current org",
    request: { query: ListEndUsersQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(EndUserListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const result = await endUserService.list(orgId, q);
    return c.json(ok(result), 200);
  },
);

// GET /:id
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{id}",
    tags: [TAG],
    summary: "Get an end-user by id",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(EndUserViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.get(orgId, id)), 200);
  },
);

// PATCH /:id
endUserRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{id}",
    tags: [TAG],
    summary: "Patch name / image / emailVerified on an end-user",
    request: {
      params: EndUserIdParamSchema,
      body: { content: { "application/json": { schema: UpdateEndUserSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(EndUserViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    return c.json(ok(await endUserService.update(orgId, id, input)), 200);
  },
);

// POST /:id/disable
endUserRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{id}/disable",
    tags: [TAG],
    summary: "Soft-ban the end-user; revokes all active sessions",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Disabled",
        content: { "application/json": { schema: envelopeOf(EndUserViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.setDisabled(orgId, id, true)), 200);
  },
);

// POST /:id/enable
endUserRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{id}/enable",
    tags: [TAG],
    summary: "Lift the soft-ban on an end-user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Enabled",
        content: { "application/json": { schema: envelopeOf(EndUserViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.setDisabled(orgId, id, false)), 200);
  },
);

// POST /:id/sign-out-all
endUserRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{id}/sign-out-all",
    tags: [TAG],
    summary: "Revoke all active sessions without banning the user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Revoked",
        content: { "application/json": { schema: envelopeOf(SignOutAllResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.signOutAll(orgId, id)), 200);
  },
);

// DELETE /:id
endUserRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}",
    tags: [TAG],
    summary: "Hard-delete an end-user (cascades eu_session / eu_account)",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await endUserService.remove(orgId, id);
    return c.json(ok(null), 200);
  },
);

const SESSION_TAG = "End User Session";
const ACCOUNT_TAG = "End User Account";
const VERIFICATION_TAG = "End User Verification";

// GET /sessions — org-level session list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/sessions",
    tags: [SESSION_TAG],
    summary: "List all active sessions for the current org",
    request: { query: ListEndUserSessionsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndUserSessionListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    return c.json(ok(await endUserService.listSessions(orgId, q)), 200);
  },
);

// GET /:id/sessions — per-player session list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{id}/sessions",
    tags: [SESSION_TAG],
    summary: "List sessions for a single end-user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndUserSessionViewSchema.array()),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.getUserSessions(orgId, id)), 200);
  },
);

// DELETE /:id/sessions/:sessionId — revoke a specific session
endUserRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{id}/sessions/{sessionId}",
    tags: [SESSION_TAG],
    summary: "Revoke a specific session for an end-user",
    request: { params: EndUserSessionIdParamSchema },
    responses: {
      200: {
        description: "Revoked",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id, sessionId } = c.req.valid("param");
    await endUserService.revokeSession(orgId, id, sessionId);
    return c.json(ok(null), 200);
  },
);

// GET /accounts — org-level account list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/accounts",
    tags: [ACCOUNT_TAG],
    summary: "List all auth accounts for the current org",
    request: { query: ListEndUserAccountsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndUserAccountListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    return c.json(ok(await endUserService.listAccounts(orgId, q)), 200);
  },
);

// GET /:id/accounts — per-player account list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{id}/accounts",
    tags: [ACCOUNT_TAG],
    summary: "List auth accounts for a single end-user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndUserAccountViewSchema.array()),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.getUserAccounts(orgId, id)), 200);
  },
);

// GET /verifications — org-level email verification list
endUserRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/verifications",
    tags: [VERIFICATION_TAG],
    summary: "List email verification records for the current org",
    request: { query: ListEndUserVerificationsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndUserVerificationListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    return c.json(ok(await endUserService.listVerifications(orgId, q)), 200);
  },
);
