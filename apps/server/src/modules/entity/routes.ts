/**
 * Admin-facing HTTP routes for the entity module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_). All handlers resolve the
 * organization from `c.var.session!.activeOrganizationId!`.
 *
 * Client-facing routes live in `client-routes.ts`.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { entityService } from "./index";
import type {
  EntityBlueprint,
  EntityBlueprintSkin,
  EntityFormationConfig,
  EntitySchema,
} from "./types";
import {
  BlueprintIdParamSchema,
  BlueprintKeyParamSchema,
  BlueprintListResponseSchema,
  BlueprintResponseSchema,
  CreateBlueprintInput,
  CreateFormationConfigInput,
  CreateSchemaInput,
  CreateSkinInput,
  ErrorResponseSchema,
  FormationConfigIdParamSchema,
  FormationConfigKeyParamSchema,
  FormationConfigListResponseSchema,
  FormationConfigResponseSchema,
  SchemaIdParamSchema,
  SchemaKeyParamSchema,
  SchemaListResponseSchema,
  SchemaResponseSchema,
  SkinIdParamSchema,
  SkinListResponseSchema,
  SkinResponseSchema,
  UpdateBlueprintInput,
  UpdateFormationConfigInput,
  UpdateSchemaInput,
  UpdateSkinInput,
} from "./validators";

const TAG_SCHEMA = "Entity Schemas (Admin)";
const TAG_BLUEPRINT = "Entity Blueprints (Admin)";
const TAG_SKIN = "Entity Skins (Admin)";
const TAG_FORMATION = "Entity Formations (Admin)";

// ─── Serializers ────────────────────────────────────────────────

function serializeSchema(row: EntitySchema) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    statDefinitions: row.statDefinitions,
    tagDefinitions: row.tagDefinitions,
    slotDefinitions: row.slotDefinitions,
    levelConfig: row.levelConfig,
    rankConfig: row.rankConfig,
    synthesisConfig: row.synthesisConfig,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeBlueprint(row: EntityBlueprint) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    schemaId: row.schemaId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    rarity: row.rarity,
    tags: row.tags,
    assets: row.assets,
    baseStats: row.baseStats,
    statGrowth: row.statGrowth,
    levelUpCosts: row.levelUpCosts,
    rankUpCosts: row.rankUpCosts,
    synthesisCost: row.synthesisCost,
    maxLevel: row.maxLevel,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSkin(row: EntityBlueprintSkin) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    blueprintId: row.blueprintId,
    alias: row.alias,
    name: row.name,
    rarity: row.rarity,
    assets: row.assets,
    statBonuses: row.statBonuses,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeFormationConfig(row: EntityFormationConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    maxFormations: row.maxFormations,
    maxSlots: row.maxSlots,
    acceptsSchemaIds: row.acceptsSchemaIds,
    allowDuplicateBlueprints: row.allowDuplicateBlueprints,
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

export const entityRouter = new OpenAPIHono<HonoEnv>();

entityRouter.use("*", requireAdminOrApiKey);

entityRouter.onError((err, c) => {
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

// ═══════════════════════════════════════════════════════════════
// Schema routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/schemas",
    tags: [TAG_SCHEMA],
    summary: "List all entity schemas",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: SchemaListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await entityService.listSchemas(orgId);
    return c.json(rows.map(serializeSchema), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "post",
    path: "/schemas",
    tags: [TAG_SCHEMA],
    summary: "Create an entity schema",
    request: {
      body: {
        content: { "application/json": { schema: CreateSchemaInput } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: SchemaResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await entityService.createSchema(orgId, input);
    return c.json(serializeSchema(row), 201);
  },
);

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/schemas/{key}",
    tags: [TAG_SCHEMA],
    summary: "Get an entity schema by ID or alias",
    request: { params: SchemaKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: SchemaResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await entityService.getSchema(orgId, key);
    return c.json(serializeSchema(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "patch",
    path: "/schemas/{id}",
    tags: [TAG_SCHEMA],
    summary: "Update an entity schema",
    request: {
      params: SchemaIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateSchemaInput } },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: SchemaResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateSchema(orgId, id, input);
    return c.json(serializeSchema(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "delete",
    path: "/schemas/{id}",
    tags: [TAG_SCHEMA],
    summary: "Delete an entity schema",
    request: { params: SchemaIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await entityService.deleteSchema(orgId, id);
    return c.body(null, 204);
  },
);

// ═══════════════════════════════════════════════════════════════
// Blueprint routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/blueprints",
    tags: [TAG_BLUEPRINT],
    summary: "List all blueprints (optionally filtered by schemaId)",
    request: {
      query: z.object({
        schemaId: z.string().uuid().optional(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: BlueprintListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { schemaId } = c.req.valid("query");
    const rows = await entityService.listBlueprints(orgId, { schemaId });
    return c.json(rows.map(serializeBlueprint), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "post",
    path: "/blueprints",
    tags: [TAG_BLUEPRINT],
    summary: "Create a blueprint",
    request: {
      body: {
        content: { "application/json": { schema: CreateBlueprintInput } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: BlueprintResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await entityService.createBlueprint(orgId, input);
    return c.json(serializeBlueprint(row), 201);
  },
);

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/blueprints/{key}",
    tags: [TAG_BLUEPRINT],
    summary: "Get a blueprint by ID or alias",
    request: { params: BlueprintKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: BlueprintResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await entityService.getBlueprint(orgId, key);
    return c.json(serializeBlueprint(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "patch",
    path: "/blueprints/{id}",
    tags: [TAG_BLUEPRINT],
    summary: "Update a blueprint",
    request: {
      params: BlueprintIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateBlueprintInput } },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: {
          "application/json": { schema: BlueprintResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateBlueprint(orgId, id, input);
    return c.json(serializeBlueprint(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "delete",
    path: "/blueprints/{id}",
    tags: [TAG_BLUEPRINT],
    summary: "Delete a blueprint",
    request: { params: BlueprintIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await entityService.deleteBlueprint(orgId, id);
    return c.body(null, 204);
  },
);

// ═══════════════════════════════════════════════════════════════
// Skin routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/blueprints/{id}/skins",
    tags: [TAG_SKIN],
    summary: "List skins for a blueprint",
    request: { params: BlueprintIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: SkinListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const rows = await entityService.listSkins(orgId, id);
    return c.json(rows.map(serializeSkin), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "post",
    path: "/blueprints/{id}/skins",
    tags: [TAG_SKIN],
    summary: "Create a skin for a blueprint",
    request: {
      params: BlueprintIdParamSchema,
      body: {
        content: { "application/json": { schema: CreateSkinInput } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: SkinResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.createSkin(orgId, id, input);
    return c.json(serializeSkin(row), 201);
  },
);

entityRouter.openapi(
  createRoute({
    method: "patch",
    path: "/skins/{skinId}",
    tags: [TAG_SKIN],
    summary: "Update a skin",
    request: {
      params: SkinIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateSkinInput } },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: SkinResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { skinId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateSkin(orgId, skinId, input);
    return c.json(serializeSkin(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "delete",
    path: "/skins/{skinId}",
    tags: [TAG_SKIN],
    summary: "Delete a skin",
    request: { params: SkinIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { skinId } = c.req.valid("param");
    await entityService.deleteSkin(orgId, skinId);
    return c.body(null, 204);
  },
);

// ═══════════════════════════════════════════════════════════════
// Formation Config routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/formation-configs",
    tags: [TAG_FORMATION],
    summary: "List all formation configs",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: FormationConfigListResponseSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await entityService.listFormationConfigs(orgId);
    return c.json(rows.map(serializeFormationConfig), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "post",
    path: "/formation-configs",
    tags: [TAG_FORMATION],
    summary: "Create a formation config",
    request: {
      body: {
        content: {
          "application/json": { schema: CreateFormationConfigInput },
        },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: FormationConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await entityService.createFormationConfig(orgId, input);
    return c.json(serializeFormationConfig(row), 201);
  },
);

entityRouter.openapi(
  createRoute({
    method: "get",
    path: "/formation-configs/{key}",
    tags: [TAG_FORMATION],
    summary: "Get a formation config by ID or alias",
    request: { params: FormationConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: FormationConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await entityService.getFormationConfig(orgId, key);
    return c.json(serializeFormationConfig(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "patch",
    path: "/formation-configs/{id}",
    tags: [TAG_FORMATION],
    summary: "Update a formation config",
    request: {
      params: FormationConfigIdParamSchema,
      body: {
        content: {
          "application/json": { schema: UpdateFormationConfigInput },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: {
          "application/json": { schema: FormationConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateFormationConfig(orgId, id, input);
    return c.json(serializeFormationConfig(row), 200);
  },
);

entityRouter.openapi(
  createRoute({
    method: "delete",
    path: "/formation-configs/{id}",
    tags: [TAG_FORMATION],
    summary: "Delete a formation config",
    request: { params: FormationConfigIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await entityService.deleteFormationConfig(orgId, id);
    return c.body(null, 204);
  },
);

