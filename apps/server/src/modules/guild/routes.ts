/**
 * Admin-facing HTTP routes for the guild module.
 *
 * Every route is guarded by `requireAdminOrApiKey`. Downstream handlers
 * read `getOrgId(c)` without null checks.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getOrgId } from "../../lib/route-context";
import { createAdminRouter, createAdminRoute } from "../../lib/openapi";
import { requireAdminOrApiKey } from "../../middleware/require-admin-or-api-key";
import { requirePermissionByMethod } from "../../middleware/require-permission";
import { guildService } from "./index";
import {
  ContributionListQuerySchema,
  ContributionLogListResponseSchema,
  ContributionLogResponseSchema,
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

export const guildRouter = createAdminRouter();

guildRouter.use("*", requireAdminOrApiKey);
guildRouter.use("*", requirePermissionByMethod("guild"));

// ─── Settings ────────────────────────────────────────────────────

// GET /guild/settings
guildRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/settings",
    tags: [TAG],
    summary: "Get guild settings for the current project",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildSettingsResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await guildService.getSettings(orgId);
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// PUT /guild/settings
guildRouter.openapi(
  createAdminRoute({
    method: "put",
    path: "/settings",
    tags: [TAG],
    summary: "Upsert guild settings for the current project",
    request: {
      body: {
        content: { "application/json": { schema: UpsertSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildSettingsResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const row = await guildService.upsertSettings(orgId, c.req.valid("json"));
    return c.json(ok(serializeSettings(row)), 200);
  },
);

// ─── Guild CRUD ──────────────────────────────────────────────────

// GET /guild/guilds
guildRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/guilds",
    tags: [TAG],
    summary: "List guilds for the current project",
    request: { query: GuildListQuerySchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const q = c.req.valid("query");
    const page = await guildService.listGuilds(orgId, {
      search: q.search,
      cursor: q.cursor,
      limit: q.limit,
      q: q.q,
    });
    return c.json(
      ok({ items: page.items.map(serializeGuild), nextCursor: page.nextCursor }),
      200,
    );
  },
);

// GET /guild/guilds/:id
guildRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Get a guild by id",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await guildService.getGuild(orgId, id);
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// PUT /guild/guilds/:id
guildRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(GuildResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await guildService.updateGuild(orgId, id, c.req.valid("json"));
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// DELETE /guild/guilds/:id (disband)
guildRouter.openapi(
  createAdminRoute({
    method: "delete",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Disband a guild (soft-delete)",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const row = await guildService.disbandGuild(orgId, id);
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// ─── Admin grant exp ─────────────────────────────────────────────

// POST /guild/guilds/:id/grant-exp
guildRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(ContributionLogResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const { amount, source, sourceId } = c.req.valid("json");
    const log = await guildService.grantExp(orgId, id, amount, source, sourceId);
    return c.json(ok(serializeContributionLog(log)), 200);
  },
);

// ─── Admin list helpers ──────────────────────────────────────────

// GET /guild/guilds/:id/members
guildRouter.openapi(
  createAdminRoute({
    method: "get",
    path: "/guilds/{id}/members",
    tags: [TAG],
    summary: "List members of a guild",
    request: { params: GuildIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildMemberListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const rows = await guildService.listMembers(orgId, id);
    return c.json(ok({ items: rows.map(serializeMember) }), 200);
  },
);

// GET /guild/guilds/:id/requests
guildRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(JoinRequestListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const { status, limit, offset } = c.req.valid("query");
    const rows = await guildService.listJoinRequests(orgId, id, { status, limit, offset });
    return c.json(ok({ items: rows.map(serializeJoinRequest) }), 200);
  },
);

// GET /guild/guilds/:id/contributions
guildRouter.openapi(
  createAdminRoute({
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
        content: { "application/json": { schema: envelopeOf(ContributionLogListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = getOrgId(c);
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const rows = await guildService.listContributions(orgId, id, { limit, offset });
    return c.json(ok({ items: rows.map(serializeContributionLog) }), 200);
  },
);
