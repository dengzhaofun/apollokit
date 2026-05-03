/**
 * Admin-facing HTTP routes for the entity module.
 *
 * Guarded by `requireAdminOrApiKey` — accepts either a Better Auth
 * session cookie or an admin API key (ak_). All handlers resolve the
 * organization from `getOrgId(c)`.
 *
 * Client-facing routes live in `client-routes.ts`.
 */

import { z } from "@hono/zod-openapi";
import { MoveBodySchema } from "../../lib/fractional-order";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
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
    activityId: row.activityId,
    activityNodeId: row.activityNodeId,
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

export const entityRouter = createAdminRouter();

entityRouter.use("*", requireAdminOrApiKey);
entityRouter.use("*", requirePermissionByMethod("entity"));

// ═══════════════════════════════════════════════════════════════
// Schema routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/schemas",
    tags: [TAG_SCHEMA],
    summary: "List all entity schemas",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(SchemaListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await entityService.listSchemas(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeSchema), nextCursor: page.nextCursor }),
      200,
    );
  },
);

entityRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(SchemaResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await entityService.createSchema(orgId, input);
    return c.json(ok(serializeSchema(row)), 201);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/schemas/{key}",
    tags: [TAG_SCHEMA],
    summary: "Get an entity schema by ID or alias",
    request: { params: SchemaKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SchemaResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await entityService.getSchema(orgId, key);
    return c.json(ok(serializeSchema(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(SchemaResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateSchema(orgId, id, input);
    return c.json(ok(serializeSchema(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/schemas/{key}/move",
    tags: [TAG_SCHEMA],
    summary: "Move an entity schema (drag/top/bottom/up/down)",
    request: {
      params: SchemaKeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SchemaResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await entityService.moveSchema(orgId, key, body);
    return c.json(ok(serializeSchema(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/schemas/{id}",
    tags: [TAG_SCHEMA],
    summary: "Delete an entity schema",
    request: { params: SchemaIdParamSchema },
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
    await entityService.deleteSchema(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ═══════════════════════════════════════════════════════════════
// Blueprint routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/blueprints",
    tags: [TAG_BLUEPRINT],
    summary: "List all blueprints (optionally filtered by schemaId)",
    request: {
      query: PaginationQuerySchema.merge(
        z.object({
          schemaId: z.string().uuid().optional().openapi({
            param: { name: "schemaId", in: "query" },
          }),
        }),
      ),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(BlueprintListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await entityService.listBlueprints(orgId, {
      schemaId: q.schemaId,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeBlueprint), nextCursor: page.nextCursor }),
      200,
    );
  },
);

entityRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(BlueprintResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await entityService.createBlueprint(orgId, input);
    return c.json(ok(serializeBlueprint(row)), 201);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/blueprints/{key}",
    tags: [TAG_BLUEPRINT],
    summary: "Get a blueprint by ID or alias",
    request: { params: BlueprintKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(BlueprintResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await entityService.getBlueprint(orgId, key);
    return c.json(ok(serializeBlueprint(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(BlueprintResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateBlueprint(orgId, id, input);
    return c.json(ok(serializeBlueprint(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/blueprints/{key}/move",
    tags: [TAG_BLUEPRINT],
    summary: "Move a blueprint (drag/top/bottom/up/down, scoped per schema)",
    request: {
      params: BlueprintKeyParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(BlueprintResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await entityService.moveBlueprint(orgId, key, body);
    return c.json(ok(serializeBlueprint(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/blueprints/{id}",
    tags: [TAG_BLUEPRINT],
    summary: "Delete a blueprint",
    request: { params: BlueprintIdParamSchema },
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
    await entityService.deleteBlueprint(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ═══════════════════════════════════════════════════════════════
// Skin routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/blueprints/{id}/skins",
    tags: [TAG_SKIN],
    summary: "List skins for a blueprint",
    request: { params: BlueprintIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(SkinListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const rows = await entityService.listSkins(orgId, id);
    return c.json(ok(rows.map(serializeSkin)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(SkinResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.createSkin(orgId, id, input);
    return c.json(ok(serializeSkin(row)), 201);
  },
);

entityRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(SkinResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { skinId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateSkin(orgId, skinId, input);
    return c.json(ok(serializeSkin(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/skins/{skinId}/move",
    tags: [TAG_SKIN],
    summary: "Move a skin (drag/top/bottom/up/down, scoped per blueprint)",
    request: {
      params: SkinIdParamSchema,
      body: { content: { "application/json": { schema: MoveBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SkinResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { skinId } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await entityService.moveSkin(orgId, skinId, body);
    return c.json(ok(serializeSkin(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/skins/{skinId}",
    tags: [TAG_SKIN],
    summary: "Delete a skin",
    request: { params: SkinIdParamSchema },
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
    const { skinId } = c.req.valid("param");
    await entityService.deleteSkin(orgId, skinId);
    return c.json(ok(null), 200);
  },
);

// ═══════════════════════════════════════════════════════════════
// Formation Config routes
// ═══════════════════════════════════════════════════════════════

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/formation-configs",
    tags: [TAG_FORMATION],
    summary: "List all formation configs",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(FormationConfigListResponseSchema,)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await entityService.listFormationConfigs(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeFormationConfig), nextCursor: page.nextCursor }),
      200,
    );
  },
);

entityRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(FormationConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await entityService.createFormationConfig(orgId, input);
    return c.json(ok(serializeFormationConfig(row)), 201);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/formation-configs/{key}",
    tags: [TAG_FORMATION],
    summary: "Get a formation config by ID or alias",
    request: { params: FormationConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(FormationConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await entityService.getFormationConfig(orgId, key);
    return c.json(ok(serializeFormationConfig(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(FormationConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await entityService.updateFormationConfig(orgId, id, input);
    return c.json(ok(serializeFormationConfig(row)), 200);
  },
);

entityRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/formation-configs/{id}",
    tags: [TAG_FORMATION],
    summary: "Delete a formation config",
    request: { params: FormationConfigIdParamSchema },
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
    await entityService.deleteFormationConfig(orgId, id);
    return c.json(ok(null), 200);
  },
);

