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

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { announcementService } from "./index";
import {
  AliasParamSchema,
  ClientAnnouncementListResponseSchema,
} from "./validators";

const TAG = "Announcement (Client)";

export const announcementClientRouter = makeApiRouter();

announcementClientRouter.use("*", requireClientCredential);
announcementClientRouter.use("*", requireClientUser);

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
            schema: envelopeOf(ClientAnnouncementListResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const items = await announcementService.getActiveForClient(
      orgId,
      endUserId,
    );
    return c.json(ok({ items }), 200);
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
      200: {
        description: "Recorded",
        content: {
          "application/json": { schema: NullDataEnvelopeSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    await announcementService.recordImpression(orgId, alias, endUserId);
    return c.json(ok(null), 200);
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
      200: {
        description: "Recorded",
        content: {
          "application/json": { schema: NullDataEnvelopeSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { alias } = c.req.valid("param");
    await announcementService.recordClick(orgId, alias, endUserId);
    return c.json(ok(null), 200);
  },
);
