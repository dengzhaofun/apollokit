/**
 * C-end client routes for the cdkey module.
 *
 * Protected by `requireClientCredential` + `requireClientUser`. The end user
 * identity (x-end-user-id + x-user-hash HMAC) is verified by middleware, so
 * handlers read orgId from c.get("clientCredential")!.organizationId and
 * endUserId from c.var.endUserId!. No inline verifyRequest calls.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { cdkeyService } from "./index";
import {
  ClientRedeemSchema,
  ErrorResponseSchema,
  RedeemResultSchema,
} from "./validators";

const TAG = "CDKey (Client)";

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
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const cdkeyClientRouter = new OpenAPIHono<HonoEnv>();

cdkeyClientRouter.use("*", requireClientCredential);
cdkeyClientRouter.use("*", requireClientUser);

cdkeyClientRouter.onError((err, c) => {
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
        content: { "application/json": { schema: RedeemResultSchema } },
      },
      ...errorResponses,
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
    return c.json(result, 200);
  },
);
