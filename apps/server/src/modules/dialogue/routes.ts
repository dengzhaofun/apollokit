/**
 * Admin-facing HTTP routes for the dialogue module.
 *
 * Guarded by `requireAdminOrApiKey`. Pure CRUD over dialogue_scripts —
 * player progress is managed via the client router, not here.
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { dialogueService } from "./index";
import type { DialogueScript } from "./types";
import {
  CreateDialogueScriptSchema,
  DialogueScriptListResponseSchema,
  DialogueScriptResponseSchema,
  IdParamSchema,
  UpdateDialogueScriptSchema,
} from "./validators";

const TAG = "Dialogue (Admin)";

function serializeScript(row: DialogueScript) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    startNodeId: row.startNodeId,
    nodes: row.nodes,
    triggerCondition: row.triggerCondition,
    repeatable: row.repeatable,
    isActive: row.isActive,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const dialogueRouter = createAdminRouter();

dialogueRouter.use("*", requireAdminOrApiKey);
dialogueRouter.use("*", requirePermissionByMethod("dialogue"));

dialogueRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/scripts",
    tags: [TAG],
    summary: "List dialogue scripts",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DialogueScriptListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const page = await dialogueService.listScripts(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeScript), nextCursor: page.nextCursor }),
      200,
    );
  },
);

dialogueRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/scripts",
    tags: [TAG],
    summary: "Create a new dialogue script",
    request: {
      body: {
        content: { "application/json": { schema: CreateDialogueScriptSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(DialogueScriptResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await dialogueService.createScript(orgId, input);
    return c.json(ok(serializeScript(row)), 201);
  },
);

dialogueRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/scripts/{id}",
    tags: [TAG],
    summary: "Get a dialogue script by id",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DialogueScriptResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await dialogueService.getScript(orgId, id);
    return c.json(ok(serializeScript(row)), 200);
  },
);

dialogueRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/scripts/{id}",
    tags: [TAG],
    summary: "Update a dialogue script",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateDialogueScriptSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DialogueScriptResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await dialogueService.updateScript(orgId, id, input);
    return c.json(ok(serializeScript(row)), 200);
  },
);

dialogueRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/scripts/{id}",
    tags: [TAG],
    summary: "Delete a dialogue script (cascades to progress rows)",
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
    await dialogueService.deleteScript(orgId, id);
    return c.json(ok(null), 200);
  },
);
