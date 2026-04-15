/**
 * C-end client routes for the collection module.
 *
 * Protected by `requireClientCredential` — requires a valid publishable
 * key (cpk_) in `x-api-key`. Per-endUser HMAC verification is inline via
 * `clientCredentialService.verifyRequest`.
 *
 * Exposed surface:
 *   GET  /albums                          → album list + per-user progress
 *   GET  /albums/:key                     → album detail (entries + progress, redacted)
 *   POST /albums/:key/sync                → fallback inventory reconcile
 *   POST /milestones/:id/claim            → manual milestone claim
 *
 * No CRUD is exposed on the client side; configuration lives in the
 * admin routes only.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { collectionService } from "./index";
import {
  ClaimResponseSchema,
  ClientAlbumDetailSchema,
  ClientAlbumKeyParamSchema,
  ClientAlbumListResponseSchema,
  ClientMilestoneIdParamSchema,
  ClientUserHashBodySchema,
  ErrorResponseSchema,
  SyncResponseSchema,
} from "./validators";

const TAG = "Collection (Client)";

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

function serializeAlbum(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  coverImage: string | null;
  icon: string | null;
  scope: string;
  sortOrder: number;
  isActive: boolean;
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
    coverImage: row.coverImage,
    icon: row.icon,
    scope: row.scope,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeGroup(row: {
  id: string;
  albumId: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    albumId: row.albumId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const collectionClientRouter = new OpenAPIHono<HonoEnv>();

collectionClientRouter.use("*", requireClientCredential);

collectionClientRouter.onError((err, c) => {
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

// ─── Album list (per-user) ───────────────────────────────────────

const AlbumListQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
  }),
});

collectionClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums",
    tags: [TAG],
    summary: "List albums with per-user progress summary",
    request: { query: AlbumListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClientAlbumListResponseSchema },
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
    const rows = await collectionService.listAlbumsForUser({
      organizationId: orgId,
      endUserId,
    });

    return c.json(
      {
        items: rows.map((r) => ({
          album: serializeAlbum(r.album),
          entryCount: r.entryCount,
          unlockedCount: r.unlockedCount,
          unclaimedMilestones: r.unclaimedMilestones,
        })),
      },
      200,
    );
  },
);

// ─── Album detail (per-user) ─────────────────────────────────────

collectionClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/albums/{key}",
    tags: [TAG],
    summary: "Album detail — entries, milestones, per-user progress",
    request: {
      params: ClientAlbumKeyParamSchema,
      query: AlbumListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ClientAlbumDetailSchema } },
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
    const { key } = c.req.valid("param");
    const detail = await collectionService.getAlbumDetailForUser({
      organizationId: orgId,
      endUserId,
      albumKey: key,
    });

    return c.json(
      {
        album: serializeAlbum(detail.album),
        groups: detail.groups.map(serializeGroup),
        entries: detail.entries,
        milestones: detail.milestones,
        totals: detail.totals,
      },
      200,
    );
  },
);

// ─── Sync (fallback) ─────────────────────────────────────────────

collectionClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/albums/{key}/sync",
    tags: [TAG],
    summary:
      "Reconcile unlocks from the user's current inventory (safety net)",
    request: {
      params: ClientAlbumKeyParamSchema,
      body: { content: { "application/json": { schema: ClientUserHashBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: SyncResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash } = c.req.valid("json");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const entries = await collectionService.syncFromInventory({
      organizationId: orgId,
      endUserId,
      albumKey: key,
    });
    return c.json({ unlocked: entries.map((e) => e.id) }, 200);
  },
);

// ─── Milestone claim ─────────────────────────────────────────────

collectionClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/milestones/{id}/claim",
    tags: [TAG],
    summary:
      "Claim a milestone reward (manual path — autoClaim milestones arrive via mail)",
    request: {
      params: ClientMilestoneIdParamSchema,
      body: { content: { "application/json": { schema: ClientUserHashBodySchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ClaimResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { endUserId, userHash } = c.req.valid("json");
    await clientCredentialService.verifyRequest(
      publishableKey,
      endUserId,
      userHash,
    );

    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const result = await collectionService.claimMilestone({
      organizationId: orgId,
      endUserId,
      milestoneId: id,
    });
    return c.json(
      {
        milestoneId: id,
        grantedItems: result.grantedItems,
        claimedAt: result.claimedAt.toISOString(),
      },
      200,
    );
  },
);
