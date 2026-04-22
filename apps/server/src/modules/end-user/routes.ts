/**
 * Admin-facing HTTP routes for the end-user module.
 *
 * Currently exposes:
 *   POST   /sync                — upsert from a tenant-owned identity
 *   GET    /                    — list players in the current org
 *   GET    /:id                 — single player view
 *   PATCH  /:id                 — update name / image / emailVerified
 *   POST   /:id/disable         — soft-ban + revoke all sessions
 *   POST   /:id/enable          — lift the soft-ban
 *   POST   /:id/sign-out-all    — revoke sessions without banning
 *   DELETE /:id                 — hard delete (cascades)
 *
 * All routes are behind `requireAdminOrApiKey` — tenant backends hit
 * these with their admin API key, never with the cpk_ publishable key.
 */

import { createRoute } from "@hono/zod-openapi";

import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { makeApiRouter } from "../../lib/router";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";

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
} from "./validators";

const TAG = "End User";

export const endUserRouter = makeApiRouter();

endUserRouter.use("*", requireAdminOrApiKey);

// POST /sync — upsert from tenant identity
endUserRouter.openapi(
  createRoute({
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
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const result = await endUserService.syncUser(orgId, input);
    return c.json(ok(result), result.created ? 201 : 200);
  },
);

// GET / — list
endUserRouter.openapi(
  createRoute({
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
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const result = await endUserService.list(orgId, q);
    return c.json(ok(result), 200);
  },
);

// GET /:id
endUserRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: [TAG],
    summary: "Get an end-user by id",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(EndUserViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.get(orgId, id)), 200);
  },
);

// PATCH /:id
endUserRouter.openapi(
  createRoute({
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
        content: {
          "application/json": { schema: envelopeOf(EndUserViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    return c.json(ok(await endUserService.update(orgId, id, input)), 200);
  },
);

// POST /:id/disable
endUserRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/disable",
    tags: [TAG],
    summary: "Soft-ban the end-user; revokes all active sessions",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Disabled",
        content: {
          "application/json": { schema: envelopeOf(EndUserViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.setDisabled(orgId, id, true)), 200);
  },
);

// POST /:id/enable
endUserRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/enable",
    tags: [TAG],
    summary: "Lift the soft-ban on an end-user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Enabled",
        content: {
          "application/json": { schema: envelopeOf(EndUserViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.setDisabled(orgId, id, false)), 200);
  },
);

// POST /:id/sign-out-all
endUserRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/sign-out-all",
    tags: [TAG],
    summary: "Revoke all active sessions without banning the user",
    request: { params: EndUserIdParamSchema },
    responses: {
      200: {
        description: "Revoked",
        content: {
          "application/json": { schema: envelopeOf(SignOutAllResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(ok(await endUserService.signOutAll(orgId, id)), 200);
  },
);

// DELETE /:id
endUserRouter.openapi(
  createRoute({
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await endUserService.remove(orgId, id);
    return c.json(ok(null), 200);
  },
);
