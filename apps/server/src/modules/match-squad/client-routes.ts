/**
 * C-end client routes for the match-squad module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.tenantId and the caller's
 * endUserId from getEndUserId(c). No inline verifyRequest calls; no auth fields in
 * body or query.
 */

import type { HonoEnv } from "../../env";
import { commonErrorResponses, envelopeOf, ok } from "../../lib/response";
import { getEndUserId } from "../../lib/route-context";
import { createClientRouter, createClientRoute } from "../../lib/openapi";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { matchSquadService } from "./index";
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

const TAG = "MatchSquad (Client)";

function serializeMember(m: {
  squadId: string;
  endUserId: string;
  tenantId: string;
  role: string;
  joinedAt: Date;
}) {
  return {
    squadId: m.squadId,
    endUserId: m.endUserId,
    tenantId: m.tenantId,
    role: m.role as "leader" | "member",
    joinedAt: m.joinedAt.toISOString(),
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
      ? { members: row.members.map(serializeMember) }
      : {}),
  };
}

function serializeInvitation(row: {
  id: string;
  tenantId: string;
  squadId: string;
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
    tenantId: row.tenantId,
    squadId: row.squadId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status as "pending" | "accepted" | "rejected" | "expired",
    expiresAt: row.expiresAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const matchSquadClientRouter = createClientRouter();

matchSquadClientRouter.use("*", requireClientCredential);
matchSquadClientRouter.use("*", requireClientUser);

// POST /squads — create a new squad
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads",
    tags: [TAG],
    summary: "Create a new squad (caller becomes leader)",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { configKey, metadata } = c.req.valid("json");

    const squad = await matchSquadService.createMatchSquad(orgId, configKey, endUserId, metadata);
    return c.json(ok(serializeSquad(squad)), 201);
  },
);

// GET /my-squad?configAlias=
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/my-squad",
    tags: [TAG],
    summary: "Get the current user's active squad for a config",
    request: {
      query: ConfigAliasQuerySchema,
    },
    responses: {
      200: {
        description: "OK (returns squad or null)",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { configAlias } = c.req.valid("query");
    const squad = await matchSquadService.getMyMatchSquad(orgId, configAlias, endUserId);
    return c.json(ok(squad ? serializeSquad(squad) : null), 200);
  },
);

// GET /squads/:id
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "get",
    path: "/squads/{id}",
    tags: [TAG],
    summary: "Get a squad by id with members",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.getMatchSquad(orgId, id);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/join
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/join",
    tags: [TAG],
    summary: "Join an open squad",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.joinMatchSquad(orgId, id, endUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/leave
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/leave",
    tags: [TAG],
    summary: "Leave a squad",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.leaveMatchSquad(orgId, id, endUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/dissolve
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/dissolve",
    tags: [TAG],
    summary: "Dissolve a squad (leader only)",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.dissolveMatchSquad(orgId, id, endUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/kick/:userId
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/kick/{userId}",
    tags: [TAG],
    summary: "Kick a member from the squad (leader only)",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id, userId } = c.req.valid("param");
    const squad = await matchSquadService.kickMember(orgId, id, endUserId, userId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/transfer-leader
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/transfer-leader",
    tags: [TAG],
    summary: "Transfer squad leadership to another member",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { newLeaderUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.transferLeader(orgId, id, endUserId, newLeaderUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// PUT /teams/:id/status
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "put",
    path: "/squads/{id}/status",
    tags: [TAG],
    summary: "Update squad status (leader only)",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { status } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.updateMatchSquadStatus(orgId, id, endUserId, status);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /squads/:id/invite
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/squads/{id}/invite",
    tags: [TAG],
    summary: "Invite a user to the squad",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { toUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const inv = await matchSquadService.inviteUser(orgId, id, endUserId, toUserId);
    return c.json(ok(serializeInvitation(inv)), 201);
  },
);

// POST /invitations/:id/accept
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/accept",
    tags: [TAG],
    summary: "Accept a squad invitation",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const squad = await matchSquadService.acceptInvitation(orgId, id, endUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);

// POST /invitations/:id/reject
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/invitations/{id}/reject",
    tags: [TAG],
    summary: "Reject a squad invitation",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { id } = c.req.valid("param");
    const inv = await matchSquadService.rejectInvitation(orgId, id, endUserId);
    return c.json(ok(serializeInvitation(inv)), 200);
  },
);

// POST /quick-match?configAlias=
matchSquadClientRouter.openapi(
  createClientRoute({
    method: "post",
    path: "/quick-match",
    tags: [TAG],
    summary: "Quick match — join the fullest open squad or create a new one",
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
    const orgId = c.get("clientCredential")!.tenantId;
    const endUserId = getEndUserId(c);
    const { configAlias } = c.req.valid("query");
    const squad = await matchSquadService.quickMatch(orgId, configAlias, endUserId);
    return c.json(ok(serializeSquad(squad)), 200);
  },
);
