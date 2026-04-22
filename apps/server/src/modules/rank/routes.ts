/**
 * Admin-facing HTTP routes for the rank module.
 *
 * Mounted at /api/rank. Guarded by `requireAdminOrApiKey` so both
 * session-cookie-authed dashboard users and server-to-server admin API
 * keys can drive CRUD. `organizationId` comes from
 * `c.var.session.activeOrganizationId` (synthesized by the guard for the
 * API-key path).
 *
 * Structure mirrors `announcement/routes.ts`: serialize → call service →
 * onError maps `ModuleError` to JSON with `{ error, code, requestId }`.
 */

import { z } from "@hono/zod-openapi";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { rankService } from "./index";
import type {
  RankMatch,
  RankMatchParticipant,
  RankSeason,
  RankTier,
  RankTierConfig,
} from "./types";
import {
  AdjustPlayerSchema,
  CreateSeasonSchema,
  CreateTierConfigSchema,
  IdParamSchema,
  ListPlayersQuerySchema,
  ListSeasonsQuerySchema,
  PlayerRankViewListResponseSchema,
  PlayerRankViewResponseSchema,
  RankFinalizeResponseSchema,
  RankMatchDetailResponseSchema,
  RankMatchListResponseSchema,
  RankSeasonListResponseSchema,
  RankSeasonResponseSchema,
  RankSettleResponseSchema,
  RankTierConfigListResponseSchema,
  RankTierConfigResponseSchema,
  SeasonIdEndUserParamSchema,
  SettleMatchBodySchema,
  TierConfigKeyParamSchema,
  UpdateSeasonSchema,
  UpdateTierConfigSchema,
} from "./validators";

const TAG = "Rank (Admin)";

function serializeTier(t: RankTier) {
  return {
    id: t.id,
    tierConfigId: t.tierConfigId,
    alias: t.alias,
    name: t.name,
    order: t.order,
    minRankScore: t.minRankScore,
    maxRankScore: t.maxRankScore,
    subtierCount: t.subtierCount,
    starsPerSubtier: t.starsPerSubtier,
    protectionRules: (t.protectionRules ?? {}) as Record<string, unknown>,
    metadata: (t.metadata ?? null) as Record<string, unknown> | null,
  };
}

function serializeTierConfig(input: { config: RankTierConfig; tiers: RankTier[] }) {
  const { config, tiers } = input;
  return {
    id: config.id,
    organizationId: config.organizationId,
    alias: config.alias,
    name: config.name,
    description: config.description,
    version: config.version,
    isActive: config.isActive,
    ratingParams: (config.ratingParams ?? {}) as Record<string, unknown>,
    metadata: (config.metadata ?? null) as Record<string, unknown> | null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
    tiers: tiers.map(serializeTier),
  };
}

function serializeSeason(row: RankSeason) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    tierConfigId: row.tierConfigId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    status: row.status as "upcoming" | "active" | "finished",
    inheritanceRules: (row.inheritanceRules ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMatch(row: RankMatch) {
  return {
    id: row.id,
    externalMatchId: row.externalMatchId,
    gameMode: row.gameMode,
    teamCount: row.teamCount,
    totalParticipants: row.totalParticipants,
    settledAt: row.settledAt.toISOString(),
  };
}

function serializeParticipant(row: RankMatchParticipant) {
  return {
    id: row.id,
    matchId: row.matchId,
    endUserId: row.endUserId,
    teamId: row.teamId,
    placement: row.placement,
    win: row.win,
    mmrBefore: row.mmrBefore,
    mmrAfter: row.mmrAfter,
    rankScoreBefore: row.rankScoreBefore,
    rankScoreAfter: row.rankScoreAfter,
    starsDelta: row.starsDelta,
    subtierBefore: row.subtierBefore,
    subtierAfter: row.subtierAfter,
    starsBefore: row.starsBefore,
    starsAfter: row.starsAfter,
    tierBeforeId: row.tierBeforeId,
    tierAfterId: row.tierAfterId,
    promoted: row.promoted,
    demoted: row.demoted,
    protectionApplied:
      (row.protectionApplied ?? null) as Record<string, unknown> | null,
  };
}

export const rankRouter = createAdminRouter();

rankRouter.use("*", requireAdminOrApiKey);

// ─── Settle match (server-to-server ingest) ─────────────────────

rankRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/settle",
    tags: [TAG],
    summary:
      "Settle a match from the tenant game server. Idempotent by (org, externalMatchId). " +
      "This is the server-to-server ingest endpoint — authorize via admin API key or dashboard session.",
    request: {
      body: {
        content: { "application/json": { schema: SettleMatchBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Settled (or alreadySettled=true on repeat).",
        content: {
          "application/json": { schema: envelopeOf(RankSettleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const reportedBy = c.var.user?.id ?? null;
    const result = await rankService.settleMatch({
      ...input,
      organizationId: orgId,
      ...(reportedBy ? { reportedBy } : {}),
    });
    return c.json(ok(result), 200);
  },
);

// ─── Tier configs ───────────────────────────────────────────────

rankRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/tier-configs",
    tags: [TAG],
    summary: "Create a tier config (ladder definition)",
    request: {
      body: {
        content: { "application/json": { schema: CreateTierConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(RankTierConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const result = await rankService.createTierConfig(orgId, input);
    return c.json(ok(serializeTierConfig(result)), 201);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/tier-configs",
    tags: [TAG],
    summary: "List tier configs",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankTierConfigListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await rankService.listTierConfigs(orgId);
    return c.json(ok({ items: rows.map(serializeTierConfig) }), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/tier-configs/{key}",
    tags: [TAG],
    summary: "Get a tier config by id or alias",
    request: { params: TierConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankTierConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const result = await rankService.getTierConfig(orgId, key);
    return c.json(ok(serializeTierConfig(result)), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/tier-configs/{key}",
    tags: [TAG],
    summary: "Update a tier config (full tier replacement on tiers[])",
    request: {
      params: TierConfigKeyParamSchema,
      body: {
        content: { "application/json": { schema: UpdateTierConfigSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankTierConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const input = c.req.valid("json");
    const result = await rankService.updateTierConfig(orgId, key, input);
    return c.json(ok(serializeTierConfig(result)), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/tier-configs/{id}",
    tags: [TAG],
    summary: "Delete a tier config",
    request: { params: IdParamSchema },
    responses: { 200: { description: "Deleted", content: { "application/json": { schema: NullDataEnvelopeSchema } } }, ...commonErrorResponses },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await rankService.deleteTierConfig(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Seasons ────────────────────────────────────────────────────

rankRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/seasons",
    tags: [TAG],
    summary: "Create a new season",
    request: {
      body: {
        content: { "application/json": { schema: CreateSeasonSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(RankSeasonResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const input = c.req.valid("json");
    const row = await rankService.createSeason(orgId, input);
    return c.json(ok(serializeSeason(row)), 201);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/seasons",
    tags: [TAG],
    summary: "List seasons (optionally filtered)",
    request: { query: ListSeasonsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankSeasonListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const filter = c.req.valid("query");
    const rows = await rankService.listSeasons(orgId, filter);
    return c.json(ok({ items: rows.map(serializeSeason) }), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/seasons/{id}",
    tags: [TAG],
    summary: "Get a season",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(RankSeasonResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await rankService.getSeason(orgId, id);
    return c.json(ok(serializeSeason(row)), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/seasons/{id}",
    tags: [TAG],
    summary: "Update a season",
    request: {
      params: IdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateSeasonSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(RankSeasonResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await rankService.updateSeason(orgId, id, input);
    return c.json(ok(serializeSeason(row)), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/seasons/{id}/activate",
    tags: [TAG],
    summary: "Activate a season (enforces single active per tierConfig)",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(RankSeasonResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await rankService.activateSeason(orgId, id);
    return c.json(ok(serializeSeason(row)), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/seasons/{id}/finalize",
    tags: [TAG],
    summary: "Finalize a season (writes snapshot rows, idempotent)",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankFinalizeResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const result = await rankService.finalizeSeason(orgId, id);
    return c.json(ok(result), 200);
  },
);

// ─── Player states ──────────────────────────────────────────────

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/seasons/{id}/players",
    tags: [TAG],
    summary: "List players in a season (sorted by rankScore desc)",
    request: {
      params: IdParamSchema,
      query: ListPlayersQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PlayerRankViewListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { tierId, endUserId, limit } = c.req.valid("query");
    const items = await rankService.listPlayerStates({
      organizationId: orgId,
      seasonId: id,
      tierId,
      endUserId,
      limit,
    });
    return c.json(ok({ items }), 200);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/seasons/{seasonId}/players/{endUserId}",
    tags: [TAG],
    summary: "Adjust a player state (manual audit-logged patch)",
    request: {
      params: SeasonIdEndUserParamSchema,
      body: {
        content: { "application/json": { schema: AdjustPlayerSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PlayerRankViewResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { endUserId } = c.req.valid("param");
    const input = c.req.valid("json");
    const view = await rankService.adjustPlayer(orgId, endUserId, input);
    return c.json(ok(view), 200);
  },
);

// ─── Matches (audit) ────────────────────────────────────────────

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/seasons/{id}/matches",
    tags: [TAG],
    summary: "List recent matches for a season (summary only)",
    request: {
      params: IdParamSchema,
      query: z.object({
        limit: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .transform((v) => (v ? Number(v) : undefined))
          .openapi({ param: { name: "limit", in: "query" } }),
        cursor: z
          .string()
          .min(1)
          .max(128)
          .optional()
          .openapi({ param: { name: "cursor", in: "query" } }),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankMatchListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { limit, cursor } = c.req.valid("query");
    const { items, nextCursor } = await rankService.listSeasonMatches({
      organizationId: orgId,
      seasonId: id,
      limit,
      cursor,
    });
    return c.json(ok({
        items: items.map(serializeMatch),
        nextCursor: nextCursor ?? undefined,
      }), 200,);
  },
);

rankRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/matches/{id}",
    tags: [TAG],
    summary: "Get a match with full participant deltas",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RankMatchDetailResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { match, participants } = await rankService.getMatch(orgId, id);
    return c.json(ok({
        match: serializeMatch(match),
        participants: participants.map(serializeParticipant),
      }), 200,);
  },
);
