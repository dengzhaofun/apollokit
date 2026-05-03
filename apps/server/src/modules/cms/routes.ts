/**
 * Admin-facing HTTP routes for the CMS module.
 *
 * Mounted at `/api/v1/cms`. Auth pattern matches every other admin module:
 * `requireAdminOrApiKey` (Better Auth session OR `ak_` API key) →
 * `requirePermissionByMethod("cms")` (org-scoped role check). Handlers read the active
 * org from the session.
 *
 * `{typeKey}` and `{entryKey}` accept either a UUID or an alias — the
 * service layer's `looksLikeId` discriminator decides which column to
 * match. Unique-by-org-and-alias ensures the alias path is unambiguous.
 */

import { z } from "@hono/zod-openapi";

import { PaginationQuerySchema } from "../../lib/pagination";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { cmsService } from "./index";
import type { CmsEntry, CmsSchemaDef, CmsType } from "./types";
import {
  CmsEntryKeyParamSchema,
  CmsEntryListResponseSchema,
  CmsEntryResponseSchema,
  CmsTypeAliasParamSchema,
  CmsTypeKeyParamSchema,
  CmsTypeListResponseSchema,
  CmsTypeResponseSchema,
  CmsTypeStatusSchema,
  CreateCmsEntrySchema,
  CreateCmsTypeSchema,
  ListCmsTypesQuerySchema,
  ListEntriesQuerySchema,
  UpdateCmsEntrySchema,
  UpdateCmsTypeSchema,
} from "./validators";

const TAG = "CMS";

function serializeType(row: CmsType) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    schema: row.schema as CmsSchemaDef,
    schemaVersion: row.schemaVersion,
    groupOptions: row.groupOptions,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEntry(row: CmsEntry) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    typeId: row.typeId,
    typeAlias: row.typeAlias,
    alias: row.alias,
    groupKey: row.groupKey,
    tags: row.tags,
    data: row.data,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    schemaVersion: row.schemaVersion,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const cmsRouter = createAdminRouter();

cmsRouter.use("*", requireAdminOrApiKey);
cmsRouter.use("*", requirePermissionByMethod("cms"));

// ─── Type routes ─────────────────────────────────────────────────

cmsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/types",
    tags: [TAG],
    summary: "List CMS types in the current project",
    request: { query: ListCmsTypesQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsTypeListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await cmsService.listTypes(orgId, q);
    return c.json(
      ok({ items: page.items.map(serializeType), nextCursor: page.nextCursor }),
      200,
    );
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/types",
    tags: [TAG],
    summary: "Create a CMS type",
    request: {
      body: { content: { "application/json": { schema: CreateCmsTypeSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CmsTypeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const row = await cmsService.createType(orgId, c.req.valid("json"), {
      userId,
    });
    return c.json(ok(serializeType(row)), 201);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/types/{typeKey}",
    tags: [TAG],
    summary: "Get a CMS type by id or alias",
    request: { params: CmsTypeKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsTypeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { typeKey } = c.req.valid("param");
    const row = await cmsService.getType(orgId, typeKey);
    return c.json(ok(serializeType(row)), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/types/{typeKey}",
    tags: [TAG],
    summary: "Update a CMS type",
    request: {
      params: CmsTypeKeyParamSchema,
      body: { content: { "application/json": { schema: UpdateCmsTypeSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsTypeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const { typeKey } = c.req.valid("param");
    const row = await cmsService.updateType(
      orgId,
      typeKey,
      c.req.valid("json"),
      { userId },
    );
    return c.json(ok(serializeType(row)), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/types/{typeKey}",
    tags: [TAG],
    summary: "Delete a CMS type (cascades to its entries)",
    request: { params: CmsTypeKeyParamSchema },
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
    const { typeKey } = c.req.valid("param");
    await cmsService.deleteType(orgId, typeKey);
    return c.json(ok(null), 200);
  },
);

// ─── Entry routes ────────────────────────────────────────────────

cmsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/types/{typeAlias}/entries",
    tags: [TAG],
    summary: "List entries for a CMS type",
    request: {
      params: CmsTypeAliasParamSchema,
      query: ListEntriesQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { typeAlias } = c.req.valid("param");
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await cmsService.listEntries(orgId, typeAlias, q);
    return c.json(
      ok({
        items: page.items.map(serializeEntry),
        nextCursor: page.nextCursor,
      }),
      200,
    );
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/types/{typeAlias}/entries",
    tags: [TAG],
    summary: "Create an entry of a CMS type",
    request: {
      params: CmsTypeAliasParamSchema,
      body: { content: { "application/json": { schema: CreateCmsEntrySchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const { typeAlias } = c.req.valid("param");
    const row = await cmsService.createEntry(
      orgId,
      typeAlias,
      c.req.valid("json"),
      { userId },
    );
    return c.json(ok(serializeEntry(row)), 201);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/types/{typeAlias}/entries/{entryKey}",
    tags: [TAG],
    summary: "Get an entry by id or alias",
    request: { params: CmsEntryKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { typeAlias, entryKey } = c.req.valid("param");
    const row = await cmsService.getEntry(orgId, typeAlias, entryKey);
    return c.json(ok(serializeEntry(row)), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/types/{typeAlias}/entries/{entryKey}",
    tags: [TAG],
    summary: "Update an entry (optimistic concurrency via version)",
    request: {
      params: CmsEntryKeyParamSchema,
      body: { content: { "application/json": { schema: UpdateCmsEntrySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const { typeAlias, entryKey } = c.req.valid("param");
    const row = await cmsService.updateEntry(
      orgId,
      typeAlias,
      entryKey,
      c.req.valid("json"),
      { userId },
    );
    return c.json(ok(serializeEntry(row)), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/types/{typeAlias}/entries/{entryKey}",
    tags: [TAG],
    summary: "Delete an entry",
    request: { params: CmsEntryKeyParamSchema },
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
    const { typeAlias, entryKey } = c.req.valid("param");
    await cmsService.deleteEntry(orgId, typeAlias, entryKey);
    return c.json(ok(null), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/types/{typeAlias}/entries/{entryKey}/publish",
    tags: [TAG],
    summary: "Publish an entry",
    request: { params: CmsEntryKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const { typeAlias, entryKey } = c.req.valid("param");
    const row = await cmsService.publishEntry(orgId, typeAlias, entryKey, {
      userId,
    });
    return c.json(ok(serializeEntry(row)), 200);
  },
);

cmsRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/types/{typeAlias}/entries/{entryKey}/unpublish",
    tags: [TAG],
    summary: "Unpublish an entry",
    request: { params: CmsEntryKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CmsEntryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const userId = c.var.user?.id;
    const { typeAlias, entryKey } = c.req.valid("param");
    const row = await cmsService.unpublishEntry(orgId, typeAlias, entryKey, {
      userId,
    });
    return c.json(ok(serializeEntry(row)), 200);
  },
);
