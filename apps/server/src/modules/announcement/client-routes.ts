/**
 * C-end client routes for the announcement module.
 *
 * Protected by `requireClientCredential` (cpk_ publishable key in
 * x-api-key). HMAC verification of endUserId is done inline via the
 * client credential service — same pattern as banner/mail client routes.
 *
 * Surface:
 *   GET  /active?endUserId=...              → currently-visible list
 *   POST /{alias}/impression  { endUserId } → fire-and-forget event
 *   POST /{alias}/click       { endUserId } → fire-and-forget event
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { announcementService } from "./index";
import {
  AliasParamSchema,
  ClientAckBodySchema,
  ClientAnnouncementListResponseSchema,
  ClientListQuerySchema,
  ErrorResponseSchema,
} from "./validators";

const TAG = "Announcement (Client)";

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
    request: { query: ClientListQuerySchema },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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
      params: AliasParamSchema,
      body: {
        content: { "application/json": { schema: ClientAckBodySchema } },
      },
    },
    responses: {
      204: { description: "Recorded" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { alias } = c.req.valid("param");
    const { endUserId } = c.req.valid("json");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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
      params: AliasParamSchema,
      body: {
        content: { "application/json": { schema: ClientAckBodySchema } },
      },
    },
    responses: {
      204: { description: "Recorded" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { alias } = c.req.valid("param");
    const { endUserId } = c.req.valid("json");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    await announcementService.recordClick(orgId, alias, endUserId);
    return c.body(null, 204);
  },
);
