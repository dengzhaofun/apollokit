/**
 * C-end client routes for the entity module.
 *
 * Mounted at /api/client/entity. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no endUserId path segment for the caller.
 */

import { z } from "@hono/zod-openapi";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { entityService } from "./index";
import { } from "./validators";

const TAG = "Entity (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

const InstanceIdParam = z.object({
  instanceId: z.string().uuid().openapi({
    param: { name: "instanceId", in: "path" },
  }),
});

export const entityClientRouter = createClientRouter();

entityClientRouter.use("*", requireClientCredential);
entityClientRouter.use("*", requireClientUser);

// ─── Read ─────────────────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.array(z.any())) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { schemaId, blueprintId } = c.req.valid("query");
    const rows = await entityService.listInstances(orgId, endUserId, {
      schemaId,
      blueprintId,
    });
    return c.json(ok(rows), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/instances/{instanceId}",
    tags: [TAG],
    summary: "Get entity instance detail with slots",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const result = await entityService.getInstance(orgId, endUserId, instanceId);
    return c.json(ok(result), 200);
  },
);

// ─── Acquire / Discard ────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      201: { description: "Created", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { blueprintId, source, sourceId } = c.req.valid("json");
    const inst = await entityService.acquireEntity(
      orgId,
      endUserId,
      blueprintId,
      source,
      sourceId,
    );
    return c.json(ok(inst), 201);
  },
);

entityClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/instances/{instanceId}/discard",
    tags: [TAG],
    summary: "Discard (delete) an entity instance",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    await entityService.discardEntity(orgId, endUserId, instanceId);
    return c.json(ok(null), 200);
  },
);

// ─── Lock ─────────────────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { locked } = c.req.valid("json");
    const inst = await entityService.toggleLock(
      orgId,
      endUserId,
      instanceId,
      locked,
    );
    return c.json(ok(inst), 200);
  },
);

// ─── Progression ──────────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { amount } = c.req.valid("json");
    const inst = await entityService.addExp(orgId, endUserId, instanceId, amount);
    return c.json(ok(inst), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { targetLevel } = c.req.valid("json");
    const inst = await entityService.levelUp(
      orgId,
      endUserId,
      instanceId,
      targetLevel,
    );
    return c.json(ok(inst), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/instances/{instanceId}/rank-up",
    tags: [TAG],
    summary: "Rank up (consumes materials)",
    request: { headers: authHeaders, params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const inst = await entityService.rankUp(orgId, endUserId, instanceId);
    return c.json(ok(inst), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { feedInstanceIds } = c.req.valid("json");
    const inst = await entityService.synthesize(
      orgId,
      endUserId,
      instanceId,
      feedInstanceIds,
    );
    return c.json(ok(inst), 200);
  },
);

// ─── Slot System ──────────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      201: { description: "Equipped", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
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
    return c.json(ok(slot), 201);
  },
);

entityClientRouter.openapi(
  createClientRoute({
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
      200: {
        description: "Unequipped",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { slotKey, slotIndex } = c.req.valid("json");
    await entityService.unequip(orgId, endUserId, instanceId, slotKey, slotIndex);
    return c.json(ok(null), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { instanceId } = c.req.valid("param");
    const { skinId } = c.req.valid("json");
    const inst = await entityService.changeSkin(
      orgId,
      endUserId,
      instanceId,
      skinId,
    );
    return c.json(ok(inst), 200);
  },
);

// ─── Formations ───────────────────────────────────────────────

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.array(z.any())) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { configId } = c.req.valid("param");
    const rows = await entityService.listFormations(orgId, endUserId, configId);
    return c.json(ok(rows), 200);
  },
);

entityClientRouter.openapi(
  createClientRoute({
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
      200: { description: "OK", content: { "application/json": { schema: envelopeOf(z.any()) } } },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
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
    return c.json(ok(formation), 200);
  },
);
