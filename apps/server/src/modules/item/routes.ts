/**
 * Admin-facing HTTP routes for the item module.
 *
 * Covers: category CRUD, definition CRUD, grant/deduct, inventory queries.
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
import { itemService } from "./index";
import {
  BalanceResponseSchema,
  CategoryListResponseSchema,
  CreateCategorySchema,
  CreateDefinitionSchema,
  DeductItemsSchema,
  DeductResultSchema,
  DefinitionListQuerySchema,
  DefinitionListResponseSchema,
  EndUserIdParamSchema,
  GrantItemsSchema,
  GrantResultSchema,
  IdParamSchema,
  InventoryListResponseSchema,
  InventoryQuerySchema,
  ItemCategoryResponseSchema,
  ItemDefinitionResponseSchema,
  KeyParamSchema,
  UpdateCategorySchema,
  UpdateDefinitionSchema,
} from "./validators";

const TAG_CAT = "Item Categories";
const TAG_DEF = "Item Definitions";
const TAG_INV = "Item Inventory";

function serializeCategory(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDefinition(row: {
  id: string;
  organizationId: string;
  categoryId: string | null;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  stackable: boolean;
  stackLimit: number | null;
  holdLimit: number | null;
  isActive: boolean;
  activityId: string | null;
  activityNodeId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    stackable: row.stackable,
    stackLimit: row.stackLimit,
    holdLimit: row.holdLimit,
    isActive: row.isActive,
    activityId: row.activityId,
    activityNodeId: row.activityNodeId,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const itemRouter = createAdminRouter();

itemRouter.use("*", requireAdminOrApiKey);
itemRouter.use("*", requireOrgManage);

// ─── Category routes ──────────────────────────────────────────────

itemRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "Create an item category",
    request: {
      body: { content: { "application/json": { schema: CreateCategorySchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(ItemCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await itemService.createCategory(orgId, c.req.valid("json"));
    return c.json(ok(serializeCategory(row)), 201);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "List item categories",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CategoryListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await itemService.listCategories(orgId, q);
    return c.json(
      ok({ items: page.items.map(serializeCategory), nextCursor: page.nextCursor }),
      200,
    );
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/categories/{key}",
    tags: [TAG_CAT],
    summary: "Get a category by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ItemCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await itemService.getCategory(orgId, key);
    return c.json(ok(serializeCategory(row)), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Update an item category",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: UpdateCategorySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ItemCategoryResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await itemService.updateCategory(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeCategory(row)), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Delete an item category",
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
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await itemService.deleteCategory(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Definition routes ────────────────────────────────────────────

itemRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "Create an item definition",
    request: {
      body: {
        content: { "application/json": { schema: CreateDefinitionSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(ItemDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await itemService.createDefinition(orgId, c.req.valid("json"));
    return c.json(ok(serializeDefinition(row)), 201);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "List item definitions",
    request: { query: PaginationQuerySchema.merge(DefinitionListQuerySchema) },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DefinitionListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query") as Record<string, unknown>;
    const page = await itemService.listDefinitions(orgId, q);
    return c.json(
      ok({ items: page.items.map(serializeDefinition), nextCursor: page.nextCursor }),
      200,
    );
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Get a definition by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ItemDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await itemService.getDefinition(orgId, key);
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/definitions/{id}",
    tags: [TAG_DEF],
    summary: "Update an item definition",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateDefinitionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ItemDefinitionResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await itemService.updateDefinition(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeDefinition(row)), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/definitions/{id}",
    tags: [TAG_DEF],
    summary: "Delete an item definition (cascades to inventories)",
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
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await itemService.deleteDefinition(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Inventory / Grant / Deduct routes ────────────────────────────

itemRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/grant",
    tags: [TAG_INV],
    summary: "Grant items/currencies to a user (reward center)",
    request: {
      body: { content: { "application/json": { schema: GrantItemsSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GrantResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const result = await itemService.grantItems({
      organizationId: orgId,
      endUserId: body.endUserId,
      grants: body.grants,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(ok(result), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/deduct",
    tags: [TAG_INV],
    summary: "Deduct items/currencies from a user",
    request: {
      body: { content: { "application/json": { schema: DeductItemsSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(DeductResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const body = c.req.valid("json");
    const result = await itemService.deductItems({
      organizationId: orgId,
      endUserId: body.endUserId,
      deductions: body.deductions,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(ok(result), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/users/{endUserId}/inventory",
    tags: [TAG_INV],
    summary: "Get a user's full inventory",
    request: {
      params: EndUserIdParamSchema,
      query: InventoryQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(InventoryListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId } = c.req.valid("param");
    const { definitionId } = c.req.valid("query");
    const items = await itemService.getInventory({
      organizationId: orgId,
      endUserId,
      definitionId,
    });
    return c.json(ok({ items }), 200);
  },
);

itemRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/users/{endUserId}/balance/{key}",
    tags: [TAG_INV],
    summary: "Get a user's balance for a specific item",
    request: {
      params: EndUserIdParamSchema.merge(KeyParamSchema),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BalanceResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { endUserId, key } = c.req.valid("param");
    const def = await itemService.getDefinition(orgId, key);
    const balance = await itemService.getBalance({
      organizationId: orgId,
      endUserId,
      definitionId: def.id,
    });
    return c.json(ok({ definitionId: def.id, balance }), 200);
  },
);
