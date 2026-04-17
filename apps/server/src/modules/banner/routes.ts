/**
 * Admin-facing HTTP routes for the banner module.
 *
 * Guarded by `requireAdminOrApiKey`. Structure mirrors mail/shop admin
 * routers — serialize → call service → onError maps ModuleError to JSON.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
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
  ErrorResponseSchema,
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

export const bannerRouter = new OpenAPIHono<HonoEnv>();

bannerRouter.use("*", requireAdminOrApiKey);

bannerRouter.onError((err, c) => {
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
          "application/json": { schema: BannerGroupListResponseSchema },
        },
      },
      ...errorResponses,
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
    return c.json({ items: items.map(serializeGroup) }, 200);
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
        content: { "application/json": { schema: BannerGroupResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await bannerService.createGroup(orgId, input);
    return c.json(serializeGroup(row), 201);
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
        content: { "application/json": { schema: BannerGroupResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await bannerService.getGroup(orgId, id);
    return c.json(serializeGroup(row), 200);
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
        content: { "application/json": { schema: BannerGroupResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.updateGroup(orgId, id, input);
    return c.json(serializeGroup(row), 200);
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
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await bannerService.deleteGroup(orgId, id);
    return c.body(null, 204);
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
        content: { "application/json": { schema: BannerListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const rows = await bannerService.listBanners(orgId, groupId);
    return c.json({ items: rows.map(serializeBanner) }, 200);
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
        content: { "application/json": { schema: BannerResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.createBanner(orgId, groupId, input);
    return c.json(serializeBanner(row), 201);
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
        content: { "application/json": { schema: BannerListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { groupId } = c.req.valid("param");
    const { bannerIds } = c.req.valid("json");
    const rows = await bannerService.reorderBanners(orgId, groupId, bannerIds);
    return c.json({ items: rows.map(serializeBanner) }, 200);
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
        content: { "application/json": { schema: BannerResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await bannerService.getBanner(orgId, id);
    return c.json(serializeBanner(row), 200);
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
        content: { "application/json": { schema: BannerResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await bannerService.updateBanner(orgId, id, input);
    return c.json(serializeBanner(row), 200);
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
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await bannerService.deleteBanner(orgId, id);
    return c.body(null, 204);
  },
);
