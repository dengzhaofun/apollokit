/**
 * C-end client routes for the collection module.
 *
 * Mounted at /api/v1/client/collection. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
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

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { collectionService } from "./index";
import {
  ClaimResponseSchema,
  ClientAlbumDetailSchema,
  ClientAlbumKeyParamSchema,
  ClientAlbumListResponseSchema,
  ClientMilestoneIdParamSchema,
  SyncResponseSchema,
} from "./validators";

const TAG = "Collection (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

function serializeAlbum(row: {
  id: string;
  tenantId: string;
  alias: string | null;
  name: string;
  description: string | null;
  coverImage: string | null;
  icon: string | null;
  scope: string;
  sortOrder: string;
  isActive: boolean;
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
  tenantId: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    albumId: row.albumId,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const collectionClientRouter = createClientRouter();

collectionClientRouter.use("*", requireClientCredential);
collectionClientRouter.use("*", requireClientUser);

// ─── Album list (per-user) ───────────────────────────────────────

collectionClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/albums",
    tags: [TAG],
    summary: "List albums with per-user progress summary",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ClientAlbumListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const rows = await collectionService.listAlbumsForUser({
      tenantId: orgId,
      endUserId,
    });

    return c.json(ok({
        items: rows.map((r) => ({
          album: serializeAlbum(r.album),
          entryCount: r.entryCount,
          unlockedCount: r.unlockedCount,
          unclaimedMilestones: r.unclaimedMilestones,
        })),
      }), 200,);
  },
);

// ─── Album detail (per-user) ─────────────────────────────────────

collectionClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/albums/{key}",
    tags: [TAG],
    summary: "Album detail — entries, milestones, per-user progress",
    request: {
      headers: authHeaders,
      params: ClientAlbumKeyParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ClientAlbumDetailSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const detail = await collectionService.getAlbumDetailForUser({
      tenantId: orgId,
      endUserId,
      albumKey: key,
    });

    return c.json(ok({
        album: serializeAlbum(detail.album),
        groups: detail.groups.map(serializeGroup),
        entries: detail.entries,
        milestones: detail.milestones,
        totals: detail.totals,
      }), 200,);
  },
);

// ─── Sync (fallback) ─────────────────────────────────────────────

collectionClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/albums/{key}/sync",
    tags: [TAG],
    summary:
      "Reconcile unlocks from the user's current inventory (safety net)",
    request: {
      headers: authHeaders,
      params: ClientAlbumKeyParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SyncResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const entries = await collectionService.syncFromInventory({
      tenantId: orgId,
      endUserId,
      albumKey: key,
    });
    return c.json(ok({ unlocked: entries.map((e) => e.id) }), 200);
  },
);

// ─── Milestone claim ─────────────────────────────────────────────

collectionClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/milestones/{id}/claim",
    tags: [TAG],
    summary:
      "Claim a milestone reward (manual path — autoClaim milestones arrive via mail)",
    request: {
      headers: authHeaders,
      params: ClientMilestoneIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ClaimResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const result = await collectionService.claimMilestone({
      tenantId: orgId,
      endUserId,
      milestoneId: id,
    });
    return c.json(ok({
        milestoneId: id,
        grantedItems: result.grantedItems,
        claimedAt: result.claimedAt.toISOString(),
      }), 200,);
  },
);
