/**
 * C-end client routes for the currency module.
 *
 * Mounted at /api/client/currency. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body, query, or path.
 *
 * Exposes read-only wallet / balance queries for end users.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { currencyService } from "./index";
import {
  BalanceResponseSchema,
  WalletListResponseSchema,
} from "./validators";

const TAG = "Currency (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

const ClientBalanceParam = z.object({
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Currency id or alias.",
  }),
});

export const currencyClientRouter = createClientRouter();

currencyClientRouter.use("*", requireClientCredential);
currencyClientRouter.use("*", requireClientUser);

// GET /wallets — all balances
currencyClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/wallets",
    tags: [TAG],
    summary: "List all currency balances for a user",
    request: { headers: authHeaders },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(WalletListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const wallets = await currencyService.getWallets(orgId, endUserId);
    return c.json(ok({ items: wallets }), 200);
  },
);

// GET /balance/:key — single balance by id or alias
currencyClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/balance/{key}",
    tags: [TAG],
    summary: "Get balance for a specific currency",
    request: { headers: authHeaders, params: ClientBalanceParam },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BalanceResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const def = await currencyService.getDefinition(orgId, key);
    const balance = await currencyService.getBalance(orgId, endUserId, def.id);
    return c.json(ok({ currencyId: def.id, balance }), 200);
  },
);
