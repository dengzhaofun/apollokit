/**
 * Admin-facing HTTP routes for the assist-pool module.
 *
 * The only file in the module that knows about Hono. Translates
 * Zod-validated I/O into service calls and maps typed errors onto
 * HTTP responses. No business logic here.
 *
 * Guard: `requireAdminOrApiKey` — Better Auth session OR admin API key.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { ModuleError } from "./errors";
import { assistPoolService } from "./index";
import type {
  AssistPoolConfig,
  AssistPoolContribution,
  AssistPoolInstance,
} from "./types";
import {
  AdminContributeBodySchema,
  AdminInitiateBodySchema,
  AssistPoolConfigListSchema,
  AssistPoolConfigResponseSchema,
  AssistPoolContributeResultSchema,
  AssistPoolContributionListSchema,
  AssistPoolInstanceListSchema,
  AssistPoolInstanceResponseSchema,
  ConfigIdParamSchema,
  ConfigKeyParamSchema,
  CreateConfigSchema,
  ErrorResponseSchema,
  InstanceIdParamSchema,
  ListConfigsQuerySchema,
  ListInstancesQuerySchema,
  UpdateConfigSchema,
} from "./validators";

const TAG = "Assist Pool";
const TAG_INSTANCES = "Assist Pool Instances";

function serializeConfig(row: AssistPoolConfig) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    description: row.description,
    mode: row.mode as "accumulate" | "decrement",
    targetAmount: row.targetAmount,
    contributionPolicy: row.contributionPolicy,
    perAssisterLimit: row.perAssisterLimit,
    initiatorCanAssist: row.initiatorCanAssist,
    expiresInSeconds: row.expiresInSeconds,
    maxInstancesPerInitiator: row.maxInstancesPerInitiator,
    rewards: row.rewards,
    isActive: row.isActive,
    activityId: row.activityId,
    activityNodeId: row.activityNodeId,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeInstance(row: AssistPoolInstance) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    configId: row.configId,
    initiatorEndUserId: row.initiatorEndUserId,
    status: row.status as "in_progress" | "completed" | "expired",
    remaining: row.remaining,
    targetAmount: row.targetAmount,
    contributionCount: row.contributionCount,
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    rewardGrantedAt: row.rewardGrantedAt?.toISOString() ?? null,
    version: row.version,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeContribution(row: AssistPoolContribution) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    instanceId: row.instanceId,
    assisterEndUserId: row.assisterEndUserId,
    amount: row.amount,
    remainingAfter: row.remainingAfter,
    createdAt: row.createdAt.toISOString(),
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

export const assistPoolRouter = new OpenAPIHono<HonoEnv>();

assistPoolRouter.use("*", requireAdminOrApiKey);

assistPoolRouter.onError((err, c) => {
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

// POST /configs
assistPoolRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create an assist-pool config for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: AssistPoolConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await assistPoolService.createConfig(
      orgId,
      c.req.valid("json"),
    );
    return c.json(serializeConfig(row), 201);
  },
);

// GET /configs
assistPoolRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary:
      "List assist-pool configs. Activity-scoped configs are filtered out by default.",
    request: { query: ListConfigsQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolConfigListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const rows = await assistPoolService.listConfigs(orgId, {
      activityId: q.activityId,
      includeActivity: q.includeActivity === "true",
    });
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

// GET /configs/:key
assistPoolRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch an assist-pool config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await assistPoolService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

// PATCH /configs/:id
assistPoolRouter.openapi(
  createRoute({
    method: "patch",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Update an assist-pool config (mode / policy / target are immutable)",
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
          "application/json": { schema: AssistPoolConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await assistPoolService.updateConfig(
      orgId,
      id,
      c.req.valid("json"),
    );
    return c.json(serializeConfig(row), 200);
  },
);

// DELETE /configs/:id
assistPoolRouter.openapi(
  createRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete an assist-pool config (cascades to instances, contributions, ledger)",
    request: { params: ConfigIdParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await assistPoolService.deleteConfig(orgId, id);
    return c.body(null, 204);
  },
);

// POST /instances — admin initiates on behalf of an end user
assistPoolRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances",
    tags: [TAG_INSTANCES],
    summary: "Admin: initiate an assist-pool instance for a given end user",
    request: {
      body: {
        content: { "application/json": { schema: AdminInitiateBodySchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: AssistPoolInstanceResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const body = c.req.valid("json");
    const row = await assistPoolService.initiateInstance({
      organizationId: orgId,
      configKey: body.configKey,
      initiatorEndUserId: body.initiatorEndUserId,
    });
    return c.json(serializeInstance(row), 201);
  },
);

// GET /instances — list / filter
assistPoolRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances",
    tags: [TAG_INSTANCES],
    summary: "List assist-pool instances",
    request: { query: ListInstancesQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolInstanceListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const rows = await assistPoolService.listInstances({
      organizationId: orgId,
      configKey: q.configKey,
      initiatorEndUserId: q.initiatorEndUserId,
      status: q.status,
      limit: q.limit,
    });
    return c.json({ items: rows.map(serializeInstance) }, 200);
  },
);

// GET /instances/:instanceId
assistPoolRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances/{instanceId}",
    tags: [TAG_INSTANCES],
    summary: "Fetch a single assist-pool instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolInstanceResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const row = await assistPoolService.getInstance(orgId, instanceId);
    return c.json(serializeInstance(row), 200);
  },
);

// GET /instances/:instanceId/contributions
assistPoolRouter.openapi(
  createRoute({
    method: "get",
    path: "/instances/{instanceId}/contributions",
    tags: [TAG_INSTANCES],
    summary: "List contributions made to an instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolContributionListSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const rows = await assistPoolService.listContributions(orgId, instanceId);
    return c.json({ items: rows.map(serializeContribution) }, 200);
  },
);

// POST /instances/:instanceId/contribute — admin drives a contribution on behalf of another user
assistPoolRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/contribute",
    tags: [TAG_INSTANCES],
    summary: "Admin: contribute to an instance on behalf of an end user",
    request: {
      params: InstanceIdParamSchema,
      body: {
        content: { "application/json": { schema: AdminContributeBodySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolContributeResultSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const { assisterEndUserId } = c.req.valid("json");
    const res = await assistPoolService.contribute({
      organizationId: orgId,
      instanceId,
      assisterEndUserId,
    });
    return c.json(
      {
        instance: serializeInstance(res.instance),
        contribution: serializeContribution(res.contribution),
        completed: res.completed,
        rewards: res.rewards ? res.rewards.rewards : null,
      },
      200,
    );
  },
);

// POST /instances/:instanceId/force-expire
assistPoolRouter.openapi(
  createRoute({
    method: "post",
    path: "/instances/{instanceId}/force-expire",
    tags: [TAG_INSTANCES],
    summary: "Admin: force-expire an instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: AssistPoolInstanceResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const row = await assistPoolService.forceExpireInstance(orgId, instanceId);
    return c.json(serializeInstance(row), 200);
  },
);
