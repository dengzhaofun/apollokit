/**
 * Admin-facing HTTP routes for the guild module.
 *
 * Every route is guarded by `requireAdminOrApiKey`. Downstream handlers
 * read `c.var.session!.activeOrganizationId!` without null checks.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { ModuleError } from "./errors";
import { guildService } from "./index";
import {
  ContributionListQuerySchema,
  ContributionLogListResponseSchema,
  ContributionLogResponseSchema,
  ErrorResponseSchema,
  GuildIdParamSchema,
  GuildListQuerySchema,
  GuildListResponseSchema,
  GuildMemberListResponseSchema,
  GuildResponseSchema,
  GuildSettingsResponseSchema,
  GrantExpSchema,
  JoinRequestListQuerySchema,
  JoinRequestListResponseSchema,
  UpdateGuildSchema,
  UpsertSettingsSchema,
} from "./validators";

const TAG = "Guild";

// ─── Serializers ─────────────────────────────────────────────────

function serializeSettings(row: {
  id: string;
  organizationId: string;
  maxMembers: number;
  maxOfficers: number;
  createCost: unknown;
  levelUpRules: unknown;
  joinMode: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    maxMembers: row.maxMembers,
    maxOfficers: row.maxOfficers,
    createCost: row.createCost as { definitionId: string; quantity: number }[],
    levelUpRules: (row.levelUpRules ?? null) as { level: number; expRequired: number; memberCapBonus: number }[] | null,
    joinMode: row.joinMode,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeGuild(row: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  announcement: string | null;
  leaderUserId: string;
  level: number;
  experience: number;
  memberCount: number;
  maxMembers: number;
  joinMode: string;
  isActive: boolean;
  disbandedAt: Date | null;
  version: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    announcement: row.announcement,
    leaderUserId: row.leaderUserId,
    level: row.level,
    experience: row.experience,
    memberCount: row.memberCount,
    maxMembers: row.maxMembers,
    joinMode: row.joinMode,
    isActive: row.isActive,
    disbandedAt: row.disbandedAt?.toISOString() ?? null,
    version: row.version,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMember(row: {
  guildId: string;
  endUserId: string;
  organizationId: string;
  role: string;
  contribution: number;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    guildId: row.guildId,
    endUserId: row.endUserId,
    organizationId: row.organizationId,
    role: row.role as "leader" | "officer" | "member",
    contribution: row.contribution,
    joinedAt: row.joinedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeJoinRequest(row: {
  id: string;
  organizationId: string;
  guildId: string;
  endUserId: string;
  type: string;
  status: string;
  invitedBy: string | null;
  message: string | null;
  respondedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    guildId: row.guildId,
    endUserId: row.endUserId,
    type: row.type as "application" | "invitation",
    status: row.status as "pending" | "accepted" | "rejected" | "cancelled",
    invitedBy: row.invitedBy,
    message: row.message,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeContributionLog(row: {
  id: string;
  organizationId: string;
  guildId: string;
  endUserId: string;
  delta: number;
  guildExpDelta: number;
  source: string;
  sourceId: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    guildId: row.guildId,
    endUserId: row.endUserId,
    delta: row.delta,
    guildExpDelta: row.guildExpDelta,
    source: row.source,
    sourceId: row.sourceId,
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
  403: {
    description: "Forbidden",
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

export const guildRouter = new OpenAPIHono<HonoEnv>();

guildRouter.use("*", requireAdminOrApiKey);

guildRouter.onError((err, c) => {
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

// ─── Settings ────────────────────────────────────────────────────

// GET /guild/settings
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    summary: "Get guild settings for the current organization",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildSettingsResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await guildService.getSettings(orgId);
    return c.json(serializeSettings(row), 200);
  },
);

// PUT /guild/settings
guildRouter.openapi(
  createRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    summary: "Upsert guild settings for the current organization",
    request: {
      body: {
        content: { "application/json": { schema: UpsertSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildSettingsResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const row = await guildService.upsertSettings(orgId, c.req.valid("json"));
    return c.json(serializeSettings(row), 200);
  },
);

// ─── Guild CRUD ──────────────────────────────────────────────────

// GET /guild/guilds
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds",
    tags: [TAG],
    summary: "List guilds for the current organization",
    request: { query: GuildListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { search, limit, offset } = c.req.valid("query");
    const result = await guildService.listGuilds(orgId, { search, limit, offset });
    return c.json(
      { items: result.items.map(serializeGuild), total: result.total },
      200,
    );
  },
);

// GET /guild/guilds/:id
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Get a guild by id",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await guildService.getGuild(orgId, id);
    return c.json(serializeGuild(row), 200);
  },
);

// PUT /guild/guilds/:id
guildRouter.openapi(
  createRoute({
    method: "put",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Update a guild",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateGuildSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await guildService.updateGuild(orgId, id, c.req.valid("json"));
    return c.json(serializeGuild(row), 200);
  },
);

// DELETE /guild/guilds/:id (disband)
guildRouter.openapi(
  createRoute({
    method: "delete",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Disband a guild (soft-delete)",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const row = await guildService.disbandGuild(orgId, id);
    return c.json(serializeGuild(row), 200);
  },
);

// ─── Admin grant exp ─────────────────────────────────────────────

// POST /guild/guilds/:id/grant-exp
guildRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/grant-exp",
    tags: [TAG],
    summary: "Grant experience points to a guild (admin)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: GrantExpSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ContributionLogResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { amount, source, sourceId } = c.req.valid("json");
    const log = await guildService.grantExp(orgId, id, amount, source, sourceId);
    return c.json(serializeContributionLog(log), 200);
  },
);

// ─── Admin list helpers ──────────────────────────────────────────

// GET /guild/guilds/:id/members
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}/members",
    tags: [TAG],
    summary: "List members of a guild",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildMemberListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const rows = await guildService.listMembers(orgId, id);
    return c.json({ items: rows.map(serializeMember) }, 200);
  },
);

// GET /guild/guilds/:id/requests
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}/requests",
    tags: [TAG],
    summary: "List join requests for a guild",
    request: {
      params: GuildIdParamSchema,
      query: JoinRequestListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { status, limit, offset } = c.req.valid("query");
    const rows = await guildService.listJoinRequests(orgId, id, { status, limit, offset });
    return c.json({ items: rows.map(serializeJoinRequest) }, 200);
  },
);

// GET /guild/guilds/:id/contributions
guildRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}/contributions",
    tags: [TAG],
    summary: "List contribution logs for a guild",
    request: {
      params: GuildIdParamSchema,
      query: ContributionListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ContributionLogListResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.var.session!.activeOrganizationId!;
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const rows = await guildService.listContributions(orgId, id, { limit, offset });
    return c.json({ items: rows.map(serializeContributionLog) }, 200);
  },
);
