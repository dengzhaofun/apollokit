/**
 * Admin-facing HTTP routes for the character module.
 *
 * Guarded by `requireAdminOrApiKey` + `requirePermissionByMethod("character")`. No client
 * routes — end users never list or fetch characters directly; they
 * receive flattened speaker payloads through the dialogue client API.
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { characterService } from "./index";
import type { CharacterDefinition, CharacterSide } from "./types";
import {
  CharacterListResponseSchema,
  CharacterResponseSchema,
  CreateCharacterSchema,
  IdParamSchema,
  UpdateCharacterSchema,
} from "./validators";

const TAG = "Character";

function serializeCharacter(row: CharacterDefinition) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatarUrl,
    portraitUrl: row.portraitUrl,
    defaultSide: row.defaultSide as CharacterSide | null,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const characterRouter = createAdminRouter();

characterRouter.use("*", requireAdminOrApiKey);
characterRouter.use("*", requirePermissionByMethod("character"));

characterRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/characters",
    tags: [TAG],
    summary: "List characters",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CharacterListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await characterService.listCharacters(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeCharacter), nextCursor: page.nextCursor }),
      200,
    );
  },
);

characterRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/characters",
    tags: [TAG],
    summary: "Create a character",
    request: {
      body: {
        content: { "application/json": { schema: CreateCharacterSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CharacterResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await characterService.createCharacter(orgId, input);
    return c.json(ok(serializeCharacter(row)), 201);
  },
);

characterRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/characters/{id}",
    tags: [TAG],
    summary: "Get a character by id",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CharacterResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await characterService.getCharacter(orgId, id);
    return c.json(ok(serializeCharacter(row)), 200);
  },
);

characterRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/characters/{id}",
    tags: [TAG],
    summary: "Update a character",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateCharacterSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CharacterResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await characterService.updateCharacter(orgId, id, input);
    return c.json(ok(serializeCharacter(row)), 200);
  },
);

characterRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/characters/{id}",
    tags: [TAG],
    summary: "Delete a character",
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
    await characterService.deleteCharacter(orgId, id);
    return c.json(ok(null), 200);
  },
);
