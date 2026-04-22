/**
 * C-end client routes for the banner module.
 *
 * Mounted at /api/client/banner. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Surface:
 *   GET /groups/{alias}
 *     Returns the group metadata + currently-visible banners for the
 *     given end user. Groups without an alias are unreachable here —
 *     this is the "publish gate" documented in the module header.
 */


import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { bannerService } from "./index";
import {
  ClientBannerGroupResponseSchema,
  ErrorResponseSchema,
  GroupAliasParamSchema,
} from "./validators";

const TAG = "Banner (Client)";

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

export const bannerClientRouter = createClientRouter();

bannerClientRouter.use("*", requireClientCredential);
bannerClientRouter.use("*", requireClientUser);

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
  createClientRoute({
    method: "get",
    path: "/groups/{alias}",
    tags: [TAG],
    summary: "Resolve a banner group by alias for an end user",
    request: {
      headers: authHeaders,
      params: GroupAliasParamSchema,
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
    const { alias } = c.req.valid("param");
    const endUserId = c.var.endUserId!;
    const orgId = c.get("clientCredential")!.organizationId;
    const group = await bannerService.getClientGroupByAlias(
      orgId,
      alias,
      endUserId,
    );
    return c.json(group, 200);
  },
);
