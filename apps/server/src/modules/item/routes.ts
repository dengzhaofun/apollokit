/**
 * Admin-facing HTTP routes for the item module.
 *
 * Covers: category CRUD, definition CRUD, grant/deduct, inventory queries.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { ModuleError } from "./errors";
import { itemService } from "./index";
import {
  BalanceResponseSchema,
  CategoryListResponseSchema,
  CreateCategorySchema,
  CreateDefinitionSchema,
  DeductItemsSchema,
  DeductResultSchema,
  DefinitionListResponseSchema,
  EndUserIdParamSchema,
  ErrorResponseSchema,
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

export const itemRouter = new OpenAPIHono<HonoEnv>();

itemRouter.use("*", requireAdminOrApiKey);

itemRouter.onError((err, c) => {
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

// ─── Category routes ──────────────────────────────────────────────

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: ItemCategoryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await itemService.createCategory(orgId, c.req.valid("json"));
    return c.json(serializeCategory(row), 201);
  },
);

itemRouter.openapi(
  createRoute({
    method: "get",
    path: "/categories",
    tags: [TAG_CAT],
    summary: "List item categories",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CategoryListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await itemService.listCategories(orgId);
    return c.json({ items: rows.map(serializeCategory) }, 200);
  },
);

itemRouter.openapi(
  createRoute({
    method: "get",
    path: "/categories/{key}",
    tags: [TAG_CAT],
    summary: "Get a category by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ItemCategoryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await itemService.getCategory(orgId, key);
    return c.json(serializeCategory(row), 200);
  },
);

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: ItemCategoryResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await itemService.updateCategory(orgId, id, c.req.valid("json"));
    return c.json(serializeCategory(row), 200);
  },
);

itemRouter.openapi(
  createRoute({
    method: "delete",
    path: "/categories/{id}",
    tags: [TAG_CAT],
    summary: "Delete an item category",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await itemService.deleteCategory(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Definition routes ────────────────────────────────────────────

itemRouter.openapi(
  createRoute({
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
          "application/json": { schema: ItemDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await itemService.createDefinition(orgId, c.req.valid("json"));
    return c.json(serializeDefinition(row), 201);
  },
);

itemRouter.openapi(
  createRoute({
    method: "get",
    path: "/definitions",
    tags: [TAG_DEF],
    summary: "List item definitions",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DefinitionListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await itemService.listDefinitions(orgId);
    return c.json({ items: rows.map(serializeDefinition) }, 200);
  },
);

itemRouter.openapi(
  createRoute({
    method: "get",
    path: "/definitions/{key}",
    tags: [TAG_DEF],
    summary: "Get a definition by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ItemDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await itemService.getDefinition(orgId, key);
    return c.json(serializeDefinition(row), 200);
  },
);

itemRouter.openapi(
  createRoute({
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
          "application/json": { schema: ItemDefinitionResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await itemService.updateDefinition(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeDefinition(row), 200);
  },
);

itemRouter.openapi(
  createRoute({
    method: "delete",
    path: "/definitions/{id}",
    tags: [TAG_DEF],
    summary: "Delete an item definition (cascades to inventories)",
    request: { params: IdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await itemService.deleteDefinition(orgId, id);
    return c.body(null, 204);
  },
);

// ─── Inventory / Grant / Deduct routes ────────────────────────────

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: GrantResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await itemService.grantItems({
      organizationId: orgId,
      endUserId: body.endUserId,
      grants: body.grants,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(result, 200);
  },
);

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: DeductResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await itemService.deductItems({
      organizationId: orgId,
      endUserId: body.endUserId,
      deductions: body.deductions,
      source: body.source,
      sourceId: body.sourceId,
    });
    return c.json(result, 200);
  },
);

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: InventoryListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const { definitionId } = c.req.valid("query");
    const items = await itemService.getInventory({
      organizationId: orgId,
      endUserId,
      definitionId,
    });
    return c.json({ items }, 200);
  },
);

itemRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: BalanceResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, key } = c.req.valid("param");
    const def = await itemService.getDefinition(orgId, key);
    const balance = await itemService.getBalance({
      organizationId: orgId,
      endUserId,
      definitionId: def.id,
    });
    return c.json({ definitionId: def.id, balance }, 200);
  },
);
