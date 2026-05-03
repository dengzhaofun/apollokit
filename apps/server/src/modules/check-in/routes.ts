/**
 * Admin-facing HTTP routes for the check-in module.
 *
 * This is the ONLY file in the module that knows about Hono. It translates
 * Zod-validated inputs into service calls and maps typed errors onto HTTP
 * responses. No business logic lives here.
 *
 * Every route is guarded by `requireAdminOrApiKey` — accepts either a
 * valid Better Auth session or an admin API key (ak_). Downstream handlers
 * can safely read `getOrgId(c)` without null checks.
 *
 * C-end (client) routes live in `client-routes.ts` under a separate base
 * path with client credential + HMAC auth.
 */

import { z } from "@hono/zod-openapi";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import type { RewardEntry } from "../../lib/rewards";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { checkInService } from "./index";
import {
  CheckInBodySchema,
  CheckInConfigResponseSchema,
  CheckInResultSchema,
  CheckInRewardResponseSchema,
  CheckInUserStateViewSchema,
  ConfigIdParamSchema,
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  CreateConfigSchema,
  CreateRewardSchema,
  ResetUserStateResponseSchema,
  RewardIdParamSchema,
  RewardListResponseSchema,
  UpdateConfigSchema,
  UpdateRewardSchema,
  UserStateListResponseSchema,
  UserStateParamSchema,
} from "./validators";

const TAG = "Check-In";

/**
 * Serialize a Drizzle row to a JSON-friendly shape. Drizzle's `jsonb` column
 * comes back already-parsed, and `timestamp` columns come back as `Date` —
 * we convert to ISO strings so the OpenAPI schema (which declares `string`)
 * is honest and the wire format is stable.
 */
function serializeConfig(row: {
  id: string;
  tenantId: string;
  alias: string | null;
  name: string;
  description: string | null;
  resetMode: string;
  weekStartsOn: number;
  target: number | null;
  timezone: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    resetMode: row.resetMode as "none" | "week" | "month",
    weekStartsOn: row.weekStartsOn,
    target: row.target,
    timezone: row.timezone,
    isActive: row.isActive,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeState(row: {
  configId: string;
  endUserId: string;
  tenantId: string;
  totalDays: number;
  currentStreak: number;
  longestStreak: number;
  currentCycleKey: string | null;
  currentCycleDays: number;
  lastCheckInDate: string | null;
  firstCheckInAt: Date | null;
  lastCheckInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    configId: row.configId,
    endUserId: row.endUserId,
    tenantId: row.tenantId,
    totalDays: row.totalDays,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    currentCycleKey: row.currentCycleKey,
    currentCycleDays: row.currentCycleDays,
    lastCheckInDate: row.lastCheckInDate,
    firstCheckInAt: row.firstCheckInAt?.toISOString() ?? null,
    lastCheckInAt: row.lastCheckInAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const checkInRouter = createAdminRouter();

checkInRouter.use("*", requireAdminOrApiKey);
checkInRouter.use("*", requirePermissionByMethod("checkIn"));

// POST /check-in/configs — create
checkInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a check-in config for the current project",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CheckInConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await checkInService.createConfig(orgId, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 201);
  },
);

// GET /check-in/configs — list
checkInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary:
      "List check-in configs. Default filters out activity-scoped configs so the permanent list isn't polluted.",
    request: {
      query: z.object({
        activityId: z
          .string()
          .uuid()
          .optional()
          .openapi({ param: { name: "activityId", in: "query" } }),
        includeActivity: z
          .enum(["true", "false"])
          .optional()
          .openapi({ param: { name: "includeActivity", in: "query" } }),
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
        content: { "application/json": { schema: envelopeOf(ConfigListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await checkInService.listConfigs(orgId, {
      activityId: q.activityId,
      includeActivity: q.includeActivity === "true",
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeConfig), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// GET /check-in/configs/:key — by id or alias
checkInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a check-in config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CheckInConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await checkInService.getConfig(orgId, key);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// PATCH /check-in/configs/:id — update
checkInRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update a check-in config",
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
          "application/json": { schema: envelopeOf(CheckInConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await checkInService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// DELETE /check-in/configs/:id
checkInRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete a check-in config (cascades to user states)",
    request: { params: ConfigIdParamSchema },
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
    await checkInService.deleteConfig(orgId, id);
    return c.json(ok(null), 200);
  },
);

// GET /check-in/configs/:key/users — list user states (paginated)
checkInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/users",
    tags: [TAG],
    summary: "List all user states for a check-in config",
    request: { params: ConfigKeyParamSchema, query: PaginationQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(UserStateListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const page = await checkInService.listUserStates({
      tenantId: orgId,
      configKey: key,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeState), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// POST /check-in/configs/:key/check-ins — perform a check-in
checkInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{key}/check-ins",
    tags: [TAG],
    summary: "Check in an end user against this config",
    request: {
      params: ConfigKeyParamSchema,
      body: {
        content: { "application/json": { schema: CheckInBodySchema } },
      },
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
    const { endUserId } = c.req.valid("json");
    const result = await checkInService.checkIn({
      tenantId: orgId,
      configKey: key,
      endUserId,
    });
    return c.json(ok({
        alreadyCheckedIn: result.alreadyCheckedIn,
        justCompleted: result.justCompleted,
        state: serializeState(result.state),
        target: result.target,
        isCompleted: result.isCompleted,
        remaining: result.remaining,
        rewards: result.rewards ?? null,
      }), 200,);
  },
);

// GET /check-in/configs/:key/users/:endUserId/state
checkInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/users/{endUserId}/state",
    tags: [TAG],
    summary: "Fetch an end user's aggregate state for a config",
    request: { params: UserStateParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CheckInUserStateViewSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key, endUserId } = c.req.valid("param");
    const view = await checkInService.getUserState({
      tenantId: orgId,
      configKey: key,
      endUserId,
    });
    return c.json(ok({
        state: serializeState(view.state),
        target: view.target,
        isCompleted: view.isCompleted,
        remaining: view.remaining,
      }), 200,);
  },
);

// DELETE /check-in/configs/:key/users/:endUserId/state
checkInRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{key}/users/{endUserId}/state",
    tags: [TAG],
    summary: "Reset an end user's check-in progress (deletes state row; next check-in starts fresh)",
    request: { params: UserStateParamSchema },
    responses: {
      200: {
        description: "Reset result",
        content: {
          "application/json": { schema: envelopeOf(ResetUserStateResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key, endUserId } = c.req.valid("param");
    const result = await checkInService.resetUserState(orgId, key, endUserId);
    return c.json(ok(result), 200);
  },
);

// ─── Reward routes ────────────────────────────────────────────────

const TAG_REWARD = "Check-In Rewards";

function serializeReward(row: {
  id: string;
  configId: string;
  tenantId: string;
  dayNumber: number;
  rewardItems: RewardEntry[];
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    configId: row.configId,
    tenantId: row.tenantId,
    dayNumber: row.dayNumber,
    rewardItems: row.rewardItems,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// POST /check-in/configs/:key/rewards
checkInRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs/{key}/rewards",
    tags: [TAG_REWARD],
    summary: "Create a daily reward for a check-in config",
    request: {
      params: ConfigKeyParamSchema,
      body: {
        content: { "application/json": { schema: CreateRewardSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(CheckInRewardResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await checkInService.createReward(orgId, key, body);
    return c.json(ok(serializeReward(row)), 201);
  },
);

// GET /check-in/configs/:key/rewards
checkInRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}/rewards",
    tags: [TAG_REWARD],
    summary: "List daily rewards for a check-in config",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(RewardListResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const rows = await checkInService.listRewards(orgId, key);
    return c.json(ok({ items: rows.map(serializeReward) }), 200);
  },
);

// PATCH /check-in/rewards/:rewardId
checkInRouter.openapi(
  createAdminRoute({
    method: "patch",
    path: "/rewards/{rewardId}",
    tags: [TAG_REWARD],
    summary: "Update a check-in reward",
    request: {
      params: RewardIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateRewardSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(CheckInRewardResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { rewardId } = c.req.valid("param");
    const row = await checkInService.updateReward(
      orgId,
      rewardId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeReward(row)), 200);
  },
);

// DELETE /check-in/rewards/:rewardId
checkInRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/rewards/{rewardId}",
    tags: [TAG_REWARD],
    summary: "Delete a check-in reward",
    request: { params: RewardIdParamSchema },
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
    const { rewardId } = c.req.valid("param");
    await checkInService.deleteReward(orgId, rewardId);
    return c.json(ok(null), 200);
  },
);
