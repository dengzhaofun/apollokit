/**
 * C-end client routes for the cdkey module.
 *
 * Protected by `requireClientCredential`. HMAC verification of the endUserId
 * is delegated to clientCredentialService.verifyRequest() inline.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { cdkeyService } from "./index";
import {
  ClientRedeemSchema,
  ErrorResponseSchema,
  RedeemResultSchema,
} from "./validators";

const TAG = "CDKey (Client)";

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
    const publishableKey = c.req.header("x-api-key")!;
    const { code, endUserId, userHash, idempotencyKey } = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
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
