/**
 * Admin-facing HTTP routes for the dialogue module.
 *
 * Guarded by `requireAdminOrApiKey`. Pure CRUD over dialogue_scripts —
 * player progress is managed via the client router, not here.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { dialogueService } from "./index";
import type { DialogueScript } from "./types";
import {
  CreateDialogueScriptSchema,
  DialogueScriptListResponseSchema,
  DialogueScriptResponseSchema,
  ErrorResponseSchema,
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

export const dialogueRouter = createAdminRouter();

dialogueRouter.use("*", requireAdminOrApiKey);

dialogueRouter.onError((err, c) => {
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

dialogueRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/scripts",
    tags: [TAG],
    summary: "List dialogue scripts",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DialogueScriptListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const items = await dialogueService.listScripts(orgId);
    return c.json({ items: items.map(serializeScript) }, 200);
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
          "application/json": { schema: DialogueScriptResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await dialogueService.createScript(orgId, input);
    return c.json(serializeScript(row), 201);
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
          "application/json": { schema: DialogueScriptResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await dialogueService.getScript(orgId, id);
    return c.json(serializeScript(row), 200);
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
          "application/json": { schema: DialogueScriptResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await dialogueService.updateScript(orgId, id, input);
    return c.json(serializeScript(row), 200);
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
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await dialogueService.deleteScript(orgId, id);
    return c.body(null, 204);
  },
);
