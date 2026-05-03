/**
 * Admin routes for the offline-check-in module.
 *
 * Mounted at `/api/offline-check-in/*` in src/index.ts. All routes require
 * an admin session OR an admin API key (`ak_`); end-user (cpk_) routes
 * live in `client-routes.ts`.
 */

import { z } from "@hono/zod-openapi";

import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import { PaginationQuerySchema } from "../../lib/pagination";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { offlineCheckInService } from "./index";
import {
  CampaignIdParamSchema,
  CampaignKeyParamSchema,
  CampaignListResponseSchema,
  CampaignResponseSchema,
  CheckInRequestSchema,
  CheckInResultSchema,
  CreateCampaignSchema,
  CreateSpotSchema,
  ManualCodeResponseSchema,
  MintQrTokensRequestSchema,
  MintQrTokensResponseSchema,
  ProgressListResponseSchema,
  ProgressResponseSchema,
  SpotIdParamSchema,
  SpotListResponseSchema,
  SpotResponseSchema,
  UpdateCampaignSchema,
  UpdateSpotSchema,
} from "./validators";
import type {
  OfflineCheckInCampaign,
  OfflineCheckInSpot,
  OfflineCheckInUserProgressRow,
} from "./types";

const TAG = "Offline Check-In";

// ─── Serializers (Date → ISO; jsonb columns are pre-parsed) ───────

function serializeCampaign(row: OfflineCheckInCampaign) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    bannerImage: row.bannerImage,
    mode: row.mode as "collect" | "daily",
    completionRule: row.completionRule,
    completionRewards: row.completionRewards,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    timezone: row.timezone,
    status: row.status as "draft" | "published" | "active" | "ended",
    collectionAlbumId: row.collectionAlbumId,
    activityNodeId: row.activityNodeId,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSpot(row: OfflineCheckInSpot) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    coverImage: row.coverImage,
    latitude: row.latitude,
    longitude: row.longitude,
    geofenceRadiusM: row.geofenceRadiusM,
    verification: row.verification,
    spotRewards: row.spotRewards,
    collectionEntryAliases: row.collectionEntryAliases,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProgress(row: OfflineCheckInUserProgressRow) {
  return {
    campaignId: row.campaignId,
    endUserId: row.endUserId,
    tenantId: row.tenantId,
    spotsCompleted: row.spotsCompleted,
    totalCount: row.totalCount,
    lastSpotId: row.lastSpotId,
    lastCheckInAt: row.lastCheckInAt?.toISOString() ?? null,
    dailyCount: row.dailyCount,
    dailyDates: row.dailyDates,
    completedAt: row.completedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const offlineCheckInRouter = createAdminRouter();

offlineCheckInRouter.use("*", requireAdminOrApiKey);
offlineCheckInRouter.use("*", requirePermissionByMethod("offlineCheckIn"));

// ─── Campaign CRUD ──────────────────────────────────────────────

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/campaigns",
    tags: [TAG],
    summary: "Create an offline check-in campaign",
    request: {
      body: { content: { "application/json": { schema: CreateCampaignSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(CampaignResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await offlineCheckInService.createCampaign(orgId, c.req.valid("json"));
    return c.json(ok(serializeCampaign(row)), 201);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/campaigns",
    tags: [TAG],
    summary: "List offline check-in campaigns",
    request: {
      query: z.object({
        status: z
          .enum(["draft", "published", "active", "ended"])
          .optional()
          .openapi({ param: { name: "status", in: "query" } }),
        cursor: z.string().optional().openapi({ param: { name: "cursor", in: "query" } }),
        limit: z.coerce.number().int().min(1).max(200).optional().openapi({
          param: { name: "limit", in: "query" },
        }),
        q: z.string().optional().openapi({ param: { name: "q", in: "query" } }),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CampaignListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await offlineCheckInService.listCampaigns(orgId, {
      status: q.status,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeCampaign), nextCursor: page.nextCursor }),
      200,
    );
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/campaigns/{key}",
    tags: [TAG],
    summary: "Fetch a campaign by id or alias",
    request: { params: CampaignKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CampaignResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await offlineCheckInService.getCampaign(orgId, key);
    return c.json(ok(serializeCampaign(row)), 200);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/campaigns/{id}",
    tags: [TAG],
    summary: "Update a campaign",
    request: {
      params: CampaignIdParamSchema,
      body: { content: { "application/json": { schema: UpdateCampaignSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CampaignResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await offlineCheckInService.updateCampaign(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeCampaign(row)), 200);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/campaigns/{id}",
    tags: [TAG],
    summary: "Delete a campaign (cascades to spots / logs / progress / grants)",
    request: { params: CampaignIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await offlineCheckInService.deleteCampaign(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Spot CRUD ──────────────────────────────────────────────────

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/campaigns/{key}/spots",
    tags: [TAG],
    summary: "Add a spot to a campaign",
    request: {
      params: CampaignKeyParamSchema,
      body: { content: { "application/json": { schema: CreateSpotSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(SpotResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await offlineCheckInService.createSpot(orgId, key, c.req.valid("json"));
    return c.json(ok(serializeSpot(row)), 201);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/campaigns/{key}/spots",
    tags: [TAG],
    summary: "List spots within a campaign",
    request: { params: CampaignKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SpotListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const rows = await offlineCheckInService.listSpots(orgId, key);
    return c.json(ok({ items: rows.map(serializeSpot) }), 200);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/spots/{id}",
    tags: [TAG],
    summary: "Update a spot",
    request: {
      params: SpotIdParamSchema,
      body: { content: { "application/json": { schema: UpdateSpotSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(SpotResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await offlineCheckInService.updateSpot(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeSpot(row)), 200);
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/spots/{id}",
    tags: [TAG],
    summary: "Delete a spot",
    request: { params: SpotIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    await offlineCheckInService.deleteSpot(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── QR mint + manual code rotation ─────────────────────────────

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/spots/{id}/qr-tokens",
    tags: [TAG],
    summary: "Mint one-time QR tokens for a spot",
    request: {
      params: SpotIdParamSchema,
      body: { content: { "application/json": { schema: MintQrTokensRequestSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(MintQrTokensResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await offlineCheckInService.mintQrTokens(
      orgId,
      id,
      body.count,
      body.ttlSeconds,
    );
    return c.json(
      ok({ tokens: result.tokens, expiresAt: result.expiresAt.toISOString() }),
      200,
    );
  },
);

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/spots/{id}/manual-code:rotate",
    tags: [TAG],
    summary: "Rotate the manual staff code for a spot",
    request: { params: SpotIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ManualCodeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const r = await offlineCheckInService.rotateManualCode(orgId, id);
    return c.json(
      ok({ code: r.code, rotatesAt: r.rotatesAt.toISOString() }),
      200,
    );
  },
);

// ─── Progress queries ───────────────────────────────────────────

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/campaigns/{key}/progress",
    tags: [TAG],
    summary: "List per-user progress for a campaign",
    request: { params: CampaignKeyParamSchema, query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ProgressListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const page = await offlineCheckInService.listProgress({
      tenantId: orgId,
      campaignKey: key,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeProgress), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// ─── Admin check-in (operator-driven) ───────────────────────────

offlineCheckInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/campaigns/{key}/check-ins",
    tags: [TAG],
    summary:
      "Admin check-in for a specific end user. Same code path as the client endpoint.",
    request: {
      params: CampaignKeyParamSchema,
      body: { content: { "application/json": { schema: CheckInRequestSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CheckInResultSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await offlineCheckInService.checkIn({
      tenantId: orgId,
      campaignKey: key,
      endUserId: body.endUserId,
      spotAlias: body.spotAlias,
      lat: body.lat,
      lng: body.lng,
      accuracyM: body.accuracyM,
      qrToken: body.qrToken,
      manualCode: body.manualCode,
      mediaAssetId: body.mediaAssetId ?? null,
      deviceFingerprint: body.deviceFingerprint,
    });
    return c.json(
      ok({
        accepted: result.accepted,
        granted: result.granted,
        justCompleted: result.justCompleted,
        verifiedVia: result.verifiedVia,
        progress: serializeProgress(result.progress),
        distanceM: result.distanceM,
        rejectReason: result.rejectReason,
      }),
      200,
    );
  },
);
