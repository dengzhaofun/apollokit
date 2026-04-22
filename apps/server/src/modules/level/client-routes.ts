/**
 * C-end client routes for the level module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId
 * from c.var.endUserId!. No inline verifyRequest calls; no auth fields in body or query.
 *
 * Exposed surface:
 *   POST /configs                          → config list + per-user summary
 *   POST /configs/:key/overview            → full config detail with progress
 *   POST /levels/:id/detail                → single level detail
 *   POST /levels/:id/clear                 → report level clear
 *   POST /levels/:id/claim                 → claim rewards
 *
 * No CRUD is exposed on the client side; configuration lives in the
 * admin routes only.
 */


import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { levelService } from "./index";
import {
  ClientConfigListResponseSchema,
  ClientConfigOverviewSchema,
  ClaimRewardsBodySchema,
  ClaimRewardsResponseSchema,
  ConfigKeyParamSchema,
  ErrorResponseSchema,
  LevelIdParamSchema,
  ReportClearBodySchema,
  ReportClearResponseSchema,
} from "./validators";
import type { StarRewardTier } from "./types";

const TAG = "Level (Client)";

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  403: {
    description: "Forbidden",
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

// ─── Serialization helpers ──────────────────────────────────────

function serializeConfig(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  coverImage: string | null;
  icon: string | null;
  hasStages: boolean;
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
    hasStages: row.hasStages,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Convert the service's numeric `starRewardsClaimed` (highest tier claimed)
 * into the array of star counts the schema expects.
 */
function expandStarRewardsClaimed(
  highestClaimed: number,
  starRewards: StarRewardTier[] | null,
): number[] {
  if (!starRewards || highestClaimed <= 0) return [];
  return starRewards
    .filter((t) => t.stars <= highestClaimed)
    .map((t) => t.stars);
}

/**
 * Map a service-returned level view to the shape ClientLevelViewSchema expects.
 */
function toLevelView(
  lv: {
    id: string;
    configId: string;
    stageId: string | null;
    alias: string | null;
    name: string;
    description: string | null;
    icon: string | null;
    difficulty: string | null;
    maxStars: number;
    sortOrder: number;
    unlocked: boolean;
    status: "unlocked" | "cleared" | null;
    stars: number;
    bestScore: number | null;
    rewardsClaimed: boolean;
    starRewardsClaimed: number;
    isActive?: boolean;
  },
  level?: { clearRewards: unknown; starRewards: unknown },
) {
  const starRewards = (level?.starRewards ?? null) as StarRewardTier[] | null;
  return {
    id: lv.id,
    configId: lv.configId,
    stageId: lv.stageId,
    alias: lv.alias,
    name: lv.name,
    description: lv.description,
    icon: lv.icon,
    difficulty: lv.difficulty,
    maxStars: lv.maxStars,
    sortOrder: lv.sortOrder,
    unlocked: lv.unlocked,
    status: lv.status,
    stars: lv.stars,
    bestScore: lv.bestScore,
    rewardsClaimed: lv.rewardsClaimed,
    starRewardsClaimed: expandStarRewardsClaimed(
      lv.starRewardsClaimed,
      starRewards,
    ),
    clearRewards: (level?.clearRewards ?? null) as
      | Array<{ type: "item" | "entity" | "currency"; id: string; count: number }>
      | null,
    starRewards,
  };
}

// ─── Client-level detail response schema ────────────────────────

const ClientLevelDetailSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    stageId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    difficulty: z.string().nullable(),
    maxStars: z.number().int(),
    sortOrder: z.number().int(),
    unlocked: z.boolean(),
    status: z.string().nullable(),
    stars: z.number().int(),
    bestScore: z.number().int().nullable(),
    attempts: z.number().int(),
    rewardsClaimed: z.boolean(),
    starRewardsClaimed: z.array(z.number().int()),
    clearRewards: z.array(z.object({
      type: z.enum(["item", "entity", "currency"]),
      id: z.string(),
      count: z.number().int().positive(),
    })).nullable(),
    starRewards: z.array(z.object({
      stars: z.number().int().min(1),
      rewards: z.array(z.object({
        type: z.enum(["item", "entity", "currency"]),
        id: z.string(),
        count: z.number().int().positive(),
      })).min(1),
    })).nullable(),
  })
  .openapi("LevelClientLevelDetail");

// ─── Router ─────────────────────────────────────────────────────

export const levelClientRouter = createClientRouter();

levelClientRouter.use("*", requireClientCredential);
levelClientRouter.use("*", requireClientUser);

levelClientRouter.onError((err, c) => {
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

// ─── Config list (per-user summary) ─────────────────────────────

levelClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "List configs with per-user progress summary",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClientConfigListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const configs = await levelService.listConfigs(orgId);

    // Build per-user summaries by fetching overview for each config
    const items = await Promise.all(
      configs
        .filter((cfg) => cfg.isActive)
        .map(async (cfg) => {
          const overview = await levelService.getConfigOverview(
            orgId,
            endUserId,
            cfg.id,
          );
          return {
            config: serializeConfig(cfg),
            levelCount: overview.totals.totalLevels,
            clearedCount: overview.totals.clearedLevels,
            totalStars: overview.totals.totalStars,
          };
        }),
    );

    return c.json({ items }, 200);
  },
);

// ─── Config overview (full detail with progress) ────────────────

levelClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/configs/{key}/overview",
    tags: [TAG],
    summary: "Full config detail — levels, stages, per-user progress",
    request: {
      params: ConfigKeyParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClientConfigOverviewSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { key } = c.req.valid("param");
    const overview = await levelService.getConfigOverview(
      orgId,
      endUserId,
      key,
    );

    // Fetch all levels for reward data (the overview doesn't include reward details)
    const allLevels = await levelService.listLevels(
      orgId,
      overview.config.id,
    );
    const levelMap = new Map(allLevels.map((l) => [l.id, l]));

    // Build level views with reward data
    const levelViews = overview.levels.map((lv) =>
      toLevelView(
        { ...lv, status: lv.status as "unlocked" | "cleared" | null },
        levelMap.get(lv.id),
      ),
    );

    // Group levels by stage for stage views
    const stageViews = overview.stages.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      sortOrder: s.sortOrder,
      unlocked: s.unlocked,
      levels: levelViews.filter((lv) => lv.stageId === s.id),
    }));

    // Compute maxPossibleStars
    const maxPossibleStars = allLevels.reduce(
      (sum, l) => sum + l.maxStars,
      0,
    );

    return c.json(
      {
        config: serializeConfig(overview.config),
        stages: stageViews,
        levels: levelViews,
        totals: {
          levelCount: overview.totals.totalLevels,
          clearedCount: overview.totals.clearedLevels,
          totalStars: overview.totals.totalStars,
          maxPossibleStars,
        },
      },
      200,
    );
  },
);

// ─── Level detail ───────────────────────────────────────────────

levelClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/levels/{id}/detail",
    tags: [TAG],
    summary: "Single level detail with unlock status and progress",
    request: {
      params: LevelIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClientLevelDetailSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const detail = await levelService.getLevelDetail(orgId, endUserId, id);

    const starRewards =
      (detail.level.starRewards as StarRewardTier[] | null) ?? [];
    const highestClaimed = detail.progress?.starRewardsClaimed ?? 0;

    return c.json(
      {
        id: detail.level.id,
        configId: detail.level.configId,
        stageId: detail.level.stageId,
        alias: detail.level.alias,
        name: detail.level.name,
        description: detail.level.description,
        icon: detail.level.icon,
        difficulty: detail.level.difficulty,
        maxStars: detail.level.maxStars,
        sortOrder: detail.level.sortOrder,
        unlocked: detail.unlocked,
        status: (detail.progress?.status ?? null) as "unlocked" | "cleared" | null,
        stars: detail.progress?.stars ?? 0,
        bestScore: detail.progress?.bestScore ?? null,
        attempts: detail.progress?.attempts ?? 0,
        rewardsClaimed: detail.progress?.rewardsClaimed ?? false,
        starRewardsClaimed: expandStarRewardsClaimed(
          highestClaimed,
          starRewards,
        ),
        clearRewards:
          (detail.level.clearRewards as Array<{
            type: "item" | "entity" | "currency";
            id: string;
            count: number;
          }>) ?? null,
        starRewards: starRewards.length > 0 ? starRewards : null,
      },
      200,
    );
  },
);

// ─── Report level clear ─────────────────────────────────────────

levelClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/levels/{id}/clear",
    tags: [TAG],
    summary: "Report a level clear with stars and optional score",
    request: {
      params: LevelIdParamSchema,
      body: {
        content: {
          "application/json": { schema: ReportClearBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ReportClearResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { stars, score } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const result = await levelService.reportClear(orgId, endUserId, id, {
      stars: stars ?? 0,
      score: score ?? null,
    });

    return c.json(
      {
        levelId: result.levelId,
        stars: result.stars,
        bestScore: result.bestScore,
        firstClear: result.firstClear,
        newlyUnlocked: result.newlyUnlocked,
      },
      200,
    );
  },
);

// ─── Claim rewards ──────────────────────────────────────────────

levelClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/levels/{id}/claim",
    tags: [TAG],
    summary: "Claim clear rewards or a star reward tier",
    request: {
      params: LevelIdParamSchema,
      body: {
        content: {
          "application/json": { schema: ClaimRewardsBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ClaimRewardsResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { type, starTier } = c.req.valid("json");
    const { id } = c.req.valid("param");

    const input =
      type === "star"
        ? { type: "star" as const, starTier: starTier! }
        : { type: "clear" as const };

    const result = await levelService.claimRewards(
      orgId,
      endUserId,
      id,
      input,
    );

    return c.json(
      {
        levelId: result.levelId,
        type: result.type,
        grantedRewards: result.grantedRewards,
        claimedAt: result.claimedAt,
      },
      200,
    );
  },
);
