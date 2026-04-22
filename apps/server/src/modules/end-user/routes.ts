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


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";

import { endUserService } from "./index";
import {
  EndUserIdParamSchema,
  EndUserListResponseSchema,
  EndUserViewSchema,
  ErrorResponseSchema,
  ListEndUsersQuerySchema,
  SignOutAllResponseSchema,
  SyncEndUserResponseSchema,
  SyncEndUserSchema,
  UpdateEndUserSchema,
} from "./validators";

const TAG = "End User";

export const endUserRouter = createAdminRouter();

endUserRouter.use("*", requireAdminOrApiKey);

endUserRouter.onError((err, c) => {
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

const commonErrorResponses = {
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

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
          "application/json": { schema: SyncEndUserResponseSchema },
        },
      },
      201: {
        description: "New end-user created",
        content: {
          "application/json": { schema: SyncEndUserResponseSchema },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "Identity conflict",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const result = await endUserService.syncUser(orgId, input);
    return c.json(result, result.created ? 201 : 200);
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
          "application/json": { schema: EndUserListResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const result = await endUserService.list(orgId, q);
    return c.json(result, 200);
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
        content: { "application/json": { schema: EndUserViewSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(await endUserService.get(orgId, id), 200);
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
        content: { "application/json": { schema: EndUserViewSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    return c.json(await endUserService.update(orgId, id, input), 200);
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
        content: { "application/json": { schema: EndUserViewSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(await endUserService.setDisabled(orgId, id, true), 200);
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
        content: { "application/json": { schema: EndUserViewSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(await endUserService.setDisabled(orgId, id, false), 200);
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
        content: { "application/json": { schema: SignOutAllResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    return c.json(await endUserService.signOutAll(orgId, id), 200);
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
      204: { description: "Deleted" },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await endUserService.remove(orgId, id);
    return c.body(null, 204);
  },
);
