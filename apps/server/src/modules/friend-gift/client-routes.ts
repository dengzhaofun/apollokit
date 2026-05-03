/**
 * C-end client routes for the friend gift module.
 *
 * Mounted at /api/v1/client/friend-gift. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId
 * (the caller / sender) from getEndUserId(c). Receiver fields (receiverUserId) stay
 * in the request body/query.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { friendGiftService } from "./index";
import {
  ClientClaimGiftSchema,
  ClientSendGiftSchema,
  DailyStatusResponseSchema,
  GiftSendListResponseSchema,
  GiftSendResponseSchema,
  PackageListResponseSchema,
  SendIdParamSchema,
} from "./validators";

const TAG = "Friend Gift (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

function serializePackage(row: {
  id: string;
  tenantId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  giftItems: { definitionId: string; quantity: number }[];
  isActive: boolean;
  sortOrder: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    icon: row.icon,
    giftItems: row.giftItems,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSend(row: {
  id: string;
  tenantId: string;
  packageId: string | null;
  senderUserId: string;
  receiverUserId: string;
  giftItems: { definitionId: string; quantity: number }[];
  status: string;
  claimedAt: Date | null;
  expiresAt: Date | null;
  message: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    packageId: row.packageId,
    senderUserId: row.senderUserId,
    receiverUserId: row.receiverUserId,
    giftItems: row.giftItems,
    status: row.status,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    message: row.message,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const friendGiftClientRouter = createClientRouter();

friendGiftClientRouter.use("*", requireClientCredential);
friendGiftClientRouter.use("*", requireClientUser);

// GET /packages — list available (active) gift packages
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/packages",
    tags: [TAG],
    summary: "List available gift packages",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PackageListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    // Client view: fetch up to the server cap; the client app doesn't paginate.
    const page = await friendGiftService.listPackages(orgId, {
      activeOnly: true,
      limit: 200,
    });
    return c.json(ok({ items: page.items.map(serializePackage), nextCursor: page.nextCursor }), 200);
  },
);

// POST /send — send a gift
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/send",
    tags: [TAG],
    summary: "Send a gift to a friend",
    request: {
      headers: authHeaders,
      body: {
        content: { "application/json": { schema: ClientSendGiftSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(GiftSendResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { packageId, receiverUserId, message } = c.req.valid("json");
    const send = await friendGiftService.sendGift(orgId, endUserId, {
      packageId,
      receiverUserId,
      message,
    });
    return c.json(ok(serializeSend(send)), 201);
  },
);

// GET /inbox — pending received gifts
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/inbox",
    tags: [TAG],
    summary: "List pending received gifts",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GiftSendListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const rows = await friendGiftService.listInbox(orgId, endUserId);
    return c.json(ok({ items: rows.map(serializeSend), nextCursor: null }), 200);
  },
);

// GET /sent — sent gift history
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/sent",
    tags: [TAG],
    summary: "List sent gift history",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GiftSendListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const rows = await friendGiftService.listSent(orgId, endUserId);
    return c.json(ok({ items: rows.map(serializeSend), nextCursor: null }), 200);
  },
);

// POST /sends/:id/claim — claim a gift
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/sends/{id}/claim",
    tags: [TAG],
    summary: "Claim a received gift",
    request: {
      headers: authHeaders,
      params: SendIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientClaimGiftSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GiftSendResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const claimed = await friendGiftService.claimGift(orgId, id, endUserId);
    return c.json(ok(serializeSend(claimed)), 200);
  },
);

// GET /daily-status — today's send/receive counts
friendGiftClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/daily-status",
    tags: [TAG],
    summary: "Get today's gift send/receive counts",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(DailyStatusResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const status = await friendGiftService.getDailyStatus(orgId, endUserId);
    return c.json(ok(status), 200);
  },
);
