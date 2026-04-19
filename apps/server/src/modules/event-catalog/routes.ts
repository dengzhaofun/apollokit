/**
 * Event catalog admin routes.
 *
 * Mounted at `/api/event-catalog`. Guarded by `requireAdminOrApiKey` —
 * consistent with the task admin surface. Exposes the merged
 * internal-registry + external-DB view, plus a PATCH to upgrade an
 * external event to canonical.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";

import { eventCatalogService } from "./index";
import {
  CatalogEventViewSchema,
  CatalogListResponseSchema,
  ErrorResponseSchema,
  EventNameParamSchema,
  UpdateEventCatalogSchema,
} from "./validators";

const TAG = "Event Catalog";

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
};

export const eventCatalogRouter = new OpenAPIHono<HonoEnv>();

eventCatalogRouter.use("*", requireAdminOrApiKey);

eventCatalogRouter.onError((err, c) => {
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

eventCatalogRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: [TAG],
    summary: "List all events (internal + external) for the current org",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: CatalogListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const items = await eventCatalogService.listAll(orgId);
    return c.json({ items }, 200);
  },
);

eventCatalogRouter.openapi(
  createRoute({
    method: "get",
    path: "/{name}",
    tags: [TAG],
    summary: "Get a single event (internal or external) by name",
    request: { params: EventNameParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: CatalogEventViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { name } = c.req.valid("param");
    const view = await eventCatalogService.getOne(orgId, name);
    return c.json(view, 200);
  },
);

eventCatalogRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: CatalogEventViewSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const view = await eventCatalogService.updateExternal(orgId, name, body);
    return c.json(view, 200);
  },
);
