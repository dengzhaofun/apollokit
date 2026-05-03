/**
 * C-end client routes for the announcement module.
 *
 * Mounted at /api/client/announcement. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
 *
 * Surface:
 *   GET  /active              → currently-visible list
 *   POST /{alias}/impression  → fire-and-forget event
 *   POST /{alias}/click       → fire-and-forget event
 */

import { z } from "@hono/zod-openapi";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { announcementService } from "./index";
import {
  AliasParamSchema,
  ClientAnnouncementListResponseSchema,
  } from "./validators";

const TAG = "Announcement (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

export const announcementClientRouter = createClientRouter();

announcementClientRouter.use("*", requireClientCredential);
announcementClientRouter.use("*", requireClientUser);

announcementClientRouter.openapi(
  createClientRoute({
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
            schema: envelopeOf(ClientAnnouncementListResponseSchema,)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const items = await announcementService.getActiveForClient(
      orgId,
      endUserId,
    );
    return c.json(ok({ items }), 200);
  },
);

announcementClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { alias } = c.req.valid("param");
    await announcementService.recordImpression(orgId, alias, endUserId);
    return c.json(ok(null), 200);
  },
);

announcementClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { alias } = c.req.valid("param");
    await announcementService.recordClick(orgId, alias, endUserId);
    return c.json(ok(null), 200);
  },
);
