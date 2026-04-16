/**
 * C-end client routes for the entity module.
 *
 * Protected by `requireClientCredential` — requires cpk_ publishable key.
 * HMAC verification of endUserId is done inline.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { entityService } from "./index";
import { ErrorResponseSchema } from "./validators";

const TAG = "Entity (Client)";

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

const EndUserParam = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's business id.",
  }),
});

const InstanceIdParam = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
  }),
  instanceId: z.string().uuid().openapi({
    param: { name: "instanceId", in: "path" },
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyClient(c: any) {
  const publishableKey = c.req.header("x-api-key")!;
  const { endUserId } = c.req.valid("param") as { endUserId: string };
  const userHash = c.req.header("x-user-hash");
  await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);
}

export const entityClientRouter = new OpenAPIHono<HonoEnv>();

entityClientRouter.use("*", requireClientCredential);

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
    path: "/users/{endUserId}/instances",
    tags: [TAG],
    summary: "List entity instances for an end user",
    request: {
      params: EndUserParam,
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}",
    tags: [TAG],
    summary: "Get entity instance detail with slots",
    request: { params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
    const result = await entityService.getInstance(orgId, endUserId, instanceId);
    return c.json(result, 200);
  },
);

// ─── Acquire / Discard ────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/acquire",
    tags: [TAG],
    summary: "Acquire a new entity instance",
    request: {
      params: EndUserParam,
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}/discard",
    tags: [TAG],
    summary: "Discard (delete) an entity instance",
    request: { params: InstanceIdParam },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
    await entityService.discardEntity(orgId, endUserId, instanceId);
    return c.body(null, 204);
  },
);

// ─── Lock ─────────────────────────────────────────────────────

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/instances/{instanceId}/lock",
    tags: [TAG],
    summary: "Toggle entity lock",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}/add-exp",
    tags: [TAG],
    summary: "Add experience points",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
    const { amount } = c.req.valid("json");
    const inst = await entityService.addExp(orgId, endUserId, instanceId, amount);
    return c.json(inst, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/instances/{instanceId}/level-up",
    tags: [TAG],
    summary: "Level up (consumes materials)",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}/rank-up",
    tags: [TAG],
    summary: "Rank up (consumes materials)",
    request: { params: InstanceIdParam },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.any() } } },
      ...errorResponses,
    },
  }),
  async (c) => {
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
    const inst = await entityService.rankUp(orgId, endUserId, instanceId);
    return c.json(inst, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/instances/{instanceId}/synthesize",
    tags: [TAG],
    summary: "Synthesize (merge) entities",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}/equip",
    tags: [TAG],
    summary: "Equip an entity into a slot",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
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
    path: "/users/{endUserId}/instances/{instanceId}/unequip",
    tags: [TAG],
    summary: "Unequip an entity from a slot",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
    const { slotKey, slotIndex } = c.req.valid("json");
    await entityService.unequip(orgId, endUserId, instanceId, slotKey, slotIndex);
    return c.body(null, 204);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/users/{endUserId}/instances/{instanceId}/change-skin",
    tags: [TAG],
    summary: "Change entity skin",
    request: {
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, instanceId } = c.req.valid("param");
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
    path: "/users/{endUserId}/formations/{configId}",
    tags: [TAG],
    summary: "List formations for a config",
    request: {
      params: z.object({
        endUserId: z.string().min(1).max(256).openapi({
          param: { name: "endUserId", in: "path" },
        }),
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, configId } = c.req.valid("param");
    const rows = await entityService.listFormations(orgId, endUserId, configId);
    return c.json(rows, 200);
  },
);

entityClientRouter.openapi(
  createRoute({
    method: "put",
    path: "/users/{endUserId}/formations/{configId}/{formationIndex}",
    tags: [TAG],
    summary: "Update a formation",
    request: {
      params: z.object({
        endUserId: z.string().min(1).max(256).openapi({
          param: { name: "endUserId", in: "path" },
        }),
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
    await verifyClient(c);
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId, configId, formationIndex } = c.req.valid("param");
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
