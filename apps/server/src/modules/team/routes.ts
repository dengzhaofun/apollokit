/**
 * Admin-facing HTTP routes for the team module.
 *
 * Guarded by `requireAdminOrApiKey`. Exposes config CRUD, team listing,
 * and admin-level team dissolution.
 */


import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { ModuleError } from "./errors";
import { teamService } from "./index";
import {
  ConfigKeyParamSchema,
  ConfigListResponseSchema,
  ConfigResponseSchema,
  CreateConfigSchema,
  ErrorResponseSchema,
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

export const teamRouter = createAdminRouter();

teamRouter.use("*", requireAdminOrApiKey);

teamRouter.onError((err, c) => {
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

// ─── Config CRUD ─────────────────────────────────────────────────

// POST /team/configs
teamRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: ConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await teamService.createConfig(orgId, c.req.valid("json"));
    return c.json(serializeConfig(row), 201);
  },
);

// GET /team/configs
teamRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List team configs for the current organization",
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
    const rows = await teamService.listConfigs(orgId);
    return c.json({ items: rows.map(serializeConfig) }, 200);
  },
);

// GET /team/configs/:key
teamRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a team config by id or alias",
    request: { params: ConfigKeyParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: ConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await teamService.getConfig(orgId, key);
    return c.json(serializeConfig(row), 200);
  },
);

// PUT /team/configs/:key
teamRouter.openapi(
  createAdminRoute({
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
          "application/json": { schema: ConfigResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    const row = await teamService.updateConfig(orgId, key, c.req.valid("json"));
    return c.json(serializeConfig(row), 200);
  },
);

// DELETE /team/configs/:key
teamRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Delete a team config (cascades to teams and members)",
    request: { params: ConfigKeyParamSchema },
    responses: {
      204: { description: "Deleted" },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { key } = c.req.valid("param");
    await teamService.deleteConfig(orgId, key);
    return c.body(null, 204);
  },
);

// ─── Team admin routes ───────────────────────────────────────────

// GET /team/teams
teamRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/teams",
    tags: [TAG],
    summary: "List teams for the current organization",
    request: { query: TeamListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TeamListResponseSchema } },
      },
      ...errorResponses,
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
      { items: result.items.map(serializeTeam), total: result.total },
      200,
    );
  },
);

// GET /team/teams/:id
teamRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/teams/{id}",
    tags: [TAG],
    summary: "Fetch a team by id with members",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: TeamResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const team = await teamService.getTeam(orgId, id);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /team/teams/:id/dissolve — admin force dissolve
teamRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/teams/{id}/dissolve",
    tags: [TAG],
    summary: "Admin force dissolve a team",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: TeamResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const team = await teamService.adminDissolveTeam(orgId, id);
    return c.json(serializeTeam(team), 200);
  },
);
