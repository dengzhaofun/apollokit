/**
 * Admin-facing HTTP routes for the lottery module.
 */

import { createRoute } from "@hono/zod-openapi";

import { makeApiRouter } from "../../lib/router";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type { RewardEntry } from "../../lib/rewards";
import { lotteryService } from "./index";
import {
  CreatePoolSchema,
  UpdatePoolSchema,
  CreateTierSchema,
  UpdateTierSchema,
  CreatePrizeSchema,
  UpdatePrizeSchema,
  CreatePityRuleSchema,
  UpdatePityRuleSchema,
  PullSchema,
  MultiPullSchema,
  KeyParamSchema,
  IdParamSchema,
  PoolKeyParamSchema,
  TierIdParamSchema,
  PrizeIdParamSchema,
  RuleIdParamSchema,
  EndUserIdParamSchema,
  LotteryPoolResponseSchema,
  LotteryTierResponseSchema,
  LotteryPrizeResponseSchema,
  LotteryPityRuleResponseSchema,
  LotteryUserStateResponseSchema,
  PullResultResponseSchema,
  PoolListResponseSchema,
  TierListResponseSchema,
  PrizeListResponseSchema,
  PityRuleListResponseSchema,
  PullLogListResponseSchema,
} from "./validators";

const TAG_POOL = "Lottery Pools";
const TAG_TIER = "Lottery Tiers";
const TAG_PRIZE = "Lottery Prizes";
const TAG_PITY = "Lottery Pity Rules";
const TAG_PULL = "Lottery Pull";

// ─── Serializers ──────────────────────────────────────────────

function serializePool(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  description: string | null;
  costPerPull: RewardEntry[];
  isActive: boolean;
  startAt: Date | null;
  endAt: Date | null;
  globalPullLimit: number | null;
  globalPullCount: number;
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
    costPerPull: row.costPerPull,
    isActive: row.isActive,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    globalPullLimit: row.globalPullLimit,
    globalPullCount: row.globalPullCount,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeTier(row: {
  id: string;
  poolId: string;
  organizationId: string;
  name: string;
  alias: string | null;
  baseWeight: number;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    poolId: row.poolId,
    organizationId: row.organizationId,
    name: row.name,
    alias: row.alias,
    baseWeight: row.baseWeight,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePrize(row: {
  id: string;
  tierId: string | null;
  poolId: string;
  organizationId: string;
  name: string;
  description: string | null;
  rewardItems: RewardEntry[];
  weight: number;
  isRateUp: boolean;
  rateUpWeight: number;
  globalStockLimit: number | null;
  globalStockUsed: number;
  fallbackPrizeId: string | null;
  isActive: boolean;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tierId: row.tierId,
    poolId: row.poolId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    rewardItems: row.rewardItems,
    weight: row.weight,
    isRateUp: row.isRateUp,
    rateUpWeight: row.rateUpWeight,
    globalStockLimit: row.globalStockLimit,
    globalStockUsed: row.globalStockUsed,
    fallbackPrizeId: row.fallbackPrizeId,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePityRule(row: {
  id: string;
  poolId: string;
  organizationId: string;
  guaranteeTierId: string;
  hardPityThreshold: number;
  softPityStartAt: number | null;
  softPityWeightIncrement: number | null;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    poolId: row.poolId,
    organizationId: row.organizationId,
    guaranteeTierId: row.guaranteeTierId,
    hardPityThreshold: row.hardPityThreshold,
    softPityStartAt: row.softPityStartAt,
    softPityWeightIncrement: row.softPityWeightIncrement,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializePullLog(row: {
  id: string;
  poolId: string;
  endUserId: string;
  batchId: string;
  batchIndex: number;
  prizeId: string;
  tierId: string | null;
  tierName: string | null;
  prizeName: string;
  rewardItems: RewardEntry[];
  pityTriggered: boolean;
  pityRuleId: string | null;
  costItems: RewardEntry[];
  createdAt: Date;
}) {
  return {
    id: row.id,
    poolId: row.poolId,
    endUserId: row.endUserId,
    batchId: row.batchId,
    batchIndex: row.batchIndex,
    prizeId: row.prizeId,
    tierId: row.tierId,
    tierName: row.tierName,
    prizeName: row.prizeName,
    rewardItems: row.rewardItems,
    pityTriggered: row.pityTriggered,
    pityRuleId: row.pityRuleId,
    costItems: row.costItems,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Router ───────────────────────────────────────────────────

export const lotteryRouter = makeApiRouter();

lotteryRouter.use("*", requireAdminOrApiKey);

// ─── Pool routes ──────────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools",
    tags: [TAG_POOL],
    summary: "Create a lottery pool",
    request: {
      body: { content: { "application/json": { schema: CreatePoolSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(LotteryPoolResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await lotteryService.createPool(orgId, c.req.valid("json"));
    return c.json(ok(serializePool(row)), 201);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools",
    tags: [TAG_POOL],
    summary: "List lottery pools",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PoolListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const activityId = c.req.query("activityId") ?? undefined;
    const includeActivity = c.req.query("includeActivity") === "true";
    const rows = await lotteryService.listPools(orgId, {
      activityId,
      includeActivity,
    });
    return c.json(ok({ items: rows.map(serializePool) }), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{key}",
    tags: [TAG_POOL],
    summary: "Get a lottery pool by id or alias",
    request: { params: KeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(LotteryPoolResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await lotteryService.getPool(orgId, key);
    return c.json(ok(serializePool(row)), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "patch",
    path: "/pools/{id}",
    tags: [TAG_POOL],
    summary: "Update a lottery pool",
    request: {
      params: IdParamSchema,
      body: { content: { "application/json": { schema: UpdatePoolSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(LotteryPoolResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await lotteryService.updatePool(orgId, id, c.req.valid("json"));
    return c.json(ok(serializePool(row)), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "delete",
    path: "/pools/{id}",
    tags: [TAG_POOL],
    summary: "Delete a lottery pool (cascades)",
    request: { params: IdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await lotteryService.deletePool(orgId, id);
    return c.json(ok(null), 200);
  },
);

// ─── Tier routes ──────────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/tiers",
    tags: [TAG_TIER],
    summary: "Create a tier in a pool",
    request: {
      params: PoolKeyParamSchema,
      body: { content: { "application/json": { schema: CreateTierSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(LotteryTierResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const row = await lotteryService.createTier(
      orgId,
      poolKey,
      c.req.valid("json"),
    );
    return c.json(ok(serializeTier(row)), 201);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/tiers",
    tags: [TAG_TIER],
    summary: "List tiers for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TierListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const rows = await lotteryService.listTiers(orgId, poolKey);
    return c.json(ok({ items: rows.map(serializeTier) }), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "patch",
    path: "/tiers/{tierId}",
    tags: [TAG_TIER],
    summary: "Update a tier",
    request: {
      params: TierIdParamSchema,
      body: { content: { "application/json": { schema: UpdateTierSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(LotteryTierResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { tierId } = c.req.valid("param");
    const row = await lotteryService.updateTier(
      orgId,
      tierId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeTier(row)), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "delete",
    path: "/tiers/{tierId}",
    tags: [TAG_TIER],
    summary: "Delete a tier",
    request: { params: TierIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { tierId } = c.req.valid("param");
    await lotteryService.deleteTier(orgId, tierId);
    return c.json(ok(null), 200);
  },
);

// ─── Prize routes ─────────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/tiers/{tierId}/prizes",
    tags: [TAG_PRIZE],
    summary: "Create a prize under a tier",
    request: {
      params: PoolKeyParamSchema.merge(TierIdParamSchema),
      body: { content: { "application/json": { schema: CreatePrizeSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(LotteryPrizeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey, tierId } = c.req.valid("param");
    const row = await lotteryService.createPrize(
      orgId,
      poolKey,
      tierId,
      c.req.valid("json"),
    );
    return c.json(ok(serializePrize(row)), 201);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/prizes",
    tags: [TAG_PRIZE],
    summary: "Create a prize directly in a pool (flat mode, no tier)",
    request: {
      params: PoolKeyParamSchema,
      body: { content: { "application/json": { schema: CreatePrizeSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(LotteryPrizeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const row = await lotteryService.createPrize(
      orgId,
      poolKey,
      null,
      c.req.valid("json"),
    );
    return c.json(ok(serializePrize(row)), 201);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/prizes",
    tags: [TAG_PRIZE],
    summary: "List all prizes in a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PrizeListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const rows = await lotteryService.listPrizes(orgId, poolKey);
    return c.json(ok({ items: rows.map(serializePrize) }), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "patch",
    path: "/prizes/{prizeId}",
    tags: [TAG_PRIZE],
    summary: "Update a prize",
    request: {
      params: PrizeIdParamSchema,
      body: { content: { "application/json": { schema: UpdatePrizeSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(LotteryPrizeResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { prizeId } = c.req.valid("param");
    const row = await lotteryService.updatePrize(
      orgId,
      prizeId,
      c.req.valid("json"),
    );
    return c.json(ok(serializePrize(row)), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "delete",
    path: "/prizes/{prizeId}",
    tags: [TAG_PRIZE],
    summary: "Delete a prize",
    request: { params: PrizeIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { prizeId } = c.req.valid("param");
    await lotteryService.deletePrize(orgId, prizeId);
    return c.json(ok(null), 200);
  },
);

// ─── Pity Rule routes ─────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/pity-rules",
    tags: [TAG_PITY],
    summary: "Create a pity rule for a pool",
    request: {
      params: PoolKeyParamSchema,
      body: {
        content: { "application/json": { schema: CreatePityRuleSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(LotteryPityRuleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const row = await lotteryService.createPityRule(
      orgId,
      poolKey,
      c.req.valid("json"),
    );
    return c.json(ok(serializePityRule(row)), 201);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/pity-rules",
    tags: [TAG_PITY],
    summary: "List pity rules for a pool",
    request: { params: PoolKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(PityRuleListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const rows = await lotteryService.listPityRules(orgId, poolKey);
    return c.json(ok({ items: rows.map(serializePityRule) }), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "patch",
    path: "/pity-rules/{ruleId}",
    tags: [TAG_PITY],
    summary: "Update a pity rule",
    request: {
      params: RuleIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdatePityRuleSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(LotteryPityRuleResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { ruleId } = c.req.valid("param");
    const row = await lotteryService.updatePityRule(
      orgId,
      ruleId,
      c.req.valid("json"),
    );
    return c.json(ok(serializePityRule(row)), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "delete",
    path: "/pity-rules/{ruleId}",
    tags: [TAG_PITY],
    summary: "Delete a pity rule",
    request: { params: RuleIdParamSchema },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { ruleId } = c.req.valid("param");
    await lotteryService.deletePityRule(orgId, ruleId);
    return c.json(ok(null), 200);
  },
);

// ─── Pull execution ───────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/pull",
    tags: [TAG_PULL],
    summary: "Execute a single pull (admin)",
    request: {
      params: PoolKeyParamSchema,
      body: { content: { "application/json": { schema: PullSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PullResultResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const { endUserId, idempotencyKey } = c.req.valid("json");
    const result = await lotteryService.pull({
      organizationId: orgId,
      endUserId,
      poolKey,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "post",
    path: "/pools/{poolKey}/multi-pull",
    tags: [TAG_PULL],
    summary: "Execute multiple pulls (admin)",
    request: {
      params: PoolKeyParamSchema,
      body: { content: { "application/json": { schema: MultiPullSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PullResultResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const { endUserId, count, idempotencyKey } = c.req.valid("json");
    const result = await lotteryService.multiPull({
      organizationId: orgId,
      endUserId,
      poolKey,
      count,
      idempotencyKey,
    });
    return c.json(ok(result), 200);
  },
);

// ─── Query helpers ────────────────────────────────────────────

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/users/{endUserId}/state",
    tags: [TAG_PULL],
    summary: "Get user pity state for a pool",
    request: {
      params: PoolKeyParamSchema.merge(EndUserIdParamSchema),
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(LotteryUserStateResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const { endUserId } = c.req.valid("param");
    const state = await lotteryService.getUserState({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(ok(state), 200);
  },
);

lotteryRouter.openapi(
  createRoute({
    method: "get",
    path: "/pools/{poolKey}/users/{endUserId}/history",
    tags: [TAG_PULL],
    summary: "Get pull history for a user in a pool",
    request: {
      params: PoolKeyParamSchema.merge(EndUserIdParamSchema),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(PullLogListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { poolKey } = c.req.valid("param");
    const { endUserId } = c.req.valid("param");
    const rows = await lotteryService.getPullHistory({
      organizationId: orgId,
      endUserId,
      poolKey,
    });
    return c.json(ok({ items: rows.map(serializePullLog) }), 200);
  },
);
