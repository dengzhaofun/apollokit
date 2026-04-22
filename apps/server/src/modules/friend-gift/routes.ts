/**
 * Admin-facing HTTP routes for the friend gift module.
 *
 * Every route is guarded by `requireAdminOrApiKey`. Downstream handlers
 * read `c.var.session!.activeOrganizationId!` uniformly.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { FriendGiftSettingsNotFound, ModuleError } from "./errors";
import { friendGiftService } from "./index";
import {
  CreatePackageSchema,
  GiftSendListResponseSchema,
  GiftSendResponseSchema,
  PackageIdParamSchema,
  PackageListResponseSchema,
  PackageResponseSchema,
  PaginationQuerySchema,
  SendIdParamSchema,
  SettingsResponseSchema,
  UpdatePackageSchema,
  UpsertSettingsSchema,
} from "./validators";

const TAG = "Friend Gift";

function serializeSettings(row: {
  id: string;
  organizationId: string;
  dailySendLimit: number;
  dailyReceiveLimit: number;
  timezone: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dailySendLimit: row.dailySendLimit,
    dailyReceiveLimit: row.dailyReceiveLimit,
    timezone: row.timezone,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePackage(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  giftItems: { definitionId: string; quantity: number }[];
  isActive: boolean;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    giftItems: row.giftItems,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSend(row: {
  id: string;
  organizationId: string;
  packageId: string | null;
  senderUserId: string;
  receiverUserId: string;
  giftItems: { definitionId: string; quantity: number }[];
  status: string;
  claimedAt: Date | null;
  expiresAt: Date | null;
  message: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    packageId: row.packageId,
    senderUserId: row.senderUserId,
    receiverUserId: row.receiverUserId,
    giftItems: row.giftItems,
    status: row.status,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    message: row.message,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const friendGiftRouter = createAdminRouter();

friendGiftRouter.use("*", requireAdminOrApiKey);

// ─── Settings ────────────────────────────────────────────────────

// GET /friend-gift/settings
friendGiftRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    summary: "Get friend gift settings for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SettingsResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendGiftService.getSettings(orgId);
    if (!row) {
      throw new FriendGiftSettingsNotFound();
    }
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// PUT /friend-gift/settings
friendGiftRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    summary: "Create or update friend gift settings",
    request: {
      body: {
        content: { "application/json": { schema: UpsertSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SettingsResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendGiftService.upsertSettings(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// ─── Packages ────────────────────────────────────────────────────

// POST /friend-gift/packages
friendGiftRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/packages",
    tags: [TAG],
    summary: "Create a gift package",
    request: {
      body: {
        content: { "application/json": { schema: CreatePackageSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(PackageResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await friendGiftService.createPackage(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok(serializePackage(row)), 201);
  },
);

// GET /friend-gift/packages
friendGiftRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/packages",
    tags: [TAG],
    summary: "List gift packages for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PackageListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendGiftService.listPackages(orgId);
    return c.json(ok({ items: rows.map(serializePackage) }), 200);
  },
);

// GET /friend-gift/packages/:id
friendGiftRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/packages/{id}",
    tags: [TAG],
    summary: "Get a gift package by id",
    request: { params: PackageIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PackageResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await friendGiftService.getPackage(orgId, id);
    return c.json(ok(serializePackage(row)), 200);
  },
);

// PUT /friend-gift/packages/:id
friendGiftRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/packages/{id}",
    tags: [TAG],
    summary: "Update a gift package",
    request: {
      params: PackageIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdatePackageSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PackageResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await friendGiftService.updatePackage(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializePackage(row)), 200);
  },
);

// DELETE /friend-gift/packages/:id
friendGiftRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/packages/{id}",
    tags: [TAG],
    summary: "Delete a gift package",
    request: { params: PackageIdParamSchema },
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
    await friendGiftService.deletePackage(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Sends (admin browse) ────────────────────────────────────────

// GET /friend-gift/sends
friendGiftRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/sends",
    tags: [TAG],
    summary: "List all gift sends for the current organization",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GiftSendListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { limit, offset } = c.req.valid("query");
    const rows = await friendGiftService.listSends(orgId, { limit, offset });
    return c.json(ok({ items: rows.map(serializeSend) }), 200);
  },
);

// GET /friend-gift/sends/:id
friendGiftRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/sends/{id}",
    tags: [TAG],
    summary: "Get a gift send record by id",
    request: { params: SendIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GiftSendResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await friendGiftService.getSend(orgId, id);
    return c.json(ok(serializeSend(row)), 200);
  },
);
