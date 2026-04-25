/**
 * Admin-facing HTTP routes for the assist-pool module.
 *
 * The only file in the module that knows about Hono. Translates
 * Zod-validated I/O into service calls and maps typed errors onto
 * HTTP responses. No business logic here.
 *
 * Guard: `requireAdminOrApiKey` — Better Auth session OR admin API key.
 */

import type { HonoEnv } from "../../env";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requireOrgManage } from "../../middleware/require-org-manage";
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

export const assistPoolRouter = createAdminRouter();

assistPoolRouter.use("*", requireAdminOrApiKey);
assistPoolRouter.use("*", requireOrgManage);

// POST /configs
assistPoolRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create an assist-pool config for the current project",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await assistPoolService.createConfig(
      orgId,
      c.req.valid("json"),
    );
    return c.json(ok(serializeConfig(row)), 201);
  },
);

// GET /configs
assistPoolRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(AssistPoolConfigListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const q = c.req.valid("query");
    const rows = await assistPoolService.listConfigs(orgId, {
      activityId: q.activityId,
      includeActivity: q.includeActivity === "true",
    });
    return c.json(ok({ items: rows.map(serializeConfig) }), 200);
  },
);

// GET /configs/:key
assistPoolRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch an assist-pool config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await assistPoolService.getConfig(orgId, key);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// PATCH /configs/:id
assistPoolRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(AssistPoolConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
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
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// DELETE /configs/:id
assistPoolRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{id}",
    tags: [TAG],
    summary: "Delete an assist-pool config (cascades to instances, contributions, ledger)",
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
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    await assistPoolService.deleteConfig(orgId, id);
    return c.json(ok(null), 200);
  },
);

// POST /instances — admin initiates on behalf of an end user
assistPoolRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(AssistPoolInstanceResponseSchema) },
        },
      },
      ...commonErrorResponses,
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
    return c.json(ok(serializeInstance(row)), 201);
  },
);

// GET /instances — list / filter
assistPoolRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/instances",
    tags: [TAG_INSTANCES],
    summary: "List assist-pool instances",
    request: { query: ListInstancesQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceListSchema) },
        },
      },
      ...commonErrorResponses,
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
    return c.json(ok({ items: rows.map(serializeInstance) }), 200);
  },
);

// GET /instances/:instanceId
assistPoolRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/instances/{instanceId}",
    tags: [TAG_INSTANCES],
    summary: "Fetch a single assist-pool instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const row = await assistPoolService.getInstance(orgId, instanceId);
    return c.json(ok(serializeInstance(row)), 200);
  },
);

// GET /instances/:instanceId/contributions
assistPoolRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/instances/{instanceId}/contributions",
    tags: [TAG_INSTANCES],
    summary: "List contributions made to an instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolContributionListSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const rows = await assistPoolService.listContributions(orgId, instanceId);
    return c.json(ok({ items: rows.map(serializeContribution) }), 200);
  },
);

// POST /instances/:instanceId/contribute — admin drives a contribution on behalf of another user
assistPoolRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: envelopeOf(AssistPoolContributeResultSchema) },
        },
      },
      ...commonErrorResponses,
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
    return c.json(ok({
        instance: serializeInstance(res.instance),
        contribution: serializeContribution(res.contribution),
        completed: res.completed,
        rewards: res.rewards ? res.rewards.rewards : null,
      }), 200,);
  },
);

// POST /instances/:instanceId/force-expire
assistPoolRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/instances/{instanceId}/force-expire",
    tags: [TAG_INSTANCES],
    summary: "Admin: force-expire an instance",
    request: { params: InstanceIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(AssistPoolInstanceResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { instanceId } = c.req.valid("param");
    const row = await assistPoolService.forceExpireInstance(orgId, instanceId);
    return c.json(ok(serializeInstance(row)), 200);
  },
);
