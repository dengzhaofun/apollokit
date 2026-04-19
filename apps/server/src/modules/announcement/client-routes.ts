/**
 * C-end client routes for the announcement module.
 *
 * Mounted at /api/client/announcement. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no auth fields in body or query.
 *
 * Surface:
 *   GET  /active              → currently-visible list
 *   POST /{alias}/impression  → fire-and-forget event
 *   POST /{alias}/click       → fire-and-forget event
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { announcementService } from "./index";
import {
  AliasParamSchema,
  ClientAnnouncementListResponseSchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Announcement (Client)";

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
};

export const announcementClientRouter = new OpenAPIHono<HonoEnv>();

announcementClientRouter.use("*", requireClientCredential);
announcementClientRouter.use("*", requireClientUser);

announcementClientRouter.onError((err, c) => {
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

announcementClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/active",
    tags: [TAG],
    summary: "List currently-visible announcements for an end user",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: ClientAnnouncementListResponseSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const items = await announcementService.getActiveForClient(
      orgId,
      endUserId,
    );
    return c.json({ items }, 200);
  },
);

announcementClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/{alias}/impression",
    tags: [TAG],
    summary: "Record an impression for an announcement",
    request: {
      headers: authHeaders,
      params: AliasParamSchema,
    },
    responses: {
      204: { description: "Recorded" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    await announcementService.recordImpression(orgId, alias, endUserId);
    return c.body(null, 204);
  },
);

announcementClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/{alias}/click",
    tags: [TAG],
    summary: "Record a CTA click for an announcement",
    request: {
      headers: authHeaders,
      params: AliasParamSchema,
    },
    responses: {
      204: { description: "Recorded" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    await announcementService.recordClick(orgId, alias, endUserId);
    return c.body(null, 204);
  },
);
