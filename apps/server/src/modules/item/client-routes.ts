/**
 * C-end client routes for the item module.
 *
 * Mounted at /api/client/item. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { lotteryService } from "../lottery";
import { itemService } from "./index";
import {
  BalanceResponseSchema,
  InventoryListResponseSchema,
  UseItemSchema,
  UseItemResponseSchema,
} from "./validators";

const TAG = "Item (Client)";

const BalanceKeyParam = z.object({
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

export const itemClientRouter = createClientRouter();

itemClientRouter.use("*", requireClientCredential);
itemClientRouter.use("*", requireClientUser);

// GET /inventory
itemClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/inventory",
    tags: [TAG],
    summary: "Get the caller's inventory",
    request: {
      query: DefinitionIdQuery,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(InventoryListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { definitionId } = c.req.valid("query");
    const items = await itemService.getInventory({
      organizationId: orgId,
      endUserId,
      definitionId,
    });
    return c.json(ok({ items }), 200);
  },
);

// GET /balance/:key
itemClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/balance/{key}",
    tags: [TAG],
    summary: "Get the caller's balance for a specific item",
    request: {
      params: BalanceKeyParam,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(BalanceResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const def = await itemService.getDefinition(orgId, key);
    const balance = await itemService.getBalance({
      organizationId: orgId,
      endUserId,
      definitionId: def.id,
    });
    return c.json(ok({ definitionId: def.id, balance }), 200);
  },
);

// POST /use — use an item (deduct + trigger lottery if linked)
itemClientRouter.openapi(
  createClientRoute({
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
        content: { "application/json": { schema: envelopeOf(UseItemResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { definitionId, idempotencyKey } = c.req.valid("json");

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

    return c.json(ok({
        definitionId: def.id,
        definitionName: def.name,
        lotteryResult,
      }), 200,);
  },
);
