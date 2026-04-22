/**
 * C-end client routes for the exchange module.
 *
 * Mounted at /api/client/exchange. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no auth fields in body or query.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { exchangeService } from "./index";
import {
  ClientExecuteExchangeSchema,
  ErrorResponseSchema,
  ExchangeResultSchema,
} from "./validators";

const TAG = "Exchange (Client)";

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

export const exchangeClientRouter = createClientRouter();

exchangeClientRouter.use("*", requireClientCredential);
exchangeClientRouter.use("*", requireClientUser);

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
  createClientRoute({
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
    const endUserId = c.var.endUserId!;
    const { optionId, idempotencyKey } = c.req.valid("json");

    const orgId = c.get("clientCredential")!.organizationId;
    const result = await exchangeService.execute({
      organizationId: orgId,
      endUserId,
      optionId,
      idempotencyKey,
    });
    return c.json(result, 200);
  },
);
