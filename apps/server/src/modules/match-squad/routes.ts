/**
 * Admin-facing HTTP routes for the match-squad module.
 *
 * Guarded by `requireTenantSessionOrApiKey`. Exposes config CRUD, squad listing,
 * and admin-level squad dissolution.
 */

import type { HonoEnv } from "../../env";
import { PaginationQuerySchema } from "../../lib/pagination";
import { NullDataEnvelopeSchema, commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireTenantSessionOrApiKey } from "../../middleware/require-tenant-session-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { matchSquadService } from "./index";
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

const TAG = "MatchSquad";

function serializeConfig(row: {
  id: string;
  tenantId: string;
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
    tenantId: row.tenantId,
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

function serializeSquad(row: {
  id: string;
  tenantId: string;
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
    squadId: string;
    endUserId: string;
    tenantId: string;
    role: string;
    joinedAt: Date;
  }>;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
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
            squadId: m.squadId,
            endUserId: m.endUserId,
            tenantId: m.tenantId,
            role: m.role as "leader" | "member",
            joinedAt: m.joinedAt.toISOString(),
          })),
        }
      : {}),
  };
}

export const matchSquadRouter = createAdminRouter();

matchSquadRouter.use("*", requireTenantSessionOrApiKey);
matchSquadRouter.use("*", requirePermissionByMethod("matchSquad"));

// ─── Config CRUD ─────────────────────────────────────────────────

// POST /match-squad/configs
matchSquadRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/configs",
    tags: [TAG],
    summary: "Create a squad config for the current project",
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
    const orgId = getOrgId(c);
    const row = await matchSquadService.createConfig(orgId, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 201);
  },
);

// GET /match-squad/configs
matchSquadRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs",
    tags: [TAG],
    summary: "List squad configs for the current project",
    request: { query: PaginationQuerySchema },
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
    const page = await matchSquadService.listConfigs(orgId, c.req.valid("query"));
    return c.json(
      ok({ items: page.items.map(serializeConfig), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// GET /match-squad/configs/:key
matchSquadRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Fetch a squad config by id or alias",
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
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await matchSquadService.getConfig(orgId, key);
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// PUT /match-squad/configs/:key
matchSquadRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Update a squad config",
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
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    const row = await matchSquadService.updateConfig(orgId, key, c.req.valid("json"));
    return c.json(ok(serializeConfig(row)), 200);
  },
);

// DELETE /match-squad/configs/:key
matchSquadRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/configs/{key}",
    tags: [TAG],
    summary: "Delete a squad config (cascades to squads and members)",
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
    const orgId = getOrgId(c);
    const { key } = c.req.valid("param");
    await matchSquadService.deleteConfig(orgId, key);
    return c.json(ok(null), 200);
  },
);

// ─── MatchSquad admin routes ───────────────────────────────────────────

// GET /match-squad/teams
matchSquadRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/squads",
    tags: [TAG],
    summary: "List teams for the current project",
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
    const orgId = getOrgId(c);
    const query = c.req.valid("query") as Record<string, unknown> & {
      configKey?: string;
    };
    const page = await matchSquadService.listMatchSquads(orgId, query);
    return c.json(
      ok({ items: page.items.map(serializeSquad), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// GET /match-squad/teams/:id
matchSquadRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/squads/{id}",
    tags: [TAG],
    summary: "Fetch a squad by id with members",
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
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.getMatchSquad(orgId, id);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /match-squad/teams/:id/dissolve — admin force dissolve
matchSquadRouter.openapi(
  createAdminRoute({
    method: "post",
    path: "/squads/{id}/dissolve",
    tags: [TAG],
    summary: "Admin force dissolve a squad",
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
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.adminDissolveMatchSquad(orgId, id);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);
