/**
 * C-end client routes for the friend gift module.
 *
 * Protected by `requireClientCredential` — requires a valid client
 * credential (cpk_ publishable key) in the x-api-key header. HMAC
 * verification of endUserId is done inline via the credential service.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { friendGiftService } from "./index";
import {
  ClientClaimGiftSchema,
  ClientSendGiftSchema,
  DailyStatusResponseSchema,
  ErrorResponseSchema,
  GiftSendListResponseSchema,
  GiftSendResponseSchema,
  PackageListResponseSchema,
  SendIdParamSchema,
} from "./validators";

const TAG = "Friend Gift (Client)";

function serializePackage(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  giftItems: { definitionId: string; quantity: number }[];
  isActive: boolean;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
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
  organizationId: string;
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
    organizationId: row.organizationId,
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

const EndUserQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
    description: "The end user's business id.",
  }),
});

export const friendGiftClientRouter = new OpenAPIHono<HonoEnv>();

friendGiftClientRouter.use("*", requireClientCredential);

friendGiftClientRouter.onError((err, c) => {
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

// GET /packages — list available (active) gift packages
friendGiftClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/packages",
    tags: [TAG],
    summary: "List available gift packages",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PackageListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendGiftService.listPackages(orgId, {
      activeOnly: true,
    });
    return c.json({ items: rows.map(serializePackage) }, 200);
  },
);

// POST /send — send a gift
friendGiftClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/send",
    tags: [TAG],
    summary: "Send a gift to a friend",
    request: {
      body: {
        content: { "application/json": { schema: ClientSendGiftSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: GiftSendResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash, packageId, receiverUserId, message } =
      c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const send = await friendGiftService.sendGift(orgId, endUserId, {
      packageId,
      receiverUserId,
      message,
    });
    return c.json(serializeSend(send), 201);
  },
);

// GET /inbox — pending received gifts
friendGiftClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/inbox",
    tags: [TAG],
    summary: "List pending received gifts",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GiftSendListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendGiftService.listInbox(orgId, endUserId);
    return c.json({ items: rows.map(serializeSend) }, 200);
  },
);

// GET /sent — sent gift history
friendGiftClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/sent",
    tags: [TAG],
    summary: "List sent gift history",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GiftSendListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await friendGiftService.listSent(orgId, endUserId);
    return c.json({ items: rows.map(serializeSend) }, 200);
  },
);

// POST /sends/:id/claim — claim a gift
friendGiftClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/sends/{id}/claim",
    tags: [TAG],
    summary: "Claim a received gift",
    request: {
      params: SendIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientClaimGiftSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GiftSendResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const claimed = await friendGiftService.claimGift(orgId, id, endUserId);
    return c.json(serializeSend(claimed), 200);
  },
);

// GET /daily-status — today's send/receive counts
friendGiftClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/daily-status",
    tags: [TAG],
    summary: "Get today's gift send/receive counts",
    request: { query: EndUserQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: DailyStatusResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId } = c.req.valid("query");
    const userHash = c.req.header("x-user-hash");

    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const status = await friendGiftService.getDailyStatus(orgId, endUserId);
    return c.json(status, 200);
  },
);
