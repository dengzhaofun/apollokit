/**
 * Zod schemas for the guild module.
 *
 * Used for BOTH service input validation and HTTP request/response bodies.
 * `.openapi()` metadata is attached so Scalar auto-renders fields in `/docs`.
 */

import { z } from "@hono/zod-openapi";

import { pageOf } from "../../lib/pagination";
import { GUILD_ROLES, JOIN_MODES, REQUEST_STATUSES, REQUEST_TYPES } from "./types";

// ─── Shared building blocks ────────────────────────────────────────

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const CostItemSchema = z.object({
  definitionId: z.string(),
  quantity: z.number().int().positive(),
});

const LevelUpRuleSchema = z.object({
  level: z.number().int().positive(),
  expRequired: z.number().int().nonnegative(),
  memberCapBonus: z.number().int().nonnegative(),
});

const JoinModeSchema = z
  .enum(JOIN_MODES)
  .openapi({ description: "open = anyone can join, request = approval needed, closed = no new members." });

// ─── Settings ──────────────────────────────────────────────────────

export const UpsertSettingsSchema = z
  .object({
    maxMembers: z.number().int().positive().optional().openapi({ example: 50 }),
    maxOfficers: z.number().int().positive().optional().openapi({ example: 5 }),
    createCost: z.array(CostItemSchema).optional(),
    levelUpRules: z.array(LevelUpRuleSchema).nullable().optional(),
    joinMode: JoinModeSchema.optional(),
    metadata: MetadataSchema,
  })
  .openapi("GuildUpsertSettings");

export type UpsertSettingsInput = z.input<typeof UpsertSettingsSchema>;

export const GuildSettingsResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    maxMembers: z.number().int(),
    maxOfficers: z.number().int(),
    createCost: z.array(CostItemSchema),
    levelUpRules: z.array(LevelUpRuleSchema).nullable(),
    joinMode: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("GuildSettings");

// ─── Guild CRUD ────────────────────────────────────────────────────

export const CreateGuildSchema = z
  .object({
    name: z.string().min(1).max(64).openapi({ example: "Dragon Slayers" }),
    description: z.string().max(500).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    joinMode: JoinModeSchema.optional(),
    metadata: MetadataSchema,
  })
  .openapi("GuildCreate");

export type CreateGuildInput = z.input<typeof CreateGuildSchema>;

export const UpdateGuildSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    description: z.string().max(500).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    announcement: z.string().max(2000).nullable().optional(),
    joinMode: JoinModeSchema.optional(),
    metadata: MetadataSchema,
  })
  .openapi("GuildUpdate");

export type UpdateGuildInput = z.input<typeof UpdateGuildSchema>;

export const GuildResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    announcement: z.string().nullable(),
    leaderUserId: z.string(),
    level: z.number().int(),
    experience: z.number().int(),
    memberCount: z.number().int(),
    maxMembers: z.number().int(),
    joinMode: z.string(),
    isActive: z.boolean(),
    disbandedAt: z.string().nullable(),
    version: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Guild");

export const GuildListResponseSchema = pageOf(GuildResponseSchema).openapi("GuildList");

// ─── Members ───────────────────────────────────────────────────────

export const GuildMemberResponseSchema = z
  .object({
    guildId: z.string(),
    endUserId: z.string(),
    organizationId: z.string(),
    role: z.enum(GUILD_ROLES),
    contribution: z.number().int(),
    joinedAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("GuildMember");

export const GuildMemberListResponseSchema = z
  .object({
    items: z.array(GuildMemberResponseSchema),
  })
  .openapi("GuildMemberList");

// ─── Join Requests ─────────────────────────────────────────────────

export const JoinRequestResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    guildId: z.string(),
    endUserId: z.string(),
    type: z.enum(REQUEST_TYPES),
    status: z.enum(REQUEST_STATUSES),
    invitedBy: z.string().nullable(),
    message: z.string().nullable(),
    respondedAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("GuildJoinRequest");

export const JoinRequestListResponseSchema = z
  .object({
    items: z.array(JoinRequestResponseSchema),
  })
  .openapi("GuildJoinRequestList");

// ─── Contribution Logs ─────────────────────────────────────────────

export const ContributionLogResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    guildId: z.string(),
    endUserId: z.string(),
    delta: z.number().int(),
    guildExpDelta: z.number().int(),
    source: z.string(),
    sourceId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("GuildContributionLog");

export const ContributionLogListResponseSchema = z
  .object({
    items: z.array(ContributionLogResponseSchema),
  })
  .openapi("GuildContributionLogList");

// ─── Action schemas ────────────────────────────────────────────────

export const GrantExpSchema = z
  .object({
    amount: z.number().int().positive().openapi({ example: 100 }),
    source: z.string().min(1).max(128).openapi({ example: "admin_grant" }),
    sourceId: z.string().max(256).nullable().optional(),
  })
  .openapi("GuildGrantExp");

export const ContributeSchema = z
  .object({
    delta: z.number().int().positive().openapi({ example: 10 }),
    source: z.string().min(1).max(128).openapi({ example: "quest_complete" }),
    sourceId: z.string().max(256).nullable().optional(),
  })
  .openapi("GuildContribute");

export const ApplyToJoinSchema = z
  .object({
    message: z.string().max(500).nullable().optional(),
  })
  .openapi("GuildApplyToJoin");

export const InviteUserSchema = z
  .object({
    targetUserId: z.string().min(1).max(256).openapi({ example: "user-99" }),
  })
  .openapi("GuildInviteUser");

export const TransferLeaderSchema = z
  .object({
    newLeaderUserId: z.string().min(1).max(256).openapi({ example: "user-99" }),
  })
  .openapi("GuildTransferLeader");

// ─── Param / Query schemas ─────────────────────────────────────────

export const GuildIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Guild id (UUID).",
  }),
});

export const RequestIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Join request id (UUID).",
  }),
});

export const MemberUserIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Guild id (UUID).",
  }),
  userId: z.string().min(1).openapi({
    param: { name: "userId", in: "path" },
    description: "Target end user id.",
  }),
});

export const GuildListQuerySchema = z.object({
  search: z.string().optional().openapi({
    param: { name: "search", in: "query" },
    description: "Search by guild name (legacy alias for q).",
  }),
  q: z.string().optional().openapi({ param: { name: "q", in: "query" } }),
  cursor: z.string().optional().openapi({ param: { name: "cursor", in: "query" } }),
  limit: z.coerce.number().int().min(1).max(200).optional().openapi({
    param: { name: "limit", in: "query" },
  }),
});

export const ContributionListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 50))
    .openapi({
      param: { name: "limit", in: "query" },
      description: "Page size (default 50).",
    }),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0))
    .openapi({
      param: { name: "offset", in: "query" },
      description: "Pagination offset (default 0).",
    }),
});

export const JoinRequestListQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional().openapi({
    param: { name: "status", in: "query" },
    description: "Filter by status (default: pending).",
  }),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 50))
    .openapi({
      param: { name: "limit", in: "query" },
      description: "Page size (default 50).",
    }),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0))
    .openapi({
      param: { name: "offset", in: "query" },
      description: "Pagination offset (default 0).",
    }),
});

// ─── Client route schemas ──────────────────────────────────────────

export const ClientEndUserBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({ example: "user-42" }),
    userHash: z.string().optional().openapi({
      description: "HMAC-SHA256(endUserId, clientSecret). Required unless dev mode is enabled.",
    }),
  })
  .openapi("ClientEndUserBody");

export const ClientEndUserHeaderSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "x-end-user-id", in: "header" },
    description: "End user id.",
  }),
  userHash: z.string().optional().openapi({
    param: { name: "x-user-hash", in: "header" },
    description: "HMAC-SHA256(endUserId, clientSecret).",
  }),
});

