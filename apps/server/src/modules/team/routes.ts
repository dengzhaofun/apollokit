/**
 * Admin-facing HTTP routes for the team module.
 *
 * Guarded by `requireAdminOrApiKey`. Exposes config CRUD, team listing,
 * and admin-level team dissolution.
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
import { teamService } from "./index";
import {
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  ConfigResponseSchema,
  CreateConfigSchema,
  TeamIdParamSchema,
  TeamListQuerySchema,
  TeamListResponseSchema,
  TeamResponseSchema,
  UpdateConfigSchema,
} from "./validators";

const TAG = "Team";

function serializeConfig(row: {
  id: string;
  organizationId: string;
  alias: string | null;
  name: string;
  maxMembers: number;
  autoDissolveOnLeaderLeave: boolean;
  allowQuickMatch: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    alias: row.alias,
    name: row.name,
    maxMembers: row.maxMembers,
    autoDissolveOnLeaderLeave: row.autoDissolveOnLeaderLeave,
    allowQuickMatch: row.allowQuickMatch,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeTeam(row: {
  id: string;
  organizationId: string;
  configId: string;
  leaderUserId: string;
  status: string;
  memberCount: number;
  dissolvedAt: Date | null;
  version: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  members?: Array<{
    teamId: string;
    endUserId: string;
    organizationId: string;
    role: string;
    joinedAt: Date;
  }>;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    configId: row.configId,
    leaderUserId: row.leaderUserId,
    status: row.status as "open" | "closed" | "in_game" | "dissolved",
    memberCount: row.memberCount,
    dissolvedAt: row.dissolvedAt?.toISOString() ?? null,
    version: row.version,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.members
      ? {
          members: row.members.map((m) => ({
            teamId: m.teamId,
            endUserId: m.endUserId,
            organizationId: m.organizationId,
            role: m.role as "leader" | "member",
            joinedAt: m.joinedAt.toISOString(),
          })),
        }
      : {}),
  };
}

export const teamRouter = makeApiRouter();

teamRouter.use("*", requireAdminOrApiKey);

// ─── Config CRUD ─────────────────────────────────────────────────

// POST /team/configs
teamRouter.openapi(
  createRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a team config for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: CreateConfigSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(ConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await teamService.createConfig(orgId, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 201);
  },
);

// GET /team/configs
teamRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List team configs for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(ConfigListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const rows = await teamService.listConfigs(orgId);
    return c.json(ok({ items: rows.map(serializeConfig) }), 200);
  },
);

// GET /team/configs/:key
teamRouter.openapi(
  createRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a team config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await teamService.getConfig(orgId, key);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// PUT /team/configs/:key
teamRouter.openapi(
  createRoute({
    method: "put",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Update a team config",
    request: {
      params: ConfigKeyParamSchema,
      body: {
        content: { "application/json": { schema: UpdateConfigSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(ConfigResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await teamService.updateConfig(orgId, key, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// DELETE /team/configs/:key
teamRouter.openapi(
  createRoute({
    method: "delete",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Delete a team config (cascades to teams and members)",
    request: { params: ConfigKeyParamSchema },
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
    const { key } = c.req.valid("param");
    await teamService.deleteConfig(orgId, key);
    return c.json(ok(null), 200);
  },
);

// ─── Team admin routes ───────────────────────────────────────────

// GET /team/teams
teamRouter.openapi(
  createRoute({
    method: "get",
    path: "/teams",
    tags: [TAG],
    summary: "List teams for the current organization",
    request: { query: TeamListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const query = c.req.valid("query");
    const result = await teamService.listTeams(orgId, {
      configKey: query.configKey,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
    return c.json(
      ok({ items: result.items.map(serializeTeam), total: result.total }),
      200,
    );
  },
);

// GET /team/teams/:id
teamRouter.openapi(
  createRoute({
    method: "get",
    path: "/teams/{id}",
    tags: [TAG],
    summary: "Fetch a team by id with members",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(TeamResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const team = await teamService.getTeam(orgId, id);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /team/teams/:id/dissolve — admin force dissolve
teamRouter.openapi(
  createRoute({
    method: "post",
    path: "/teams/{id}/dissolve",
    tags: [TAG],
    summary: "Admin force dissolve a team",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(TeamResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const team = await teamService.adminDissolveTeam(orgId, id);
    return c.json(ok(serializeTeam(team)), 200);
  },
);
