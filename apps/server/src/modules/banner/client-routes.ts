/**
 * C-end client routes for the banner module.
 *
 * Protected by `requireClientCredential` (cpk_ publishable key in
 * x-api-key). HMAC verification of endUserId is done inline via the
 * client credential service — same pattern as mail/shop client routes.
 *
 * Surface:
 *   GET /groups/{alias}?endUserId=...
 *     Returns the group metadata + currently-visible banners for the
 *     given end user. Groups without an alias are unreachable here —
 *     this is the "publish gate" documented in the module header.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { bannerService } from "./index";
import {
  ClientBannerGroupResponseSchema,
  ClientGroupQuerySchema,
  ErrorResponseSchema,
  GroupAliasParamSchema,
} from "./validators";

const TAG = "Banner (Client)";

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

export const bannerClientRouter = new OpenAPIHono<HonoEnv>();

bannerClientRouter.use("*", requireClientCredential);

bannerClientRouter.onError((err, c) => {
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

bannerClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/groups/{alias}",
    tags: [TAG],
    summary: "Resolve a banner group by alias for an end user",
    request: {
      params: GroupAliasParamSchema,
      query: ClientGroupQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClientBannerGroupResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { alias } = c.req.valid("param");
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const group = await bannerService.getClientGroupByAlias(
      orgId,
      alias,
      endUserId,
    );
    return c.json(group, 200);
  },
);
