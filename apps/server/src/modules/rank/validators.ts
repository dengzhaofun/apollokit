/**
 * Zod schemas for the rank module.
 *
 * Schema 同时用作 service 层输入校验与 HTTP Zod OpenAPI 校验。创建
 * 段位体系的 `CreateTierConfigSchema` 会一次性导入 N 个 tier，
 * `.superRefine` 验证 `order` 严格递增、大段之间不重叠、
 * subtierCount/starsPerSubtier ≥ 1 等。
 *
 * C 端接口使用 `.refine` 校验 `tierConfigAlias` 和 `seasonId` 至少
 * 提供一个（多套天梯定位要求）。
 */

import { z } from "@hono/zod-openapi";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { rankSeasons } from "../../schema/rank";
import {
  RATING_STRATEGIES,
  SEASON_STATUSES,
  TEAM_MODES,
} from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  });

const EloRatingParamsSchema = z.object({
  strategy: z.literal("elo"),
  baseK: z.number().positive().max(200),
  teamMode: z.enum(TEAM_MODES).default("avgTeamElo"),
  perfWeight: z.number().min(0).max(1).optional(),
  initialMmr: z.number().min(0).max(10_000).optional(),
});

const Glicko2RatingParamsSchema = z.object({
  strategy: z.literal("glicko2"),
  tau: z.number().positive().max(2),
  initialMmr: z.number().min(0).max(10_000).optional(),
  initialDeviation: z.number().positive().max(1000).optional(),
  initialVolatility: z.number().positive().max(1).optional(),
});

const RatingParamsSchema = z.discriminatedUnion("strategy", [
  EloRatingParamsSchema,
  Glicko2RatingParamsSchema,
]);

const TierProtectionRulesSchema = z
  .object({
    demotionShieldMatches: z.number().int().min(0).max(10).optional(),
    bigDropShields: z.number().int().min(0).max(10).optional(),
    winStreakBonusFrom: z.number().int().min(2).max(20).optional(),
  })
  .default({});

const TierInputSchema = z.object({
  alias: AliasSchema,
  name: z.string().min(1).max(100),
  order: z.number().int().min(0).max(100),
  minRankScore: z.number().int().min(0).max(1_000_000),
  maxRankScore: z.number().int().min(0).max(1_000_000).nullable().optional(),
  subtierCount: z.number().int().min(1).max(10).default(1),
  starsPerSubtier: z.number().int().min(1).max(20).default(5),
  protectionRules: TierProtectionRulesSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

function validateTiers(
  tiers: Array<z.input<typeof TierInputSchema>>,
  ctx: z.RefinementCtx,
) {
  if (tiers.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["tiers"],
      message: "at least one tier is required",
    });
    return;
  }
  const sorted = [...tiers]
    .map((t, idx) => ({ ...t, idx }))
    .sort((a, b) => a.order - b.order);
  const seenOrder = new Set<number>();
  const seenAlias = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (seenOrder.has(t.order)) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", t.idx, "order"],
        message: `duplicate tier order: ${t.order}`,
      });
    }
    seenOrder.add(t.order);
    if (seenAlias.has(t.alias)) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", t.idx, "alias"],
        message: `duplicate tier alias: ${t.alias}`,
      });
    }
    seenAlias.add(t.alias);

    const maxScore = t.maxRankScore ?? null;
    if (maxScore !== null && maxScore < t.minRankScore) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", t.idx, "maxRankScore"],
        message: "maxRankScore must be >= minRankScore",
      });
    }

    if (i > 0) {
      const prev = sorted[i - 1]!;
      const prevMax = prev.maxRankScore ?? null;
      // 大段间不重叠：prev.maxRankScore (若有) 必须 <= 当前 min
      if (prevMax !== null && prevMax > t.minRankScore) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", t.idx, "minRankScore"],
          message: `tier range overlaps with tier order=${prev.order} (max=${prevMax})`,
        });
      }
      // order 必须严格递增（已按 order 排序 + 查重，这里补一个连续性检查：不强制连续，但应至少递增）
      if (prev.order >= t.order) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", t.idx, "order"],
          message: "tiers must have strictly increasing order",
        });
      }
    }
  }
  // 顶段以外的段必须有 maxRankScore（否则会和后续段重叠 / 覆盖不了）
  for (let i = 0; i < sorted.length - 1; i++) {
    const t = sorted[i]!;
    if (t.maxRankScore === null || t.maxRankScore === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers", t.idx, "maxRankScore"],
        message: "only the top tier may have null maxRankScore",
      });
    }
  }
}

export const CreateTierConfigSchema = z
  .object({
    alias: AliasSchema.openapi({ example: "classic_5v5" }),
    name: z.string().min(1).max(200).openapi({ example: "经典 5v5 天梯" }),
    description: z.string().max(2000).nullable().optional(),
    ratingParams: RatingParamsSchema,
    tiers: z.array(TierInputSchema).min(1).max(20),
    isActive: z.boolean().default(true).optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => validateTiers(val.tiers, ctx))
  .openapi("RankCreateTierConfig");

export const UpdateTierConfigSchema = z
  .object({
    alias: AliasSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    ratingParams: RatingParamsSchema.optional(),
    tiers: z.array(TierInputSchema).min(1).max(20).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.tiers) validateTiers(val.tiers, ctx);
  })
  .openapi("RankUpdateTierConfig");

export type CreateTierConfigInput = z.input<typeof CreateTierConfigSchema>;
export type UpdateTierConfigInput = z.input<typeof UpdateTierConfigSchema>;

export const CreateSeasonSchema = z
  .object({
    alias: AliasSchema.openapi({ example: "s1" }),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    tierConfigId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    inheritanceRules: z
      .object({
        mode: z.enum(["decay", "softReset", "keep"]).optional(),
        decayFactor: z.number().min(0).max(1).optional(),
        baselineRankScore: z.number().int().min(0).max(1_000_000).optional(),
      })
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (new Date(val.startAt) >= new Date(val.endAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt must be strictly after startAt",
      });
    }
  })
  .openapi("RankCreateSeason");

export const UpdateSeasonSchema = z
  .object({
    alias: AliasSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    status: z.enum(SEASON_STATUSES).optional(),
    inheritanceRules: z
      .object({
        mode: z.enum(["decay", "softReset", "keep"]).optional(),
        decayFactor: z.number().min(0).max(1).optional(),
        baselineRankScore: z.number().int().min(0).max(1_000_000).optional(),
      })
      .nullable()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startAt && val.endAt) {
      if (new Date(val.startAt) >= new Date(val.endAt)) {
        ctx.addIssue({
          code: "custom",
          path: ["endAt"],
          message: "endAt must be strictly after startAt",
        });
      }
    }
  })
  .openapi("RankUpdateSeason");

export type CreateSeasonInput = z.input<typeof CreateSeasonSchema>;
export type UpdateSeasonInput = z.input<typeof UpdateSeasonSchema>;

/** 手动调整玩家段位（admin 路由用）*/
export const AdjustPlayerSchema = z
  .object({
    seasonId: z.string().uuid(),
    rankScore: z.number().int().optional(),
    mmr: z.number().optional(),
    tierId: z.string().uuid().nullable().optional(),
    subtier: z.number().int().min(0).max(20).optional(),
    stars: z.number().int().min(0).max(50).optional(),
    reason: z.string().min(1).max(500),
  })
  .superRefine((val, ctx) => {
    if (
      val.rankScore === undefined &&
      val.mmr === undefined &&
      val.tierId === undefined &&
      val.subtier === undefined &&
      val.stars === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "at least one of rankScore/mmr/tierId/subtier/stars required",
      });
    }
  })
  .openapi("RankAdjustPlayer");

export type AdjustPlayerInput = z.input<typeof AdjustPlayerSchema>;

/** C 端结算 body。`tierConfigAlias` 和 `seasonId` 二选一必填。*/
export const SettleMatchBodySchema = z
  .object({
    tierConfigAlias: AliasSchema.optional(),
    seasonId: z.string().uuid().optional(),
    externalMatchId: z.string().min(1).max(128),
    gameMode: z.string().min(1).max(32).optional(),
    settledAt: z.string().datetime().optional(),
    rawPayload: z.record(z.string(), z.unknown()).nullable().optional(),
    participants: z
      .array(
        z.object({
          endUserId: z.string().min(1).max(256),
          teamId: z.string().min(1).max(64),
          placement: z.number().int().min(1).max(100),
          win: z.boolean(),
          performanceScore: z.number().min(0).max(1).optional(),
        }),
      )
      .min(2)
      .max(100),
  })
  .superRefine((val, ctx) => {
    if (!val.tierConfigAlias && !val.seasonId) {
      ctx.addIssue({
        code: "custom",
        path: ["tierConfigAlias"],
        message: "one of tierConfigAlias or seasonId is required",
      });
    }
    const teams = new Set(val.participants.map((p) => p.teamId));
    if (teams.size < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "participants must belong to at least 2 distinct teams",
      });
    }
    const users = new Set(val.participants.map((p) => p.endUserId));
    if (users.size !== val.participants.length) {
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "duplicate endUserId in participants",
      });
    }
  })
  .openapi("RankSettleMatch");

export type SettleMatchInput = z.input<typeof SettleMatchBodySchema>;

/** 通用 C 端定位天梯的 query —— /state /history /leaderboard 复用 */
export const LadderLocatorQuerySchema = z
  .object({
    tierConfigAlias: AliasSchema.optional().openapi({
      param: { name: "tierConfigAlias", in: "query" },
    }),
    seasonId: z
      .string()
      .uuid()
      .optional()
      .openapi({ param: { name: "seasonId", in: "query" } }),
  })
  .superRefine((val, ctx) => {
    if (!val.tierConfigAlias && !val.seasonId) {
      ctx.addIssue({
        code: "custom",
        path: ["tierConfigAlias"],
        message: "one of tierConfigAlias or seasonId is required",
      });
    }
  });

const ladderLocatorRefine = (
  val: { tierConfigAlias?: string; seasonId?: string },
  ctx: z.RefinementCtx,
) => {
  if (!val.tierConfigAlias && !val.seasonId) {
    ctx.addIssue({
      code: "custom",
      path: ["tierConfigAlias"],
      message: "one of tierConfigAlias or seasonId is required",
    });
  }
};

// @hono/zod-openapi needs `ZodObject | ZodPipe` for request.query — we
// inline the locator fields instead of chaining via `.and()` (which
// produces `ZodIntersection`).
export const HistoryQuerySchema = z
  .object({
    tierConfigAlias: AliasSchema.optional().openapi({
      param: { name: "tierConfigAlias", in: "query" },
    }),
    seasonId: z
      .string()
      .uuid()
      .optional()
      .openapi({ param: { name: "seasonId", in: "query" } }),
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
  })
  .superRefine(ladderLocatorRefine);

export const LeaderboardQuerySchema = z
  .object({
    tierConfigAlias: AliasSchema.optional().openapi({
      param: { name: "tierConfigAlias", in: "query" },
    }),
    seasonId: z
      .string()
      .uuid()
      .optional()
      .openapi({ param: { name: "seasonId", in: "query" } }),
    tierId: z
      .string()
      .uuid()
      .optional()
      .openapi({ param: { name: "tierId", in: "query" } }),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .openapi({ param: { name: "limit", in: "query" } }),
    around: z
      .enum(["self"])
      .optional()
      .openapi({ param: { name: "around", in: "query" } }),
  })
  .superRefine(ladderLocatorRefine);

/** Path params */
export const TierConfigKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "tier config id or alias",
    }),
});

export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});

export const SeasonIdEndUserParamSchema = z.object({
  seasonId: z.string().uuid().openapi({ param: { name: "seasonId", in: "path" } }),
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .openapi({ param: { name: "endUserId", in: "path" } }),
});

export const rankSeasonFilters = defineListFilter({
  tierConfigId: f.uuid({ column: rankSeasons.tierConfigId }),
  status: f.enumOf(SEASON_STATUSES, { column: rankSeasons.status }),
})
  .search({ columns: [rankSeasons.name, rankSeasons.alias] })
  .build();

export const ListSeasonsQuerySchema = rankSeasonFilters.querySchema.openapi(
  "ListRankSeasonsQuery",
);

export const ListPlayersQuerySchema = z.object({
  tierId: z
    .string()
    .uuid()
    .optional()
    .openapi({ param: { name: "tierId", in: "query" } }),
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .openapi({ param: { name: "endUserId", in: "query" } }),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .openapi({ param: { name: "limit", in: "query" } }),
});

// ─── Response schemas ──────────────────────────────────────────────

const TierResponseSchema = z.object({
  id: z.string(),
  tierConfigId: z.string(),
  alias: z.string(),
  name: z.string(),
  order: z.number().int(),
  minRankScore: z.number().int(),
  maxRankScore: z.number().int().nullable(),
  subtierCount: z.number().int(),
  starsPerSubtier: z.number().int(),
  protectionRules: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export const RankTierConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    version: z.number().int(),
    isActive: z.boolean(),
    ratingParams: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tiers: z.array(TierResponseSchema),
  })
  .openapi("RankTierConfig");

export const RankTierConfigListResponseSchema = pageOf(RankTierConfigResponseSchema).openapi(
  "RankTierConfigList",
);

export const RankSeasonResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    tierConfigId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    startAt: z.string(),
    endAt: z.string(),
    status: z.enum(SEASON_STATUSES),
    inheritanceRules: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("RankSeason");

export const RankSeasonListResponseSchema = pageOf(RankSeasonResponseSchema).openapi(
  "RankSeasonList",
);

export const PlayerRankViewResponseSchema = z
  .object({
    seasonId: z.string(),
    endUserId: z.string(),
    rankScore: z.number().int(),
    mmr: z.number(),
    subtier: z.number().int(),
    stars: z.number().int(),
    winStreak: z.number().int(),
    lossStreak: z.number().int(),
    matchesPlayed: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    protectionUses: z.record(z.string(), z.number()),
    lastMatchAt: z.string().nullable(),
    tier: z
      .object({
        id: z.string(),
        alias: z.string(),
        name: z.string(),
        order: z.number().int(),
        subtierCount: z.number().int(),
        starsPerSubtier: z.number().int(),
      })
      .nullable(),
  })
  .openapi("RankPlayerView");

export const PlayerRankViewListResponseSchema = z
  .object({ items: z.array(PlayerRankViewResponseSchema) })
  .openapi("RankPlayerViewList");

export const RankFinalizeResponseSchema = z
  .object({ snapshotCount: z.number().int(), playerCount: z.number().int() })
  .openapi("RankFinalizeResult");

export const RankMatchSummarySchema = z.object({
  id: z.string(),
  externalMatchId: z.string(),
  gameMode: z.string().nullable(),
  teamCount: z.number().int(),
  totalParticipants: z.number().int(),
  settledAt: z.string(),
});

export const ParticipantDeltaResponseSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  endUserId: z.string(),
  teamId: z.string(),
  placement: z.number().int().nullable(),
  win: z.boolean(),
  mmrBefore: z.number(),
  mmrAfter: z.number(),
  rankScoreBefore: z.number().int(),
  rankScoreAfter: z.number().int(),
  starsDelta: z.number().int(),
  subtierBefore: z.number().int(),
  subtierAfter: z.number().int(),
  starsBefore: z.number().int(),
  starsAfter: z.number().int(),
  tierBeforeId: z.string().nullable(),
  tierAfterId: z.string().nullable(),
  promoted: z.boolean(),
  demoted: z.boolean(),
  protectionApplied: z.record(z.string(), z.unknown()).nullable(),
});

export const RankMatchListResponseSchema = z
  .object({
    items: z.array(RankMatchSummarySchema),
    nextCursor: z.string().optional(),
  })
  .openapi("RankMatchList");

export const RankMatchDetailResponseSchema = z
  .object({
    match: RankMatchSummarySchema,
    participants: z.array(ParticipantDeltaResponseSchema),
  })
  .openapi("RankMatchDetail");

const SettleParticipantDeltaSchema = z.object({
  endUserId: z.string(),
  teamId: z.string(),
  win: z.boolean(),
  mmrBefore: z.number(),
  mmrAfter: z.number(),
  rankScoreBefore: z.number().int(),
  rankScoreAfter: z.number().int(),
  starsDelta: z.number().int(),
  subtierBefore: z.number().int(),
  subtierAfter: z.number().int(),
  starsBefore: z.number().int(),
  starsAfter: z.number().int(),
  tierBeforeId: z.string().nullable(),
  tierAfterId: z.string().nullable(),
  promoted: z.boolean(),
  demoted: z.boolean(),
  protectionApplied: z
    .object({
      type: z.enum(["demotionShield", "bigDropShield"]),
      remaining: z.number().int(),
    })
    .nullable(),
});

export const RankSettleResponseSchema = z
  .object({
    matchId: z.string(),
    alreadySettled: z.boolean(),
    participants: z.array(SettleParticipantDeltaSchema),
  })
  .openapi("RankSettleResult");


/** 给 admin routes 用的 rating strategy enum */
export { RATING_STRATEGIES };
