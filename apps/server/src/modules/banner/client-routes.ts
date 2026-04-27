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
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { bannerService } from "./index";
import {
  ClientBannerGroupResponseSchema,
  GroupAliasParamSchema,
} from "./validators";

const TAG = "Banner (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

export const bannerClientRouter = createClientRouter();

bannerClientRouter.use("*", requireClientCredential);
bannerClientRouter.use("*", requireClientUser);

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
          "application/json": { schema: envelopeOf(ClientBannerGroupResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { alias } = c.req.valid("param");
    const endUserId = getEndUserId(c);
    const orgId = c.get("clientCredential")!.organizationId;
    const group = await bannerService.getClientGroupByAlias(
      orgId,
      alias,
      endUserId,
    );
    return c.json(ok(group), 200);
  },
);
