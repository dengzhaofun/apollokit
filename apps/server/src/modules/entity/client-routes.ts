/**
 * C-end client routes for the entity module.
 *
 * Mounted at /api/client/entity. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no endUserId path segment for the caller.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { entityService } from "./index";
import { ErrorResponseSchema } from "./validators";

const TAG = "Entity (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

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

const InstanceIdParam = z.object({
  instanceId: z.string().uuid().openapi({
    param: { name: "instanceId", in: "path" },
  }),
});

export const entityClientRouter = new OpenAPIHono<HonoEnv>();

entityClientRouter.use("*", requireClientCredential);
entityClientRouter.use("*", requireClientUser);

entityClientRouter.onError((err, c) => {
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

// ─── Read ─────────────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances",
    tags: [TAG],
    summary: "List entity instances for the end user",
    request: {
      headers: authHeaders,
      query: z.object({
        schemaId: z.string().uuid().optional(),
        blueprintId: z.string().uuid().optional(),
      }),
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.array(z.any()) } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { schemaId, blueprintId } = c.req.valid("query");
    const rows = await entityService.listInstances(orgId, endUserId, {
      schemaId,
      blueprintId,
    });
    return c.json(rows, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances/{instanceId}",
    tags: [TAG],
    summary: "Get entity instance detail with slots",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const result = await entityService.getInstance(orgId, endUserId, instanceId);
    return c.json(result, 200);
  },
);

// ─── Acquire / Discard ────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/acquire",
    tags: [TAG],
    summary: "Acquire a new entity instance",
    request: {
      headers: authHeaders,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              blueprintId: z.string().uuid(),
              source: z.string().min(1),
              sourceId: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Created", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { blueprintId, source, sourceId } = c.req.valid("json");
    const inst = await entityService.acquireEntity(
      orgId,
      endUserId,
      blueprintId,
      source,
      sourceId,
    );
    return c.json(inst, 201);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/discard",
    tags: [TAG],
    summary: "Discard (delete) an entity instance",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    await entityService.discardEntity(orgId, endUserId, instanceId);
    return c.body(null, 204);
  },
);

// ─── Lock ─────────────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/lock",
    tags: [TAG],
    summary: "Toggle entity lock",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({ locked: z.boolean() }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { locked } = c.req.valid("json");
    const inst = await entityService.toggleLock(
      orgId,
      endUserId,
      instanceId,
      locked,
    );
    return c.json(inst, 200);
  },
);

// ─── Progression ──────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/add-exp",
    tags: [TAG],
    summary: "Add experience points",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({ amount: z.number().int().positive() }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { amount } = c.req.valid("json");
    const inst = await entityService.addExp(orgId, endUserId, instanceId, amount);
    return c.json(inst, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/level-up",
    tags: [TAG],
    summary: "Level up (consumes materials)",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              targetLevel: z.number().int().min(2).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { targetLevel } = c.req.valid("json");
    const inst = await entityService.levelUp(
      orgId,
      endUserId,
      instanceId,
      targetLevel,
    );
    return c.json(inst, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/rank-up",
    tags: [TAG],
    summary: "Rank up (consumes materials)",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const inst = await entityService.rankUp(orgId, endUserId, instanceId);
    return c.json(inst, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/synthesize",
    tags: [TAG],
    summary: "Synthesize (merge) entities",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              feedInstanceIds: z.array(z.string().uuid()).min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { feedInstanceIds } = c.req.valid("json");
    const inst = await entityService.synthesize(
      orgId,
      endUserId,
      instanceId,
      feedInstanceIds,
    );
    return c.json(inst, 200);
  },
);

// ─── Slot System ──────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/equip",
    tags: [TAG],
    summary: "Equip an entity into a slot",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              slotKey: z.string().min(1),
              slotIndex: z.number().int().min(0),
              equippedInstanceId: z.string().uuid(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: "Equipped", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { slotKey, slotIndex, equippedInstanceId } = c.req.valid("json");
    const slot = await entityService.equip(
      orgId,
      endUserId,
      instanceId,
      slotKey,
      slotIndex,
      equippedInstanceId,
    );
    return c.json(slot, 201);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/unequip",
    tags: [TAG],
    summary: "Unequip an entity from a slot",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              slotKey: z.string().min(1),
              slotIndex: z.number().int().min(0),
            }),
          },
        },
      },
    },
    responses: {
      204: { description: "Unequipped" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { slotKey, slotIndex } = c.req.valid("json");
    await entityService.unequip(orgId, endUserId, instanceId, slotKey, slotIndex);
    return c.body(null, 204);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/change-skin",
    tags: [TAG],
    summary: "Change entity skin",
    request: {
      headers: authHeaders,
      params: InstanceIdParam,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              skinId: z.string().uuid().nullable(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { instanceId } = c.req.valid("param");
    const { skinId } = c.req.valid("json");
    const inst = await entityService.changeSkin(
      orgId,
      endUserId,
      instanceId,
      skinId,
    );
    return c.json(inst, 200);
  },
);

// ─── Formations ───────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/formations/{configId}",
    tags: [TAG],
    summary: "List formations for a config",
    request: {
      headers: authHeaders,
      params: z.object({
        configId: z.string().uuid().openapi({
          param: { name: "configId", in: "path" },
        }),
      }),
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.array(z.any()) } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configId } = c.req.valid("param");
    const rows = await entityService.listFormations(orgId, endUserId, configId);
    return c.json(rows, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "put",
    path: "/formations/{configId}/{formationIndex}",
    tags: [TAG],
    summary: "Update a formation",
    request: {
      headers: authHeaders,
      params: z.object({
        configId: z.string().uuid().openapi({
          param: { name: "configId", in: "path" },
        }),
        formationIndex: z.coerce.number().int().min(0).openapi({
          param: { name: "formationIndex", in: "path" },
        }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().max(200).nullable().optional(),
              slots: z.array(
                z.object({
                  slotIndex: z.number().int().min(0),
                  instanceId: z.string().uuid().nullable(),
                }),
              ),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configId, formationIndex } = c.req.valid("param");
    const { name, slots } = c.req.valid("json");
    const formation = await entityService.updateFormation(
      orgId,
      endUserId,
      configId,
      formationIndex,
      name ?? null,
      slots,
    );
    return c.json(formation, 200);
  },
);
