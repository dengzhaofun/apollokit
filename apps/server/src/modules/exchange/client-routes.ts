/**
 * C-end client routes for the exchange module.
 *
 * Protected by `requireClientCredential`. HMAC verification inline.
 * Exposes: list available options, execute exchange, check user state.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { exchangeService } from "./index";
import {
  ClientExecuteExchangeSchema,
  ErrorResponseSchema,
  ExchangeResultSchema,
} from "./validators";

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

export const exchangeClientRouter = new OpenAPIHono<HonoEnv>();

exchangeClientRouter.use("*", requireClientCredential);

exchangeClientRouter.onError((err, c) => {
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

// POST /execute — execute an exchange
exchangeClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/execute",
    tags: [TAG],
    summary: "Execute an exchange for an end user",
    request: {
      body: {
        content: {
          "application/json": { schema: ClientExecuteExchangeSchema },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ExchangeResultSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { optionId, endUserId, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await exchangeService.execute({
      organizationId: orgId,
      endUserId,
      optionId,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);
