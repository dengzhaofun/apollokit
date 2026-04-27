/**
 * C-end client routes for the team module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and the caller's
 * endUserId from getEndUserId(c). No inline verifyRequest calls; no auth fields in
 * body or query.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { teamService } from "./index";
import {
  ConfigAliasQuerySchema,
  CreateTeamSchema,
  InvitationIdParamSchema,
  InvitationResponseSchema,
  InviteSchema,
  QuickMatchQuerySchema,
  TeamIdAndUserParamSchema,
  TeamIdParamSchema,
  TeamResponseSchema,
  TransferLeaderSchema,
  UpdateTeamStatusSchema,
} from "./validators";

const TAG = "Team (Client)";

function serializeMember(m: {
  teamId: string;
  endUserId: string;
  organizationId: string;
  role: string;
  joinedAt: Date;
}) {
  return {
    teamId: m.teamId,
    endUserId: m.endUserId,
    organizationId: m.organizationId,
    role: m.role as "leader" | "member",
    joinedAt: m.joinedAt.toISOString(),
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
      ? { members: row.members.map(serializeMember) }
      : {}),
  };
}

function serializeInvitation(row: {
  id: string;
  organizationId: string;
  teamId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  expiresAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status as "pending" | "accepted" | "rejected" | "expired",
    expiresAt: row.expiresAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const teamClientRouter = createClientRouter();

teamClientRouter.use("*", requireClientCredential);
teamClientRouter.use("*", requireClientUser);

// POST /teams — create a new team
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams",
    tags: [TAG],
    summary: "Create a new team (caller becomes leader)",
    request: {
      body: {
        content: { "application/json": { schema: CreateTeamSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { configKey, metadata } = c.req.valid("json");

    const team = await teamService.createTeam(orgId, configKey, endUserId, metadata);
    return c.json(ok(serializeTeam(team)), 201);
  },
);

// GET /my-team?configAlias=
teamClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/my-team",
    tags: [TAG],
    summary: "Get the current user's active team for a config",
    request: {
      query: ConfigAliasQuerySchema,
    },
    responses: {
      200: {
        description: "OK (returns team or null)",
        content: {
          "application/json": {
            schema: envelopeOf(TeamResponseSchema.nullable(),)
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { configAlias } = c.req.valid("query");
    const team = await teamService.getMyTeam(orgId, configAlias, endUserId);
    return c.json(ok(team ? serializeTeam(team) : null), 200);
  },
);

// GET /teams/:id
teamClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/teams/{id}",
    tags: [TAG],
    summary: "Get a team by id with members",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const team = await teamService.getTeam(orgId, id);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/join
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/join",
    tags: [TAG],
    summary: "Join an open team",
    request: {
      params: TeamIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const team = await teamService.joinTeam(orgId, id, endUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/leave
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/leave",
    tags: [TAG],
    summary: "Leave a team",
    request: {
      params: TeamIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const team = await teamService.leaveTeam(orgId, id, endUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/dissolve
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/dissolve",
    tags: [TAG],
    summary: "Dissolve a team (leader only)",
    request: {
      params: TeamIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const team = await teamService.dissolveTeam(orgId, id, endUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/kick/:userId
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/kick/{userId}",
    tags: [TAG],
    summary: "Kick a member from the team (leader only)",
    request: {
      params: TeamIdAndUserParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id, userId } = c.req.valid("param");
    const team = await teamService.kickMember(orgId, id, endUserId, userId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/transfer-leader
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/transfer-leader",
    tags: [TAG],
    summary: "Transfer team leadership to another member",
    request: {
      params: TeamIdParamSchema,
      body: {
        content: { "application/json": { schema: TransferLeaderSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { newLeaderUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const team = await teamService.transferLeader(orgId, id, endUserId, newLeaderUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// PUT /teams/:id/status
teamClientRouter.openapi(
  createClientRoute({
    method: "put",
    path: "/teams/{id}/status",
    tags: [TAG],
    summary: "Update team status (leader only)",
    request: {
      params: TeamIdParamSchema,
      body: {
        content: { "application/json": { schema: UpdateTeamStatusSchema } },
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { status } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const team = await teamService.updateTeamStatus(orgId, id, endUserId, status);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /teams/:id/invite
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/teams/{id}/invite",
    tags: [TAG],
    summary: "Invite a user to the team",
    request: {
      params: TeamIdParamSchema,
      body: {
        content: { "application/json": { schema: InviteSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": { schema: envelopeOf(InvitationResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { toUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const inv = await teamService.inviteUser(orgId, id, endUserId, toUserId);
    return c.json(ok(serializeInvitation(inv)), 201);
  },
);

// POST /invitations/:id/accept
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/accept",
    tags: [TAG],
    summary: "Accept a team invitation",
    request: {
      params: InvitationIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const team = await teamService.acceptInvitation(orgId, id, endUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);

// POST /invitations/:id/reject
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/reject",
    tags: [TAG],
    summary: "Reject a team invitation",
    request: {
      params: InvitationIdParamSchema,
    },
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": { schema: envelopeOf(InvitationResponseSchema) },
        },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const inv = await teamService.rejectInvitation(orgId, id, endUserId);
    return c.json(ok(serializeInvitation(inv)), 200);
  },
);

// POST /quick-match?configAlias=
teamClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/quick-match",
    tags: [TAG],
    summary: "Quick match — join the fullest open team or create a new one",
    request: {
      query: QuickMatchQuerySchema,
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: envelopeOf(TeamResponseSchema) } },
      },
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = getEndUserId(c);
    const { configAlias } = c.req.valid("query");
    const team = await teamService.quickMatch(orgId, configAlias, endUserId);
    return c.json(ok(serializeTeam(team)), 200);
  },
);
