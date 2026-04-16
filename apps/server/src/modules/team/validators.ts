/**
 * Zod schemas for the team module.
 *
 * Used for BOTH service input validation and HTTP request/response bodies.
 * `.openapi()` metadata is attached so Scalar auto-renders fields in `/docs`.
 */

import { z } from "@hono/zod-openapi";

import { INVITATION_STATUSES, MEMBER_ROLES, TEAM_STATUSES } from "./types";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message:
      "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description:
      "Optional human-readable key, unique within the organization.",
    example: "5v5-ranked",
  });

// ─── Config schemas ──────────────────────────────────────────────

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "5v5 Ranked" }),
    alias: AliasSchema.nullable().optional(),
    maxMembers: z.number().int().positive().max(100).default(4).openapi({
      description: "Maximum number of members in a team.",
      example: 5,
    }),
    autoDissolveOnLeaderLeave: z.boolean().default(false).openapi({
      description: "Dissolve team when leader leaves instead of transferring leadership.",
    }),
    allowQuickMatch: z.boolean().default(true).openapi({
      description: "Allow quick match to auto-join open teams.",
    }),
    metadata: MetadataSchema,
  })
  .openapi("TeamCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    maxMembers: z.number().int().positive().max(100).optional(),
    autoDissolveOnLeaderLeave: z.boolean().optional(),
    allowQuickMatch: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("TeamUpdateConfig");

export type CreateConfigInput = z.input<typeof CreateConfigSchema>;
export type UpdateConfigInput = z.input<typeof UpdateConfigSchema>;

// ─── Param / query schemas ───────────────────────────────────────

export const ConfigKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Config id or alias.",
    }),
});

export const TeamIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Team id.",
    }),
});

export const TeamIdAndUserParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Team id.",
    }),
  userId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "userId", in: "path" },
      description: "End user id to kick.",
    }),
});

export const InvitationIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "Invitation id.",
    }),
});

export const ConfigAliasQuerySchema = z.object({
  configAlias: z.string().min(1).openapi({
    param: { name: "configAlias", in: "query" },
    description: "Config id or alias.",
  }),
});

export const TeamListQuerySchema = z.object({
  configKey: z.string().min(1).optional().openapi({
    param: { name: "configKey", in: "query" },
    description: "Filter by config id or alias.",
  }),
  status: z.enum(TEAM_STATUSES).optional().openapi({
    param: { name: "status", in: "query" },
    description: "Filter by team status.",
  }),
  limit: z.coerce.number().int().positive().max(100).default(50).openapi({
    param: { name: "limit", in: "query" },
    description: "Page size.",
  }),
  offset: z.coerce.number().int().min(0).default(0).openapi({
    param: { name: "offset", in: "query" },
    description: "Pagination offset.",
  }),
});

// ─── Request body schemas ────────────────────────────────────────

export const CreateTeamSchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "5v5-ranked",
    }),
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id (becomes the team leader).",
      example: "user-42",
    }),
    userHash: z.string().optional().openapi({
      description: "HMAC-SHA256(endUserId, clientSecret).",
    }),
    metadata: MetadataSchema,
  })
  .openapi("TeamCreateTeam");

export const UpdateTeamStatusSchema = z
  .object({
    status: z.enum(["open", "closed", "in_game"]).openapi({
      description: "New team status. Cannot set to 'dissolved' — use dissolve endpoint.",
    }),
    endUserId: z.string().min(1).max(256).openapi({
      description: "The leader's end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamUpdateStatus");

export const InviteSchema = z
  .object({
    fromUserId: z.string().min(1).max(256).openapi({
      description: "Inviter end user id.",
    }),
    toUserId: z.string().min(1).max(256).openapi({
      description: "Invitee end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamInvite");

export const JoinTeamSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamJoinRequest");

export const LeaveTeamSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamLeaveRequest");

export const DissolveTeamSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The leader's end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamDissolveRequest");

export const KickMemberSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The leader's (kicker's) end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamKickRequest");

export const TransferLeaderSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The current leader's end user id.",
    }),
    newLeaderUserId: z.string().min(1).max(256).openapi({
      description: "The new leader's end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamTransferLeader");

export const AcceptInvitationSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The invitee's end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamAcceptInvitation");

export const RejectInvitationSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The invitee's end user id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamRejectInvitation");

export const QuickMatchQuerySchema = z.object({
  configAlias: z.string().min(1).openapi({
    param: { name: "configAlias", in: "query" },
    description: "Config id or alias.",
  }),
});

export const QuickMatchSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
    }),
    userHash: z.string().optional(),
  })
  .openapi("TeamQuickMatchRequest");

// ─── Response schemas ────────────────────────────────────────────

export const ConfigResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    maxMembers: z.number().int(),
    autoDissolveOnLeaderLeave: z.boolean(),
    allowQuickMatch: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TeamConfig");

export const MemberResponseSchema = z
  .object({
    teamId: z.string(),
    endUserId: z.string(),
    organizationId: z.string(),
    role: z.enum(MEMBER_ROLES),
    joinedAt: z.string(),
  })
  .openapi("TeamMember");

export const TeamResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    configId: z.string(),
    leaderUserId: z.string(),
    status: z.enum(TEAM_STATUSES),
    memberCount: z.number().int(),
    dissolvedAt: z.string().nullable(),
    version: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    members: z.array(MemberResponseSchema).optional(),
  })
  .openapi("Team");

export const InvitationResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    teamId: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    status: z.enum(INVITATION_STATUSES),
    expiresAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TeamInvitation");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("TeamErrorResponse");

export const ConfigListResponseSchema = z
  .object({
    items: z.array(ConfigResponseSchema),
  })
  .openapi("TeamConfigList");

export const TeamListResponseSchema = z
  .object({
    items: z.array(TeamResponseSchema),
    total: z.number().int(),
  })
  .openapi("TeamList");
