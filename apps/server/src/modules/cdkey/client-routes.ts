/**
 * C-end client routes for the cdkey module.
 *
 * Protected by `requireClientCredential` + `requireClientUser`. The end user
 * identity (x-end-user-id + x-user-hash HMAC) is verified by middleware, so
 * handlers read orgId from c.get("clientCredential")!.organizationId and
 * endUserId from c.var.endUserId!. No inline verifyRequest calls.
 */

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { z } from "@hono/zod-openapi";

import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { cdkeyService } from "./index";
import {
  ClientRedeemSchema,
  RedeemResultSchema,
} from "./validators";

const TAG = "CDKey (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

export const cdkeyClientRouter = makeApiRouter();

cdkeyClientRouter.use("*", requireClientCredential);
cdkeyClientRouter.use("*", requireClientUser);

cdkeyClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/redeem",
    tags: [TAG],
    summary: "Redeem a code for an end user",
    request: {
      headers: authHeaders,
      body: {
        content: { "application/json": { schema: ClientRedeemSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(RedeemResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = c.var.endUserId!;
    const { code, idempotencyKey } = c.req.valid("json");

    const orgId = c.get("clientCredential")!.organizationId;
    const result = await cdkeyService.redeem({
      organizationId: orgId,
      endUserId,
      code,
      idempotencyKey,
      source: "api",
    });
    return c.json(ok(result), 200);
  },
);
