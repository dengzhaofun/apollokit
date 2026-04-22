/**
 * Admin-facing HTTP routes for the leaderboard module.
 *
 * Client-facing (game-frontend) routes are intentionally not included
 * in this MVP — the plan calls for them in a follow-up phase once
 * client credential middleware is wired to leaderboards. Admins and
 * ops-side tooling can already exercise everything through these
 * routes.
 */

import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import type {
  LeaderboardConfig,
  LeaderboardRewardTier,
} from "./types";
import { ModuleError } from "./errors";
import { leaderboardService } from "./index";
import {
  ConfigIdParamSchema,
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  ContributeBodySchema,
  ContributeResponseSchema,
  CreateConfigSchema,
  ErrorResponseSchema,
  LeaderboardConfigResponseSchema,
  NeighborsQuerySchema,
  SnapshotListResponseSchema,
  TopQuerySchema,
  TopResponseSchema,
  UpdateConfigSchema,
} from "./validators";

const TAG = "Leaderboard";

function serializeConfig(row: LeaderboardConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    metricKey: row.metricKey,
    cycle: row.cycle as "daily" | "weekly" | "monthly" | "all_time",
    weekStartsOn: row.weekStartsOn,
    timezone: row.timezone,
    scope: row.scope as "global" | "guild" | "team" | "friend",
    aggregation: row.aggregation as "sum" | "max" | "latest",
    maxEntries: row.maxEntries,
    tieBreaker: row.tieBreaker as "earliest" | "latest",
    rewardTiers: (row.rewardTiers ?? []) as LeaderboardRewardTier[],
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    status: row.status as "draft" | "active" | "paused" | "archived",
    activityId: row.activityId,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "Unauthorized",
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

export const leaderboardRouter = createAdminRouter();

leaderboardRouter.use("*", requireAdminOrApiKey);

leaderboardRouter.onError((err, c) => {
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

// POST /leaderboard/configs
leaderboardRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a leaderboard config for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: LeaderboardConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await leaderboardService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

// GET /leaderboard/configs
leaderboardRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List leaderboard configs for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ConfigListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await leaderboardService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

// GET /leaderboard/configs/:key
leaderboardRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a leaderboard config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: LeaderboardConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await leaderboardService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

// PATCH /leaderboard/configs/:id
leaderboardRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update a leaderboard config",
    request: {
      params: ConfigIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateConfigSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: LeaderboardConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await leaderboardService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeConfig(row), 200);
  },
);

// DELETE /leaderboard/configs/:id
leaderboardRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary:
      "Delete a leaderboard config (cascades to entries/snapshots/claims)",
    request: { params: ConfigIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await leaderboardService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// POST /leaderboard/contribute — fan-out score update
leaderboardRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/contribute",
    tags: [TAG],
    summary:
      "Report a metric contribution. Fans out to all active configs matching the metricKey.",
    request: {
      body: {
        content: { "application/json": { schema: ContributeBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ContributeResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const result = await leaderboardService.contribute({
      organizationId: orgId,
      endUserId: body.endUserId,
      metricKey: body.metricKey,
      value: body.value,
      scopeContext: body.scopeContext,
      activityContext: body.activityContext,
      source: body.source,
      idempotencyKey: body.idempotencyKey,
      displaySnapshot: body.displaySnapshot,
    });
    return c.json(result, 200);
  },
);

// GET /leaderboard/configs/:key/top
leaderboardRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/top",
    tags: [TAG],
    summary: "Top N entries in the current (or specified) cycle bucket",
    request: {
      params: ConfigKeyParamSchema,
      query: TopQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TopResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const result = await leaderboardService.getTop({
      organizationId: orgId,
      configKey: key,
      cycleKey: q.cycleKey,
      scopeKey: q.scopeKey,
      limit: q.limit,
      endUserId: q.endUserId,
    });
    return c.json(result, 200);
  },
);

// GET /leaderboard/configs/:key/neighbors
leaderboardRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/neighbors",
    tags: [TAG],
    summary:
      "Return a window of entries around the given endUserId (±window).",
    request: {
      params: ConfigKeyParamSchema,
      query: NeighborsQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TopResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const result = await leaderboardService.getNeighbors({
      organizationId: orgId,
      configKey: key,
      endUserId: q.endUserId,
      cycleKey: q.cycleKey,
      scopeKey: q.scopeKey,
      window: q.window,
    });
    return c.json(result, 200);
  },
);

// GET /leaderboard/configs/:key/snapshots
leaderboardRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/snapshots",
    tags: [TAG],
    summary: "List settled snapshots for a leaderboard config",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: SnapshotListResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const rows = await leaderboardService.listSnapshots({
      organizationId: orgId,
      configKey: key,
    });
    return c.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          configId: r.configId,
          organizationId: r.organizationId,
          cycleKey: r.cycleKey,
          scopeKey: r.scopeKey,
          rankings: r.rankings,
          rewardPlan: r.rewardPlan,
          settledAt: r.settledAt.toISOString(),
        })),
      },
      200,
    );
  },
);

// POST /leaderboard/settle/run — manual trigger for ops/backfill
leaderboardRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/settle/run",
    tags: [TAG],
    summary:
      "Manually run settleDue. Useful for ops backfill after cron outages.",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: z
              .object({
                settled: z.number().int(),
                errors: z.number().int(),
              })
              .openapi("LeaderboardSettleRunResult"),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const result = await leaderboardService.settleDue({});
    return c.json(result, 200);
  },
);
