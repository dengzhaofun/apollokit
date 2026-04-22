/**
 * Admin-facing HTTP routes for the banner module.
 *
 * Guarded by `requireAdminOrApiKey`. Structure mirrors mail/shop admin
 * routers — serialize → call service → onError maps ModuleError to JSON.
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
import type { LinkAction } from "../link/types";
import { bannerService } from "./index";
import type {
  Banner,
  BannerGroup,
  BannerLayout,
  BannerTargetType,
} from "./types";
import {
  BannerGroupListResponseSchema,
  BannerGroupResponseSchema,
  BannerListResponseSchema,
  BannerResponseSchema,
  CreateBannerGroupSchema,
  CreateBannerSchema,
  GroupIdParamSchema,
  IdParamSchema,
  ReorderBannersSchema,
  UpdateBannerGroupSchema,
  UpdateBannerSchema,
} from "./validators";

const TAG = "Banner (Admin)";

function serializeGroup(row: BannerGroup) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    layout: row.layout as BannerLayout,
    intervalMs: row.intervalMs,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeBanner(row: Banner) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    groupId: row.groupId,
    title: row.title,
    imageUrlMobile: row.imageUrlMobile,
    imageUrlDesktop: row.imageUrlDesktop,
    altText: row.altText,
    linkAction: row.linkAction as LinkAction,
    sortOrder: row.sortOrder,
    visibleFrom: row.visibleFrom?.toISOString() ?? null,
    visibleUntil: row.visibleUntil?.toISOString() ?? null,
    targetType: row.targetType as BannerTargetType,
    targetUserIds: row.targetUserIds ?? null,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const bannerRouter = makeApiRouter();

bannerRouter.use("*", requireAdminOrApiKey);

// ─── Groups ────────────────────────────────────────────────────

bannerRouter.openapi(
  createRoute({
    method: "get",
    path: "/groups",
    tags: [TAG],
    summary: "List all banner groups for the active org",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(BannerGroupListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const activityId = c.req.query("activityId") ?? undefined;
    const includeActivity = c.req.query("includeActivity") === "true";
    const items = await bannerService.listGroups(orgId, {
      activityId,
      includeActivity,
    });
    return c.json(ok({ items: items.map(serializeGroup) }), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "post",
    path: "/groups",
    tags: [TAG],
    summary: "Create a new banner group",
    request: {
      body: {
        content: { "application/json": { schema: CreateBannerGroupSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(BannerGroupResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await bannerService.createGroup(orgId, input);
    return c.json(ok(serializeGroup(row)), 201);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "get",
    path: "/groups/{id}",
    tags: [TAG],
    summary: "Get a banner group by id",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerGroupResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await bannerService.getGroup(orgId, id);
    return c.json(ok(serializeGroup(row)), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{id}",
    tags: [TAG],
    summary: "Update a banner group",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateBannerGroupSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerGroupResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.updateGroup(orgId, id, input);
    return c.json(ok(serializeGroup(row)), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "delete",
    path: "/groups/{id}",
    tags: [TAG],
    summary: "Delete a banner group (cascades to banners)",
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
    await bannerService.deleteGroup(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Banners within a group ────────────────────────────────────

bannerRouter.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/banners",
    tags: [TAG],
    summary: "List banners inside a group",
    request: { params: GroupIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const rows = await bannerService.listBanners(orgId, groupId);
    return c.json(ok({ items: rows.map(serializeBanner) }), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/banners",
    tags: [TAG],
    summary: "Add a banner to a group",
    request: {
      params: GroupIdParamSchema,
      body: {
        content: { "application/json": { schema: CreateBannerSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(BannerResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.createBanner(orgId, groupId, input);
    return c.json(ok(serializeBanner(row)), 201);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/banners/reorder",
    tags: [TAG],
    summary: "Reorder banners inside a group (full ordered set required)",
    request: {
      params: GroupIdParamSchema,
      body: {
        content: { "application/json": { schema: ReorderBannersSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const { bannerIds } = c.req.valid("json");
    const rows = await bannerService.reorderBanners(orgId, groupId, bannerIds);
    return c.json(ok({ items: rows.map(serializeBanner) }), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "get",
    path: "/banners/{id}",
    tags: [TAG],
    summary: "Get a banner by id",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await bannerService.getBanner(orgId, id);
    return c.json(ok(serializeBanner(row)), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "patch",
    path: "/banners/{id}",
    tags: [TAG],
    summary: "Update a banner",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateBannerSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BannerResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.updateBanner(orgId, id, input);
    return c.json(ok(serializeBanner(row)), 200);
  },
);

bannerRouter.openapi(
  createRoute({
    method: "delete",
    path: "/banners/{id}",
    tags: [TAG],
    summary: "Delete a banner",
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
    await bannerService.deleteBanner(orgId, id);
    return c.json(ok(null), 200);
  },
);
