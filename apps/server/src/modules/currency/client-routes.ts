/**
 * C-end client routes for the currency module.
 *
 * Mounted at /api/client/currency. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * c.var.endUserId!. No inline verifyRequest calls; no auth fields in body, query, or path.
 *
 * Exposes read-only wallet / balance queries for end users.
 */

import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { currencyService } from "./index";
import {
  BalanceResponseSchema,
  ErrorResponseSchema,
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

export const currencyClientRouter = createClientRouter();

currencyClientRouter.use("*", requireClientCredential);
currencyClientRouter.use("*", requireClientUser);

currencyClientRouter.onError((err, c) => {
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
        content: { "application/json": { schema: WalletListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const wallets = await currencyService.getWallets(orgId, endUserId);
    return c.json({ items: wallets }, 200);
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
        content: { "application/json": { schema: BalanceResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { key } = c.req.valid("param");
    const def = await currencyService.getDefinition(orgId, key);
    const balance = await currencyService.getBalance(orgId, endUserId, def.id);
    return c.json({ currencyId: def.id, balance }, 200);
  },
);
