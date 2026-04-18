/**
 * C-end client routes for the currency module.
 *
 * Protected by `requireClientCredential` — requires a cpk_ publishable
 * key. HMAC verification of `endUserId` is done inline per handler via
 * `clientCredentialService.verifyRequest`.
 *
 * Exposes read-only wallet / balance queries for end users.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { currencyService } from "./index";
import {
  BalanceResponseSchema,
  ErrorResponseSchema,
  WalletListResponseSchema,
} from "./validators";

const TAG = "Currency (Client)";

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

const ClientEndUserParam = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's business id.",
  }),
});

const ClientBalanceParam = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's business id.",
  }),
  key: z.string().min(1).openapi({
    param: { name: "key", in: "path" },
    description: "Currency id or alias.",
  }),
});

export const currencyClientRouter = new OpenAPIHono<HonoEnv>();

currencyClientRouter.use("*", requireClientCredential);

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

// GET /users/:endUserId/wallets — all balances
currencyClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/wallets",
    tags: [TAG],
    summary: "List all currency balances for a user",
    request: { params: ClientEndUserParam },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: WalletListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("param");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const wallets = await currencyService.getWallets(orgId, endUserId);
    return c.json({ items: wallets }, 200);
  },
);

// GET /users/:endUserId/balance/:key — single balance by id or alias
currencyClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/balance/{key}",
    tags: [TAG],
    summary: "Get balance for a specific currency",
    request: { params: ClientBalanceParam },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: BalanceResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, key } = c.req.valid("param");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const def = await currencyService.getDefinition(orgId, key);
    const balance = await currencyService.getBalance(orgId, endUserId, def.id);
    return c.json({ currencyId: def.id, balance }, 200);
  },
);
