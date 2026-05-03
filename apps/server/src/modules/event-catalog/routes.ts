/**
 * Event catalog admin routes.
 *
 * Mounted at `/api/v1/event-catalog`. Guarded by `requireAdminOrApiKey` —
 * consistent with the task admin surface. Exposes the merged
 * internal-registry + external-DB view, plus a PATCH to upgrade an
 * external event to canonical.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";

import { eventCatalogService } from "./index";
import {
  CatalogEventViewSchema,
  CatalogListResponseSchema,
  EventNameParamSchema,
  ListEventCatalogQuerySchema,
  UpdateEventCatalogSchema,
} from "./validators";

const TAG = "Event Catalog";

export const eventCatalogRouter = createAdminRouter();

eventCatalogRouter.use("*", requireAdminOrApiKey);
eventCatalogRouter.use("*", requirePermissionByMethod("eventCatalog"));

eventCatalogRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary:
      "List all events (internal + external + platform) for the current org, optionally filtered by capability",
    request: { query: ListEventCatalogQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CatalogListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { capability } = c.req.valid("query");
    const items = await eventCatalogService.listAll(orgId, { capability });
    return c.json(ok({ items }), 200);
  },
);

eventCatalogRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{name}",
    tags: [TAG],
    summary: "Get a single event (internal or external) by name",
    request: { params: EventNameParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CatalogEventViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { name } = c.req.valid("param");
    const view = await eventCatalogService.getOne(orgId, name);
    return c.json(ok(view), 200);
  },
);

eventCatalogRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/{name}",
    tags: [TAG],
    summary:
      "Update description or fields for an external event. Upgrades status to 'canonical'. Rejects internal events.",
    request: {
      params: EventNameParamSchema,
      body: {
        content: { "application/json": { schema: UpdateEventCatalogSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CatalogEventViewSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const view = await eventCatalogService.updateExternal(orgId, name, body);
    return c.json(ok(view), 200);
  },
);
