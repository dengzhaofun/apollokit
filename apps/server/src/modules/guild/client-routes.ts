/**
 * C-end client routes for the guild module.
 *
 * Protected by `requireClientCredential` — requires a valid client
 * credential (cpk_ publishable key) in the x-api-key header. HMAC
 * verification of endUserId is done inline via the credential service.
 *
 * End users identify themselves via x-end-user-id and x-user-hash headers
 * (for GET) or endUserId/userHash body fields (for POST/PUT).
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { clientCredentialService } from "../client-credentials";
import { guildService } from "./index";
import {
  ContributeSchema,
  ContributionListQuerySchema,
  ContributionLogListResponseSchema,
  ContributionLogResponseSchema,
  CreateGuildSchema,
  ErrorResponseSchema,
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
} from "./validators";

const TAG = "Guild (Client)";

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

// ─── HMAC helper ─────────────────────────────────────────────────

/**
 * Extract endUserId + userHash from request. POST/PUT reads from body,
 * GET reads from headers.
 */
async function verifyEndUser(c: { req: { header: (name: string) => string | undefined } }, publishableKey: string, endUserId: string, userHash?: string) {
  await clientCredentialService.verifyRequest(publishableKey, endUserId, userHash);
}

// ─── Client body schemas with endUserId/userHash ─────────────────

const ClientCreateGuildSchema = CreateGuildSchema.extend({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientCreateGuild");

const ClientApplySchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
  message: z.string().max(500).nullable().optional(),
}).openapi("ClientApplyToJoin");

const ClientLeaveSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientLeaveGuild");

const ClientDisbandSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientDisbandGuild");

const ClientAcceptRejectRequestSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientAcceptRejectRequest");

const ClientInviteSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
  targetUserId: z.string().min(1).max(256),
}).openapi("ClientInviteUser");

const ClientAcceptInvitationSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientAcceptInvitation");

const ClientRejectInvitationSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientRejectInvitation");

const ClientMemberActionSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientMemberAction");

const ClientTransferLeaderSchema = z.object({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
  newLeaderUserId: z.string().min(1).max(256),
}).openapi("ClientTransferLeader");

const ClientUpdateGuildSchema = UpdateGuildSchema.extend({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientUpdateGuild");

const ClientContributeSchema = ContributeSchema.extend({
  endUserId: z.string().min(1).max(256),
  userHash: z.string().optional(),
}).openapi("ClientContribute");

const MyGuildResponseSchema = z.object({
  guild: GuildResponseSchema,
  member: GuildMemberResponseSchema,
}).nullable().openapi("MyGuildResponse");

const CreateGuildResponseSchema = z.object({
  guild: GuildResponseSchema,
  member: GuildMemberResponseSchema,
}).openapi("CreateGuildResponse");

// ─── Router ──────────────────────────────────────────────────────

export const guildClientRouter = new OpenAPIHono<HonoEnv>();

guildClientRouter.use("*", requireClientCredential);

guildClientRouter.onError((err, c) => {
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

// POST /guilds — create guild
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds",
    tags: [TAG],
    summary: "Create a guild",
    request: {
      body: {
        content: { "application/json": { schema: ClientCreateGuildSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: CreateGuildResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const body = c.req.valid("json");
    await verifyEndUser(c, publishableKey, body.endUserId, body.userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const { guild, member } = await guildService.createGuild(orgId, body.endUserId, {
      name: body.name,
      description: body.description,
      icon: body.icon,
      joinMode: body.joinMode,
      metadata: body.metadata,
    });
    return c.json(
      { guild: serializeGuild(guild), member: serializeMember(member) },
      201,
    );
  },
);

// GET /guilds — list guilds
guildClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds",
    tags: [TAG],
    summary: "List active guilds",
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

// GET /guilds/:id — guild detail
guildClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Get guild details",
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

// GET /my-guild — get current user's guild
guildClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/my-guild",
    tags: [TAG],
    summary: "Get the current user's guild",
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: MyGuildResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const endUserId = c.req.header("x-end-user-id");
    const userHash = c.req.header("x-user-hash");

    if (!endUserId) {
      return c.json({ error: "x-end-user-id header required", requestId: c.get("requestId") }, 400);
    }
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const result = await guildService.getMyGuild(orgId, endUserId);
    if (!result) {
      return c.json(null, 200);
    }
    return c.json(
      { guild: serializeGuild(result.guild), member: serializeMember(result.member) },
      200,
    );
  },
);

// POST /guilds/:id/join — apply to join
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/join",
    tags: [TAG],
    summary: "Apply to join a guild",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientApplySchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash, message } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const req = await guildService.applyToJoin(orgId, id, endUserId, message);
    return c.json(serializeJoinRequest(req), 200);
  },
);

// POST /guilds/:id/leave — leave guild
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/leave",
    tags: [TAG],
    summary: "Leave a guild",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientLeaveSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: z.object({ success: z.boolean() }).openapi("SuccessResponse") } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await guildService.leaveGuild(orgId, id, endUserId);
    return c.json({ success: true }, 200);
  },
);

// POST /guilds/:id/disband — disband guild (client: leader only via service check)
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/disband",
    tags: [TAG],
    summary: "Disband a guild (leader only)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientDisbandSchema } },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    // Verify the user is the leader before allowing disband
    const myGuild = await guildService.getMyGuild(orgId, endUserId);
    if (!myGuild || myGuild.guild.id !== id || myGuild.member.role !== "leader") {
      return c.json({ error: "only the guild leader can disband", code: "guild.insufficient_permission", requestId: c.get("requestId") }, 403);
    }
    const row = await guildService.disbandGuild(orgId, id);
    return c.json(serializeGuild(row), 200);
  },
);

// GET /guilds/:id/requests — list join requests
guildClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/guilds/{id}/requests",
    tags: [TAG],
    summary: "List join requests for a guild (officer+)",
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
    // No HMAC for list operations — the publishable key scopes to the org
    const rows = await guildService.listJoinRequests(orgId, id, { status, limit, offset });
    return c.json({ items: rows.map(serializeJoinRequest) }, 200);
  },
);

// POST /requests/:id/accept — accept a join request
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/requests/{id}/accept",
    tags: [TAG],
    summary: "Accept a join request (officer+)",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientAcceptRejectRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const { request } = await guildService.acceptJoinRequest(orgId, id, endUserId);
    return c.json(serializeJoinRequest(request), 200);
  },
);

// POST /requests/:id/reject — reject a join request
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/requests/{id}/reject",
    tags: [TAG],
    summary: "Reject a join request (officer+)",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientAcceptRejectRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const req = await guildService.rejectJoinRequest(orgId, id, endUserId);
    return c.json(serializeJoinRequest(req), 200);
  },
);

// POST /guilds/:id/invite — invite a user
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/invite",
    tags: [TAG],
    summary: "Invite a user to the guild (officer+)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientInviteSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash, targetUserId } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const req = await guildService.inviteUser(orgId, id, endUserId, targetUserId);
    return c.json(serializeJoinRequest(req), 200);
  },
);

// POST /invitations/:id/accept — accept an invitation
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/invitations/{id}/accept",
    tags: [TAG],
    summary: "Accept a guild invitation",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientAcceptInvitationSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const { request } = await guildService.acceptInvitation(orgId, id, endUserId);
    return c.json(serializeJoinRequest(request), 200);
  },
);

// POST /invitations/:id/reject — reject an invitation
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/invitations/{id}/reject",
    tags: [TAG],
    summary: "Reject a guild invitation",
    request: {
      params: RequestIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientRejectInvitationSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: JoinRequestResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const req = await guildService.rejectInvitation(orgId, id, endUserId);
    return c.json(serializeJoinRequest(req), 200);
  },
);

// POST /guilds/:id/members/:userId/promote
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/promote",
    tags: [TAG],
    summary: "Promote a member to officer (leader only)",
    request: {
      params: MemberUserIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientMemberActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildMemberResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id, userId } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const member = await guildService.promoteMember(orgId, id, endUserId, userId);
    return c.json(serializeMember(member), 200);
  },
);

// POST /guilds/:id/members/:userId/demote
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/demote",
    tags: [TAG],
    summary: "Demote an officer to member (leader only)",
    request: {
      params: MemberUserIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientMemberActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GuildMemberResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id, userId } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const member = await guildService.demoteMember(orgId, id, endUserId, userId);
    return c.json(serializeMember(member), 200);
  },
);

// POST /guilds/:id/members/:userId/kick
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/members/{userId}/kick",
    tags: [TAG],
    summary: "Kick a member from the guild (officer+)",
    request: {
      params: MemberUserIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientMemberActionSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: z.object({ success: z.boolean() }).openapi("KickSuccessResponse") } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id, userId } = c.req.valid("param");
    const { endUserId, userHash } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await guildService.kickMember(orgId, id, endUserId, userId);
    return c.json({ success: true }, 200);
  },
);

// POST /guilds/:id/transfer-leader
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/transfer-leader",
    tags: [TAG],
    summary: "Transfer guild leadership (leader only)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientTransferLeaderSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: z.object({ success: z.boolean() }).openapi("TransferSuccessResponse") } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash, newLeaderUserId } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    await guildService.transferLeader(orgId, id, endUserId, newLeaderUserId);
    return c.json({ success: true }, 200);
  },
);

// PUT /guilds/:id — client update (leader/officer)
guildClientRouter.openapi(
  createRoute({
    method: "put",
    path: "/guilds/{id}",
    tags: [TAG],
    summary: "Update guild info (leader/officer)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientUpdateGuildSchema } },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    await verifyEndUser(c, publishableKey, body.endUserId, body.userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    // Verify the user is officer+ in this guild
    const myGuild = await guildService.getMyGuild(orgId, body.endUserId);
    if (!myGuild || myGuild.guild.id !== id) {
      return c.json({ error: "not a member of this guild", code: "guild.not_member", requestId: c.get("requestId") }, 403);
    }
    if (myGuild.member.role !== "leader" && myGuild.member.role !== "officer") {
      return c.json({ error: "insufficient permission", code: "guild.insufficient_permission", requestId: c.get("requestId") }, 403);
    }

    const row = await guildService.updateGuild(orgId, id, {
      name: body.name,
      description: body.description,
      icon: body.icon,
      announcement: body.announcement,
      joinMode: body.joinMode,
      metadata: body.metadata,
    });
    return c.json(serializeGuild(row), 200);
  },
);

// POST /guilds/:id/contribute — member contribution
guildClientRouter.openapi(
  createRoute({
    method: "post",
    path: "/guilds/{id}/contribute",
    tags: [TAG],
    summary: "Contribute to the guild (member)",
    request: {
      params: GuildIdParamSchema,
      body: {
        content: { "application/json": { schema: ClientContributeSchema } },
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
    const publishableKey = c.req.header("x-api-key")!;
    const { id } = c.req.valid("param");
    const { endUserId, userHash, delta, source, sourceId } = c.req.valid("json");
    await verifyEndUser(c, publishableKey, endUserId, userHash);

    const orgId = c.var.session!.activeOrganizationId!;
    const log = await guildService.contribute(orgId, id, endUserId, delta, source, sourceId);
    return c.json(serializeContributionLog(log), 200);
  },
);

// GET /guilds/:id/contributions — contribution leaderboard
guildClientRouter.openapi(
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

// GET /guilds/:id/members — list guild members
guildClientRouter.openapi(
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
