/**
 * Client routes for the offline-check-in module.
 *
 * Mounted at `/api/client/offline-check-in/*`. Auth pattern matches the
 * other client modules (invite / check-in):
 *   requireClientCredential — validates `cpk_…` x-api-key, populates orgId
 *   requireClientUser       — validates x-end-user-id + x-user-hash HMAC
 *
 * Surface:
 *   GET  /campaigns/{alias}            — campaign metadata + spots
 *   GET  /campaigns/{alias}/me         — my progress
 *   POST /campaigns/{alias}/check-in   — perform a check-in
 */

import { createClientRoute, createClientRouter } from "../../lib/openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getClientOrgId, getEndUserId } from "../../lib/route-context";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { offlineCheckInService } from "./index";
import {
  CampaignKeyParamSchema,
  CampaignResponseSchema,
  CheckInResultSchema,
  ClientCheckInRequestSchema,
  ProgressResponseSchema,
  SpotResponseSchema,
} from "./validators";
import type {
  OfflineCheckInCampaign,
  OfflineCheckInSpot,
  OfflineCheckInUserProgressRow,
} from "./types";
import { z } from "@hono/zod-openapi";

const TAG = "Offline Check-In (Client)";

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

export const offlineCheckInClientRouter = createClientRouter();

offlineCheckInClientRouter.use("*", requireClientCredential);
offlineCheckInClientRouter.use("*", requireClientUser);

const CampaignWithSpotsSchema = z
  .object({
    campaign: CampaignResponseSchema,
    spots: z.array(SpotResponseSchema),
  })
  .openapi("OfflineCheckInClientCampaign");

offlineCheckInClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/campaigns/{key}",
    tags: [TAG],
    summary: "Fetch a campaign + its spots (by id or alias)",
    request: { params: CampaignKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(CampaignWithSpotsSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getClientOrgId(c);
    const { key } = c.req.valid("param");
    const campaign = await offlineCheckInService.getCampaign(orgId, key);
    const spots = await offlineCheckInService.listSpots(orgId, key);
    return c.json(
      ok({
        campaign: serializeCampaign(campaign),
        spots: spots.map(serializeSpot),
      }),
      200,
    );
  },
);

offlineCheckInClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/campaigns/{key}/me",
    tags: [TAG],
    summary: "Get my progress for the campaign",
    request: { params: CampaignKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ProgressResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getClientOrgId(c);
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const progress = await offlineCheckInService.getProgress({
      tenantId: orgId,
      campaignKey: key,
      endUserId,
    });
    return c.json(ok(serializeProgress(progress)), 200);
  },
);

offlineCheckInClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/campaigns/{key}/check-in",
    tags: [TAG],
    summary: "Perform a check-in at one of the campaign's spots",
    request: {
      params: CampaignKeyParamSchema,
      body: { content: { "application/json": { schema: ClientCheckInRequestSchema } } },
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
    const orgId = getClientOrgId(c);
    const endUserId = getEndUserId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    // CF Workers expose the source country and a device-ish IP via cf-*
    // headers. We feed those into the log for anti-fraud forensics.
    const country = c.req.header("cf-ipcountry") ?? null;
    const ip = c.req.header("cf-connecting-ip") ?? null;
    const userAgent = c.req.header("user-agent") ?? null;
    const result = await offlineCheckInService.checkIn({
      tenantId: orgId,
      campaignKey: key,
      endUserId,
      spotAlias: body.spotAlias,
      lat: body.lat,
      lng: body.lng,
      accuracyM: body.accuracyM,
      qrToken: body.qrToken,
      manualCode: body.manualCode,
      mediaAssetId: body.mediaAssetId ?? null,
      deviceFingerprint: body.deviceFingerprint,
      ip: ip ?? undefined,
      country: country ?? undefined,
      userAgent: userAgent ?? undefined,
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
