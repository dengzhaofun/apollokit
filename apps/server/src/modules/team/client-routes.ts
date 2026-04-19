/**
 * C-end client routes for the team module.
 *
 * Auth pattern (matches the invite module):
 *   requireClientCredential — validates x-api-key (cpk_...), populates c.var.clientCredential
 *   requireClientUser       — reads x-end-user-id + x-user-hash headers, verifies HMAC,
 *                             populates c.var.endUserId
 *
 * Handlers read orgId from c.get("clientCredential")!.organizationId and the caller's
 * endUserId from c.var.endUserId!. No inline verifyRequest calls; no auth fields in
 * body or query.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { HonoEnv } from "../../env";
import { ModuleError } from "../../lib/errors";
import { requireClientCredential } from "../../middleware/require-client-credential";
import { requireClientUser } from "../../middleware/require-client-user";
import { teamService } from "./index";
import {
  ConfigAliasQuerySchema,
  CreateTeamSchema,
  ErrorResponseSchema,
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

export const teamClientRouter = new OpenAPIHono<HonoEnv>();

teamClientRouter.use("*", requireClientCredential);
teamClientRouter.use("*", requireClientUser);

teamClientRouter.onError((err, c) => {
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

// POST /teams — create a new team
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configKey, metadata } = c.req.valid("json");

    const team = await teamService.createTeam(orgId, configKey, endUserId, metadata);
    return c.json(serializeTeam(team), 201);
  },
);

// GET /my-team?configAlias=
teamClientRouter.openapi(
  createRoute({
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
            schema: TeamResponseSchema.nullable(),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configAlias } = c.req.valid("query");
    const team = await teamService.getMyTeam(orgId, configAlias, endUserId);
    return c.json(team ? serializeTeam(team) : null, 200);
  },
);

// GET /teams/:id
teamClientRouter.openapi(
  createRoute({
    method: "get",
    path: "/teams/{id}",
    tags: [TAG],
    summary: "Get a team by id with members",
    request: { params: TeamIdParamSchema },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const { id } = c.req.valid("param");
    const team = await teamService.getTeam(orgId, id);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/join
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const team = await teamService.joinTeam(orgId, id, endUserId);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/leave
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const team = await teamService.leaveTeam(orgId, id, endUserId);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/dissolve
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const team = await teamService.dissolveTeam(orgId, id, endUserId);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/kick/:userId
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id, userId } = c.req.valid("param");
    const team = await teamService.kickMember(orgId, id, endUserId, userId);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/transfer-leader
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { newLeaderUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const team = await teamService.transferLeader(orgId, id, endUserId, newLeaderUserId);
    return c.json(serializeTeam(team), 200);
  },
);

// PUT /teams/:id/status
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { status } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const team = await teamService.updateTeamStatus(orgId, id, endUserId, status);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /teams/:id/invite
teamClientRouter.openapi(
  createRoute({
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
          "application/json": { schema: InvitationResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { toUserId } = c.req.valid("json");
    const { id } = c.req.valid("param");
    const inv = await teamService.inviteUser(orgId, id, endUserId, toUserId);
    return c.json(serializeInvitation(inv), 201);
  },
);

// POST /invitations/:id/accept
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const team = await teamService.acceptInvitation(orgId, id, endUserId);
    return c.json(serializeTeam(team), 200);
  },
);

// POST /invitations/:id/reject
teamClientRouter.openapi(
  createRoute({
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
          "application/json": { schema: InvitationResponseSchema },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { id } = c.req.valid("param");
    const inv = await teamService.rejectInvitation(orgId, id, endUserId);
    return c.json(serializeInvitation(inv), 200);
  },
);

// POST /quick-match?configAlias=
teamClientRouter.openapi(
  createRoute({
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
        content: { "application/json": { schema: TeamResponseSchema } },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const orgId = c.get("clientCredential")!.organizationId;
    const endUserId = c.var.endUserId!;
    const { configAlias } = c.req.valid("query");
    const team = await teamService.quickMatch(orgId, configAlias, endUserId);
    return c.json(serializeTeam(team), 200);
  },
);
