/**
 * C-end client routes for the exchange module.
 *
 * Mounted at /api/client/exchange. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { exchangeService } from "./index";
import {
  ClientExecuteExchangeSchema,
  ExchangeResultSchema,
} from "./validators";

const TAG = "Exchange (Client)";

export const exchangeClientRouter = createClientRouter();

exchangeClientRouter.use("*", requireClientCredential);
exchangeClientRouter.use("*", requireClientUser);

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
        content: { "application/json": { schema: envelopeOf(ExchangeResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const endUserId = getEndUserId(c);
    const { optionId, idempotencyKey } = c.req.valid("json");

    const orgId = c.get("clientCredential")!.tenantId;
    const result = await exchangeService.execute({
      tenantId: orgId,
      endUserId,
      optionId,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);
