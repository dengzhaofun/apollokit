/**
 * Admin-facing HTTP routes for the announcement module.
 *
 * Guarded by `requireTenantSessionOrApiKey`. Structure mirrors the banner router —
 * serialize → call service → onError maps ModuleError to JSON.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
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
  ListAnnouncementsQuerySchema,
  UpdateAnnouncementSchema,
} from "./validators";

const TAG = "Announcement (Admin)";

function serialize(row: Announcement) {
  return {
    id: row.id,
    tenantId: row.tenantId,
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

export const announcementRouter = createAdminRouter();

announcementRouter.use("*", requireTenantSessionOrApiKey);
announcementRouter.use("*", requirePermissionByMethod("announcement"));

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
          "application/json": { schema: envelopeOf(AnnouncementListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const filter = c.req.valid("query");
    const page = await announcementService.list(orgId, filter);
    return c.json(
      ok({ items: page.items.map(serialize), nextCursor: page.nextCursor }),
      200,
    );
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
          "application/json": { schema: envelopeOf(AnnouncementResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await announcementService.create(
      orgId,
      input,
      c.var.user?.id ?? null,
    );
    return c.json(ok(serialize(row)), 201);
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
          "application/json": { schema: envelopeOf(AnnouncementResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { alias } = c.req.valid("param");
    const row = await announcementService.getByAlias(orgId, alias);
    return c.json(ok(serialize(row)), 200);
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
          "application/json": { schema: envelopeOf(AnnouncementResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { alias } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await announcementService.update(orgId, alias, input);
    return c.json(ok(serialize(row)), 200);
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
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { alias } = c.req.valid("param");
    await announcementService.remove(orgId, alias);
    return c.json(ok(null), 200);
  },
);
