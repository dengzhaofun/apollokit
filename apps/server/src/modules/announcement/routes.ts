/**
 * Admin-facing HTTP routes for the announcement module.
 *
 * Guarded by `requireAdminOrApiKey`. Structure mirrors the banner router —
 * serialize → call service → onError maps ModuleError to JSON.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { announcementService } from "./index";
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
} from "./types";
import {
  AliasParamSchema,
  AnnouncementListResponseSchema,
  AnnouncementResponseSchema,
  CreateAnnouncementSchema,
  ErrorResponseSchema,
  ListAnnouncementsQuerySchema,
  UpdateAnnouncementSchema,
} from "./validators";

const TAG = "Announcement (Admin)";

function serialize(row: Announcement) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    kind: row.kind as AnnouncementKind,
    title: row.title,
    body: row.body,
    coverImageUrl: row.coverImageUrl,
    ctaUrl: row.ctaUrl,
    ctaLabel: row.ctaLabel,
    priority: row.priority,
    severity: row.severity as AnnouncementSeverity,
    isActive: row.isActive,
    visibleFrom: row.visibleFrom?.toISOString() ?? null,
    visibleUntil: row.visibleUntil?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const announcementRouter = createAdminRouter();

announcementRouter.use("*", requireAdminOrApiKey);

announcementRouter.onError((err, c) => {
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

announcementRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List announcements for the active org",
    request: { query: ListAnnouncementsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AnnouncementListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const filter = c.req.valid("query");
    const items = await announcementService.list(orgId, filter);
    return c.json({ items: items.map(serialize) }, 200);
  },
);

announcementRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/",
    tags: [TAG],
    summary: "Create a new announcement",
    request: {
      body: {
        content: { "application/json": { schema: CreateAnnouncementSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: AnnouncementResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await announcementService.create(
      orgId,
      input,
      c.var.user?.id ?? null,
    );
    return c.json(serialize(row), 201);
  },
);

announcementRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{alias}",
    tags: [TAG],
    summary: "Get an announcement by alias",
    request: { params: AliasParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AnnouncementResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { alias } = c.req.valid("param");
    const row = await announcementService.getByAlias(orgId, alias);
    return c.json(serialize(row), 200);
  },
);

announcementRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{alias}",
    tags: [TAG],
    summary: "Update an announcement",
    request: {
      params: AliasParamSchema,
      body: {
        content: { "application/json": { schema: UpdateAnnouncementSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AnnouncementResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { alias } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await announcementService.update(orgId, alias, input);
    return c.json(serialize(row), 200);
  },
);

announcementRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/{alias}",
    tags: [TAG],
    summary: "Delete an announcement",
    request: { params: AliasParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { alias } = c.req.valid("param");
    await announcementService.remove(orgId, alias);
    return c.body(null, 204);
  },
);
