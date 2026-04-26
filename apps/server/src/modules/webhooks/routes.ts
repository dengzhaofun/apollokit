/**
 * Admin-facing HTTP routes for the webhooks module.
 *
 * Every route is guarded by `requireAdminOrApiKey` (session cookie OR
 * admin `ak_` API key). Secrets are returned in plaintext ONLY from
 * POST `/endpoints` and POST `/endpoints/{id}/rotate-secret`.
 */

import { PaginationQuerySchema } from "../../lib/pagination";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
import { webhooksService } from "./index";
import type {
  WebhooksDelivery,
  WebhooksEndpoint,
  WebhooksEndpointView,
} from "./types";
import {
  CreateEndpointSchema,
  DeliveryIdParamSchema,
  DeliveryListResponseSchema,
  DeliveryResponseSchema,
  EndpointListResponseSchema,
  EndpointResponseSchema,
  EndpointWithSecretResponseSchema,
  IdParamSchema,
  ListDeliveriesQuerySchema,
  UpdateEndpointSchema,
} from "./validators";

const TAG = "Webhooks";

function serializeEndpoint(row: WebhooksEndpointView | WebhooksEndpoint) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    url: row.url,
    description: row.description,
    eventTypes: row.eventTypes ?? [],
    secretHint: row.secretHint,
    status: row.status as "active" | "disabled" | "paused_failing",
    consecutiveFailures: row.consecutiveFailures,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeDelivery(row: WebhooksDelivery) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    endpointId: row.endpointId,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as
      | "pending"
      | "in_flight"
      | "success"
      | "failed"
      | "dead",
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    lastAttemptedAt: row.lastAttemptedAt?.toISOString() ?? null,
    succeededAt: row.succeededAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const webhooksRouter = createAdminRouter();

webhooksRouter.use("*", requireAdminOrApiKey);
webhooksRouter.use("*", requireOrgManage);

// POST /endpoints — create (returns plaintext secret once)
webhooksRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/endpoints",
    tags: [TAG],
    summary:
      "Create a webhook endpoint. Response includes the signing secret — it is shown only once.",
    request: {
      body: {
        content: { "application/json": { schema: CreateEndpointSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: envelopeOf(EndpointWithSecretResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const { endpoint, secret } = await webhooksService.createEndpoint(
      orgId,
      input,
    );
    return c.json(
      ok({ ...serializeEndpoint(endpoint), secret }),
      201,
    );
  },
);

// GET /endpoints — list
webhooksRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/endpoints",
    tags: [TAG],
    summary: "List webhook endpoints for the current project",
    request: { query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(EndpointListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const page = await webhooksService.listEndpoints(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeEndpoint), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// GET /endpoints/:id
webhooksRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/endpoints/{id}",
    tags: [TAG],
    summary: "Get a webhook endpoint by id",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(EndpointResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await webhooksService.getEndpoint(orgId, id);
    return c.json(ok(serializeEndpoint(row)), 200);
  },
);

// PATCH /endpoints/:id
webhooksRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/endpoints/{id}",
    tags: [TAG],
    summary: "Update a webhook endpoint",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateEndpointSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(EndpointResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const row = await webhooksService.updateEndpoint(orgId, id, patch);
    return c.json(ok(serializeEndpoint(row)), 200);
  },
);

// POST /endpoints/:id/rotate-secret
webhooksRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/endpoints/{id}/rotate-secret",
    tags: [TAG],
    summary:
      "Rotate the signing secret. Previous secret is invalid immediately; new secret is shown only in this response.",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "Rotated",
        content: {
          "application/json": {
            schema: envelopeOf(EndpointWithSecretResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { endpoint, secret } = await webhooksService.rotateSecret(orgId, id);
    return c.json(
      ok({ ...serializeEndpoint(endpoint), secret }),
      200,
    );
  },
);

// DELETE /endpoints/:id
webhooksRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/endpoints/{id}",
    tags: [TAG],
    summary: "Delete a webhook endpoint (cascades to deliveries)",
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await webhooksService.deleteEndpoint(orgId, id);
    return c.json(ok(null), 200);
  },
);

// GET /endpoints/:id/deliveries
webhooksRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/endpoints/{id}/deliveries",
    tags: [TAG],
    summary: "List recent delivery attempts for an endpoint",
    request: {
      params: IdParamSchema,
      query: ListDeliveriesQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(DeliveryListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const q = c.req.valid("query");
    const page = await webhooksService.listDeliveries(orgId, id, {
      status: q.status,
      cursor: q.cursor,
      limit: q.limit,
    });
    return c.json(
      ok({ items: page.items.map(serializeDelivery), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// POST /deliveries/:id/replay
webhooksRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/deliveries/{id}/replay",
    tags: [TAG],
    summary:
      "Replay a delivery — queues a new pending delivery reusing the original event id",
    request: { params: DeliveryIdParamSchema },
    responses: {
      200: {
        description: "Queued",
        content: {
          "application/json": { schema: envelopeOf(DeliveryResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await webhooksService.replayDelivery(orgId, id);
    return c.json(ok(serializeDelivery(row)), 200);
  },
);
