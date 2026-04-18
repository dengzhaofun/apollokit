/**
 * Zod schemas for the leaderboard module.
 *
 * These schemas validate both service-layer inputs and HTTP request/
 * response bodies. `.openapi()` metadata is attached so Scalar auto-
 * renders fields in `/docs`.
 *
 * Reward tier validation: tiers within a single config must be disjoint
 * and cover consecutive ranks. The admin is permitted to leave gaps
 * (rank 11-100 may earn nothing) — we validate shape only, not coverage.
 */

import { z } from "@hono/zod-openapi";

import {
  AGGREGATION_MODES,
  CONFIG_STATUSES,
  CYCLE_MODES,
  SCOPE_MODES,
  TIE_BREAKERS,
} from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const RewardEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string().min(1),
  count: z.number().int().positive(),
});

const RewardTierSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  rewards: z.array(RewardEntrySchema).min(1),
});

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message:
      "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  });

const MetricKeySchema = z
  .string()
  .min(1)
  .max(64)
  .openapi({
    description:
      "Key that other modules `contribute()` against. Multiple configs may share a metric_key.",
    example: "pvp_score",
  });

const TimezoneSchema = z.string().min(1).max(64).default("UTC");

function validateTiers(
  tiers: Array<{ from: number; to: number }>,
  ctx: z.RefinementCtx,
) {
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (t.to < t.from) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardTiers", i, "to"],
        message: "tier.to must be >= tier.from",
      });
    }
  }
  const sorted = [...tiers]
    .map((t, idx) => ({ ...t, idx }))
    .sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.from <= prev.to) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardTiers", cur.idx, "from"],
        message: `tier overlaps with another: [${prev.from}-${prev.to}]`,
      });
    }
  }
}

export const CreateConfigSchema = z
  .object({
    alias: AliasSchema.openapi({ example: "pvp_score_weekly" }),
    name: z
      .string()
      .min(1)
      .max(200)
      .openapi({ example: "PVP Weekly Leaderboard" }),
    description: z.string().max(2000).nullable().optional(),
    metricKey: MetricKeySchema,
    cycle: z.enum(CYCLE_MODES),
    weekStartsOn: z.number().int().min(0).max(6).default(1).optional(),
    timezone: TimezoneSchema.optional(),
    scope: z.enum(SCOPE_MODES).default("global").optional(),
    aggregation: z.enum(AGGREGATION_MODES).default("sum").optional(),
    maxEntries: z.number().int().min(1).max(100_000).default(1000).optional(),
    tieBreaker: z.enum(TIE_BREAKERS).default("earliest").optional(),
    rewardTiers: z.array(RewardTierSchema).default([]).optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    status: z.enum(CONFIG_STATUSES).default("active").optional(),
    activityId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    validateTiers(val.rewardTiers ?? [], ctx);
  })
  .openapi("LeaderboardCreateConfig");

export const UpdateConfigSchema = z
  .object({
    alias: AliasSchema.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    metricKey: MetricKeySchema.optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    timezone: z.string().min(1).max(64).optional(),
    aggregation: z.enum(AGGREGATION_MODES).optional(),
    maxEntries: z.number().int().min(1).max(100_000).optional(),
    tieBreaker: z.enum(TIE_BREAKERS).optional(),
    rewardTiers: z.array(RewardTierSchema).optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    status: z.enum(CONFIG_STATUSES).optional(),
    activityId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.rewardTiers) validateTiers(val.rewardTiers, ctx);
  })
  .openapi("LeaderboardUpdateConfig");

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

export const ConfigKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Config id or alias.",
    }),
});

export const ConfigIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Config id.",
    }),
});

export const ContributeBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    metricKey: MetricKeySchema,
    value: z.number().finite(),
    scopeContext: z
      .object({
        guildId: z.string().min(1).max(256).optional(),
        teamId: z.string().min(1).max(256).optional(),
        friendOwnerIds: z
          .array(z.string().min(1).max(256))
          .max(1000)
          .optional(),
      })
      .optional(),
    activityContext: z
      .object({
        activityId: z.string().uuid(),
        nodeAlias: z.string().min(1).max(64).optional(),
      })
      .optional(),
    source: z.string().min(1).max(128).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    displaySnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("LeaderboardContribute");

export const TopQuerySchema = z.object({
  cycleKey: z
    .string()
    .min(1)
    .optional()
    .openapi({
      param: { name: "cycleKey", in: "query" },
      description: "Override the current cycleKey (e.g. for history).",
    }),
  scopeKey: z
    .string()
    .min(1)
    .optional()
    .openapi({
      param: { name: "scopeKey", in: "query" },
      description:
        "Defaults to organizationId for scope=global; required for guild/team/friend.",
    }),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .openapi({
      param: { name: "limit", in: "query" },
      description: "Top N to return. Clamped to [1, maxEntries].",
    }),
  endUserId: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .openapi({
      param: { name: "endUserId", in: "query" },
      description:
        "If set, include this user's current rank/score in the response.",
    }),
});

export const NeighborsQuerySchema = z.object({
  cycleKey: z.string().min(1).optional().openapi({
    param: { name: "cycleKey", in: "query" },
  }),
  scopeKey: z.string().min(1).optional().openapi({
    param: { name: "scopeKey", in: "query" },
  }),
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
  }),
  window: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((v) => (v ? Number(v) : 5))
    .openapi({
      param: { name: "window", in: "query" },
      description: "How many entries above AND below self to return.",
    }),
});

// ─── Response shapes ──────────────────────────────────────────────

const RewardTierResponseSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  rewards: z.array(RewardEntrySchema),
});

export const LeaderboardConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    metricKey: z.string(),
    cycle: z.enum(CYCLE_MODES),
    weekStartsOn: z.number().int(),
    timezone: z.string(),
    scope: z.enum(SCOPE_MODES),
    aggregation: z.enum(AGGREGATION_MODES),
    maxEntries: z.number().int(),
    tieBreaker: z.enum(TIE_BREAKERS),
    rewardTiers: z.array(RewardTierResponseSchema),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    status: z.enum(CONFIG_STATUSES),
    activityId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("LeaderboardConfig");

export const ConfigListResponseSchema = z
  .object({ items: z.array(LeaderboardConfigResponseSchema) })
  .openapi("LeaderboardConfigList");

const RankingSchema = z.object({
  rank: z.number().int(),
  endUserId: z.string(),
  score: z.number(),
  displaySnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TopResponseSchema = z
  .object({
    configId: z.string(),
    alias: z.string(),
    cycleKey: z.string(),
    scopeKey: z.string(),
    rankings: z.array(RankingSchema),
    self: z
      .object({
        rank: z.number().int().nullable(),
        score: z.number().nullable(),
      })
      .optional(),
  })
  .openapi("LeaderboardTop");

export const ContributeResponseSchema = z
  .object({
    applied: z.number().int(),
    details: z.array(
      z.object({
        configId: z.string(),
        alias: z.string(),
        scopeKey: z.string(),
        cycleKey: z.string(),
        newScore: z.number().nullable(),
        skipped: z
          .enum(["inactive", "time_window", "no_scope_key", "idempotent"])
          .optional(),
      }),
    ),
  })
  .openapi("LeaderboardContributeResult");

const SnapshotRowSchema = z.object({
  rank: z.number().int(),
  endUserId: z.string(),
  score: z.number(),
  displaySnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const SnapshotResponseSchema = z
  .object({
    id: z.string(),
    configId: z.string(),
    organizationId: z.string(),
    cycleKey: z.string(),
    scopeKey: z.string(),
    rankings: z.array(SnapshotRowSchema),
    rewardPlan: z.array(RewardTierResponseSchema),
    settledAt: z.string(),
  })
  .openapi("LeaderboardSnapshot");

export const SnapshotListResponseSchema = z
  .object({ items: z.array(SnapshotResponseSchema) })
  .openapi("LeaderboardSnapshotList");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("LeaderboardError");
