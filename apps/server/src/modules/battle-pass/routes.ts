/**
 * Admin-facing HTTP routes for the battle-pass (纪行) module.
 *
 * 所有路由走 `requireAdminOrApiKey`，下游可安全读
 * `getOrgId(c)`。
 *
 * C-end 玩家路由在 `client-routes.ts`。
 */

import { createAdminRoute, createAdminRouter } from "../../lib/openapi";
import {
  NullDataEnvelopeSchema,
  commonErrorResponses,
  envelopeOf,
  ok,
} from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
import { battlePassService } from "./index";
import type { BattlePassConfig } from "./types";
import {
  AdminAggregateQuerySchema,
  BattlePassAggregateViewSchema,
  BattlePassConfigListSchema,
  BattlePassConfigResponseSchema,
  BattlePassGrantTierOutcomeSchema,
  BattlePassSeasonTaskListSchema,
  BindTasksSchema,
  ConfigIdParamSchema,
  CreateConfigSchema,
  GrantTierSchema,
  SeasonIdParamSchema,
  UpdateConfigSchema,
} from "./validators";

const TAG = "Battle Pass";

function serializeConfig(row: BattlePassConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
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

export const battlePassRouter = createAdminRouter();

battlePassRouter.use("*", requireAdminOrApiKey);
battlePassRouter.use("*", requireOrgManage);

// POST /configs
battlePassRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a battle-pass (season pass) config",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassConfigResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const input = c.req.valid("json");
    const row = await battlePassService.createConfig(organizationId, input);
    return c.json(ok(serializeConfig(row)), 201);
  },
);

// GET /configs
battlePassRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List battle-pass configs in the current project",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassConfigListSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const rows = await battlePassService.listConfigs(organizationId);
    return c.json(
      ok({ items: rows.map(serializeConfig) }),
      200,
    );
  },
);

// GET /configs/:id
battlePassRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Get a battle-pass config",
    request: {
      params: ConfigIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassConfigResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await battlePassService.getConfig(organizationId, id);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// PUT /configs/:id
battlePassRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update a battle-pass config",
    request: {
      params: ConfigIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateConfigSchema } },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassConfigResponseSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await battlePassService.updateConfig(
      organizationId,
      id,
      input,
    );
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// DELETE /configs/:id
battlePassRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete a battle-pass config",
    request: {
      params: ConfigIdParamSchema,
    },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { id } = c.req.valid("param");
    await battlePassService.deleteConfig(organizationId, id);
    return c.json(ok(null), 200);
  },
);

// POST /configs/:id/bind-tasks
battlePassRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{id}/bind-tasks",
    tags: [TAG],
    summary: "Replace the task bindings for a battle-pass season",
    request: {
      params: ConfigIdParamSchema,
      body: {
        content: { "application/json": { schema: BindTasksSchema } },
      },
    },
    responses: {
      200: {
        description: "Bindings updated",
        content: { "application/json": { schema: NullDataEnvelopeSchema } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    await battlePassService.bindTasks(organizationId, id, input);
    return c.json(ok(null), 200);
  },
);

// GET /configs/:id/tasks
battlePassRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{id}/tasks",
    tags: [TAG],
    summary: "List tasks bound to a battle-pass season",
    request: {
      params: ConfigIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassSeasonTaskListSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { id } = c.req.valid("param");
    const rows = await battlePassService.listSeasonTasks(organizationId, id);
    return c.json(
      ok({
        items: rows.map((r) => ({
          id: r.id,
          seasonId: r.seasonId,
          taskDefinitionId: r.taskDefinitionId,
          xpReward: r.xpReward,
          category: r.category as
            | "daily"
            | "weekly"
            | "season"
            | "event",
          weekIndex: r.weekIndex,
          sortOrder: r.sortOrder,
        })),
      }),
      200,
    );
  },
);

// POST /:seasonId/grant-tier
battlePassRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/{seasonId}/grant-tier",
    tags: [TAG],
    summary: "Activate a paid tier for an end user (payment callback / admin)",
    request: {
      params: SeasonIdParamSchema,
      body: {
        content: { "application/json": { schema: GrantTierSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: envelopeOf(BattlePassGrantTierOutcomeSchema),
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const organizationId = getOrgId(c);
    const { seasonId } = c.req.valid("param");
    const input = c.req.valid("json");
    const outcome = await battlePassService.grantTier({
      organizationId,
      seasonId,
      endUserId: input.endUserId,
      tierCode: input.tierCode,
      source: input.source,
      externalOrderId: input.externalOrderId ?? null,
    });
    return c.json(ok(outcome), 200);
  },
);

// GET /:seasonId/aggregate?endUserId=...
battlePassRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/{seasonId}/aggregate",
    tags: [TAG],
    summary:
      "Admin view of an end user's battle-pass aggregate state for debugging",
    request: {
      params: SeasonIdParamSchema,
      query: AdminAggregateQuerySchema,
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
    const organizationId = getOrgId(c);
    const { seasonId } = c.req.valid("param");
    const { endUserId } = c.req.valid("query");
    const view = await battlePassService.getAggregateView(
      organizationId,
      seasonId,
      endUserId,
    );
    return c.json(ok(view), 200);
  },
);
