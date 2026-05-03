/**
 * C-end client routes for the battle-pass (纪行) module.
 *
 * Auth pattern（同 check-in）:
 *   requireClientCredential — 验证 cpk_... 公钥，populate c.var.clientCredential
 *   requireClientUser       — 验证 HMAC，populate c.var.endUserId
 *
 * tenantId 从 clientCredential 里解出（不是 session）。
 */

import { z } from "@hono/zod-openapi";

import { createClientRoute, createClientRouter } from "../../lib/openapi";
import {
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { battlePassService } from "./index";
import type { BattlePassConfig } from "./types";
import {
  BattlePassAggregateViewSchema,
  BattlePassClaimResponseSchema,
  BattlePassConfigResponseSchema,
  ClaimLevelSchema,
  SeasonIdParamSchema,
} from "./validators";

const TAG = "Battle Pass (Client)";

function serializeConfig(row: BattlePassConfig) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    activityId: row.activityId,
    code: row.code,
    name: row.name,
    description: row.description,
    maxLevel: row.maxLevel,
    levelCurve: row.levelCurve,
    tiers: row.tiers,
    levelRewards: row.levelRewards,
    bonusMilestones: row.bonusMilestones,
    allowLevelPurchase: row.allowLevelPurchase,
    levelPurchasePriceSku: row.levelPurchasePriceSku,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveOrgId(c: {
  var: { clientCredential: { tenantId: string } | null };
}): string {
  const orgId = c.var.clientCredential?.tenantId;
  if (!orgId) {
    throw new Error("clientCredential missing tenantId");
  }
  return orgId;
}

export const battlePassClientRouter = createClientRouter();

battlePassClientRouter.use("*", requireClientCredential);
battlePassClientRouter.use("*", requireClientUser);

// GET /current — 当前开启的赛季（配置信息，不含玩家进度）
battlePassClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/current",
    tags: [TAG],
    summary: "Get the currently active battle-pass season (config only)",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassConfigResponseSchema.nullable()),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = resolveOrgId(c);
    const row = await battlePassService.getCurrentSeason(tenantId);
    return c.json(ok(row ? serializeConfig(row) : null), 200);
  },
);

// GET /:seasonId/aggregate — 我的聚合视图
battlePassClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/{seasonId}/aggregate",
    tags: [TAG],
    summary: "Get the authenticated end user's aggregate battle-pass view",
    request: {
      params: SeasonIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassAggregateViewSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = resolveOrgId(c);
    const endUserId = getEndUserId(c);
    const { seasonId } = c.req.valid("param");
    const view = await battlePassService.getAggregateView(
      tenantId,
      seasonId,
      endUserId,
    );
    return c.json(ok(view), 200);
  },
);

// POST /:seasonId/claim — 单领
battlePassClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/{seasonId}/claim",
    tags: [TAG],
    summary: "Claim a single level reward for the authenticated end user",
    request: {
      params: SeasonIdParamSchema,
      body: {
        content: { "application/json": { schema: ClaimLevelSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassClaimResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = resolveOrgId(c);
    const endUserId = getEndUserId(c);
    const { seasonId } = c.req.valid("param");
    const input = c.req.valid("json");
    const outcome = await battlePassService.claimLevel({
      tenantId,
      seasonId,
      endUserId,
      level: input.level,
      tierCode: input.tierCode,
    });
    return c.json(ok({ results: [outcome] }), 200);
  },
);

// POST /:seasonId/claim-all — 一键领
battlePassClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/{seasonId}/claim-all",
    tags: [TAG],
    summary: "Claim all available level rewards for the authenticated end user",
    request: {
      params: SeasonIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: z.object({}).openapi("BattlePassClaimAll"),
          },
        },
        required: false,
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassClaimResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = resolveOrgId(c);
    const endUserId = getEndUserId(c);
    const { seasonId } = c.req.valid("param");
    const results = await battlePassService.claimAll({
      tenantId,
      seasonId,
      endUserId,
    });
    return c.json(ok({ results }), 200);
  },
);
