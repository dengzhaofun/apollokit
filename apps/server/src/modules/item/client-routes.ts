/**
 * C-end client routes for the item module.
 *
 * Protected by `requireClientCredential` — requires cpk_ publishable key.
 * HMAC verification of endUserId is done inline.
 *
 * Exposes read-only inventory queries for end users.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { lotteryService } from "../lottery";
import { itemService } from "./index";
import {
  BalanceResponseSchema,
  ErrorResponseSchema,
  InventoryListResponseSchema,
  UseItemSchema,
  UseItemResponseSchema,
} from "./validators";

const TAG = "Item (Client)";

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
    description: "Definition id or alias.",
  }),
});

const DefinitionIdQuery = z.object({
  definitionId: z.string().uuid().optional().openapi({
    param: { name: "definitionId", in: "query" },
    description: "Filter by definition ID.",
  }),
});

export const itemClientRouter = new OpenAPIHono<HonoEnv>();

itemClientRouter.use("*", requireClientCredential);

itemClientRouter.onError((err, c) => {
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

// GET /users/:endUserId/inventory
itemClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/inventory",
    tags: [TAG],
    summary: "Get an end user's inventory",
    request: {
      params: ClientEndUserParam,
      query: DefinitionIdQuery,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: InventoryListResponseSchema } },
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
    const { definitionId } = c.req.valid("query");
    const items = await itemService.getInventory({
      organizationId: orgId,
      endUserId,
      definitionId,
    });
    return c.json({ items }, 200);
  },
);

// GET /users/:endUserId/balance/:key
itemClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/users/{endUserId}/balance/{key}",
    tags: [TAG],
    summary: "Get an end user's balance for a specific item",
    request: {
      params: ClientBalanceParam,
    },
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
    const def = await itemService.getDefinition(orgId, key);
    const balance = await itemService.getBalance({
      organizationId: orgId,
      endUserId,
      definitionId: def.id,
    });
    return c.json({ definitionId: def.id, balance }, 200);
  },
);

// POST /use — use an item (deduct + trigger lottery if linked)
itemClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/use",
    tags: [TAG],
    summary: "Use an item (deducts 1 and triggers lottery if linked)",
    request: {
      body: {
        content: { "application/json": { schema: UseItemSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: UseItemResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { definitionId, endUserId, userHash, idempotencyKey } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;

    // 1. Look up the item definition
    const def = await itemService.getDefinition(orgId, definitionId);

    // 2. Deduct 1 from inventory
    await itemService.deductItems({
      organizationId: orgId,
      endUserId,
      deductions: [{ definitionId: def.id, quantity: 1 }],
      source: "use_item",
      sourceId: idempotencyKey,
    });

    // 3. If linked to a lottery pool, trigger a pull
    let lotteryResult = null;
    if (def.lotteryPoolId) {
      lotteryResult = await lotteryService.pull({
        organizationId: orgId,
        endUserId,
        poolKey: def.lotteryPoolId,
        idempotencyKey,
      });
    }

    return c.json(
      {
        definitionId: def.id,
        definitionName: def.name,
        lotteryResult,
      },
      200,
    );
  },
);
