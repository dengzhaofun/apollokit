/**
 * C-end client routes for the guild module.
 *
 * Mounted at /api/client/guild. Auth pattern:
 *
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and endUserId from
 * getEndUserId(c). No inline verifyRequest calls; no auth fields in body or query.
 */

import { z } from "@hono/zod-openapi";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import type { HonoEnv } from "../../env";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import {
  GuildInsufficientPermission,
  GuildNotMember,
} from "./errors";
import { guildService } from "./index";
import {
  ContributeSchema,
  ContributionListQuerySchema,
  ContributionLogListResponseSchema,
  ContributionLogResponseSchema,
  CreateGuildSchema,
  GuildIdParamSchema,
  GuildListQuerySchema,
  GuildListResponseSchema,
  GuildMemberListResponseSchema,
  GuildMemberResponseSchema,
  GuildResponseSchema,
  JoinRequestListQuerySchema,
  JoinRequestListResponseSchema,
  JoinRequestResponseSchema,
  MemberUserIdParamSchema,
  RequestIdParamSchema,
  UpdateGuildSchema,
  ApplyToJoinSchema,
  InviteUserSchema,
  TransferLeaderSchema,
} from "./validators";

const TAG = "Guild (Client)";

import { clientAuthHeaders as authHeaders } from "../../middleware/client-auth-headers";

// ─── Serializers ─────────────────────────────────────────────────

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

// ─── Composed body schemas (no auth fields) ──────────────────────

const ClientCreateGuildSchema = CreateGuildSchema.openapi("ClientCreateGuild");
const ClientUpdateGuildSchema = UpdateGuildSchema.openapi("ClientUpdateGuild");
const ClientContributeSchema = ContributeSchema.openapi("ClientContribute");

const MyGuildResponseSchema = z
  .object({
    guild: GuildResponseSchema,
    member: GuildMemberResponseSchema,
  })
  .nullable()
  .openapi("MyGuildResponse");

const CreateGuildResponseSchema = z
  .object({
    guild: GuildResponseSchema,
    member: GuildMemberResponseSchema,
  })
  .openapi("CreateGuildResponse");

// ─── Router ──────────────────────────────────────────────────────

export const guildClientRouter = createClientRouter();

guildClientRouter.use("*", requireClientCredential);
guildClientRouter.use("*", requireClientUser);

// POST /guilds — create guild
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds",
    tags: [TAG],
    summary: "Create a guild",
    request: {
      headers: authHeaders,
      body: {
        content: { "application/json": { schema: ClientCreateGuildSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(CreateGuildResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const body = c.req.valid("json");
    const { guild, member } = await guildService.createGuild(orgId, endUserId, {
      name: body.name,
      description: body.description,
      icon: body.icon,
      joinMode: body.joinMode,
      metadata: body.metadata,
    });
    return c.json(ok({ guild: serializeGuild(guild), member: serializeMember(member) }), 201,);
  },
);

// GET /guilds — list guilds
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/guilds",
    tags: [TAG],
    summary: "List active guilds",
    request: {
      headers: authHeaders,
      query: GuildListQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
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

// GET /guilds/:id — guild detail
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Get guild details",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
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
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const row = await guildService.getGuild(orgId, id);
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// GET /my-guild — get current user's guild
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/my-guild",
    tags: [TAG],
    summary: "Get the current user's guild",
    request: {
      headers: authHeaders,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(MyGuildResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const result = await guildService.getMyGuild(orgId, endUserId);
    if (!result) {
      return c.json(ok(null), 200);
    }
    return c.json(ok({ guild: serializeGuild(result.guild), member: serializeMember(result.member) }), 200,);
  },
);

// POST /guilds/:id/join — apply to join
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/join",
    tags: [TAG],
    summary: "Apply to join a guild",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ApplyToJoinSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { message } = c.req.valid("json");
    const req = await guildService.applyToJoin(orgId, id, endUserId, message);
    return c.json(ok(serializeJoinRequest(req)), 200);
  },
);

// POST /guilds/:id/leave — leave guild
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/leave",
    tags: [TAG],
    summary: "Leave a guild",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(z.object({ success: z.boolean() }).openapi("SuccessResponse")) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    await guildService.leaveGuild(orgId, id, endUserId);
    return c.json(ok({ success: true }), 200);
  },
);

// POST /guilds/:id/disband — disband guild (client: leader only via service check)
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/disband",
    tags: [TAG],
    summary: "Disband a guild (leader only)",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
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
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    // Verify the user is the leader before allowing disband
    const myGuild = await guildService.getMyGuild(orgId, endUserId);
    if (!myGuild || myGuild.guild.id !== id || myGuild.member.role !== "leader") {
      throw new GuildInsufficientPermission("only the guild leader can disband");
    }
    const row = await guildService.disbandGuild(orgId, id);
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// GET /guilds/:id/requests — list join requests
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/guilds/{id}/requests",
    tags: [TAG],
    summary: "List join requests for a guild (officer+)",
    request: {
      headers: authHeaders,
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
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const { status, limit, offset } = c.req.valid("query");
    const rows = await guildService.listJoinRequests(orgId, id, { status, limit, offset });
    return c.json(ok({ items: rows.map(serializeJoinRequest) }), 200);
  },
);

// POST /requests/:id/accept — accept a join request
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests/{id}/accept",
    tags: [TAG],
    summary: "Accept a join request (officer+)",
    request: {
      headers: authHeaders,
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { request } = await guildService.acceptJoinRequest(orgId, id, endUserId);
    return c.json(ok(serializeJoinRequest(request)), 200);
  },
);

// POST /requests/:id/reject — reject a join request
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/requests/{id}/reject",
    tags: [TAG],
    summary: "Reject a join request (officer+)",
    request: {
      headers: authHeaders,
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const req = await guildService.rejectJoinRequest(orgId, id, endUserId);
    return c.json(ok(serializeJoinRequest(req)), 200);
  },
);

// POST /guilds/:id/invite — invite a user
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/invite",
    tags: [TAG],
    summary: "Invite a user to the guild (officer+)",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: InviteUserSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { targetUserId } = c.req.valid("json");
    const req = await guildService.inviteUser(orgId, id, endUserId, targetUserId);
    return c.json(ok(serializeJoinRequest(req)), 200);
  },
);

// POST /invitations/:id/accept — accept an invitation
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/accept",
    tags: [TAG],
    summary: "Accept a guild invitation",
    request: {
      headers: authHeaders,
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { request } = await guildService.acceptInvitation(orgId, id, endUserId);
    return c.json(ok(serializeJoinRequest(request)), 200);
  },
);

// POST /invitations/:id/reject — reject an invitation
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/reject",
    tags: [TAG],
    summary: "Reject a guild invitation",
    request: {
      headers: authHeaders,
      params: RequestIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(JoinRequestResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const req = await guildService.rejectInvitation(orgId, id, endUserId);
    return c.json(ok(serializeJoinRequest(req)), 200);
  },
);

// POST /guilds/:id/members/:userId/promote
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/promote",
    tags: [TAG],
    summary: "Promote a member to officer (leader only)",
    request: {
      headers: authHeaders,
      params: MemberUserIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildMemberResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id, userId } = c.req.valid("param");
    const member = await guildService.promoteMember(orgId, id, endUserId, userId);
    return c.json(ok(serializeMember(member)), 200);
  },
);

// POST /guilds/:id/members/:userId/demote
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/demote",
    tags: [TAG],
    summary: "Demote an officer to member (leader only)",
    request: {
      headers: authHeaders,
      params: MemberUserIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildMemberResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id, userId } = c.req.valid("param");
    const member = await guildService.demoteMember(orgId, id, endUserId, userId);
    return c.json(ok(serializeMember(member)), 200);
  },
);

// POST /guilds/:id/members/:userId/kick
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/kick",
    tags: [TAG],
    summary: "Kick a member from the guild (officer+)",
    request: {
      headers: authHeaders,
      params: MemberUserIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(z.object({ success: z.boolean() }).openapi("KickSuccessResponse")) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id, userId } = c.req.valid("param");
    await guildService.kickMember(orgId, id, endUserId, userId);
    return c.json(ok({ success: true }), 200);
  },
);

// POST /guilds/:id/transfer-leader
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/transfer-leader",
    tags: [TAG],
    summary: "Transfer guild leadership (leader only)",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: TransferLeaderSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(z.object({ success: z.boolean() }).openapi("TransferSuccessResponse")) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { newLeaderUserId } = c.req.valid("json");
    await guildService.transferLeader(orgId, id, endUserId, newLeaderUserId);
    return c.json(ok({ success: true }), 200);
  },
);

// PUT /guilds/:id — client update (leader/officer)
guildClientRouter.openapi(
  createClientRoute({
    method: "put",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Update guild info (leader/officer)",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientUpdateGuildSchema } },
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
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    // Verify the user is officer+ in this guild
    const myGuild = await guildService.getMyGuild(orgId, endUserId);
    if (!myGuild || myGuild.guild.id !== id) {
      throw new GuildNotMember("not a member of this guild");
    }
    if (myGuild.member.role !== "leader" && myGuild.member.role !== "officer") {
      throw new GuildInsufficientPermission("insufficient permission");
    }

    const row = await guildService.updateGuild(orgId, id, {
      name: body.name,
      description: body.description,
      icon: body.icon,
      announcement: body.announcement,
      joinMode: body.joinMode,
      metadata: body.metadata,
    });
    return c.json(ok(serializeGuild(row)), 200);
  },
);

// POST /guilds/:id/contribute — member contribution
guildClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/guilds/{id}/contribute",
    tags: [TAG],
    summary: "Contribute to the guild (member)",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientContributeSchema } },
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
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const { delta, source, sourceId } = c.req.valid("json");
    const log = await guildService.contribute(orgId, id, endUserId, delta, source, sourceId);
    return c.json(ok(serializeContributionLog(log)), 200);
  },
);

// GET /guilds/:id/contributions — contribution leaderboard
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/guilds/{id}/contributions",
    tags: [TAG],
    summary: "List contribution logs for a guild",
    request: {
      headers: authHeaders,
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
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const rows = await guildService.listContributions(orgId, id, { limit, offset });
    return c.json(ok({ items: rows.map(serializeContributionLog) }), 200);
  },
);

// GET /guilds/:id/members — list guild members
guildClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/guilds/{id}/members",
    tags: [TAG],
    summary: "List members of a guild",
    request: {
      headers: authHeaders,
      params: GuildIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(GuildMemberListResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const rows = await guildService.listMembers(orgId, id);
    return c.json(ok({ items: rows.map(serializeMember) }), 200);
  },
);
