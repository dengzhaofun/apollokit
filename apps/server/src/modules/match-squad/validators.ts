/**
 * Zod schemas for the match-squad module.
 *
 * Used for BOTH service input validation and HTTP request/response bodies.
 * `.openapi()` metadata is attached so Scalar auto-renders fields in `/docs`.
 */

import { z } from "@hono/zod-openapi";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { matchSquads } from "../../schema/match-squad";
import { INVITATION_STATUSES, MEMBER_ROLES, MATCH_SQUAD_STATUSES } from "./types";

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
      "Optional human-readable key, unique within the project.",
    example: "5v5-ranked",
  });

// ─── Config schemas ──────────────────────────────────────────────

export const CreateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "5v5 Ranked" }),
    alias: AliasSchema.nullable().optional(),
    maxMembers: z.number().int().positive().max(100).default(4).openapi({
      description: "Maximum number of members in a squad.",
      example: 5,
    }),
    autoDissolveOnLeaderLeave: z.boolean().default(false).openapi({
      description: "Dissolve squad when leader leaves instead of transferring leadership.",
    }),
    allowQuickMatch: z.boolean().default(true).openapi({
      description: "Allow quick match to auto-join open teams.",
    }),
    metadata: MetadataSchema,
  })
  .openapi("MatchSquadCreateConfig");

export const UpdateConfigSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    maxMembers: z.number().int().positive().max(100).optional(),
    autoDissolveOnLeaderLeave: z.boolean().optional(),
    allowQuickMatch: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("MatchSquadUpdateConfig");

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
      description: "MatchSquad id.",
    }),
});

export const TeamIdAndUserParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      description: "MatchSquad id.",
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

/**
 * MatchSquad list filter — `configKey` is an id-or-alias that the service
 * resolves into `configId` via `loadConfigByKey` (an async DB call,
 * not a static column lookup), so it's NOT part of the DSL spec; it
 * stays as a hand-written WHERE in the service. Only `status` (a
 * direct enum column) goes through the DSL here.
 */
export const matchSquadFilters = defineListFilter({
  status: f.enumOf(MATCH_SQUAD_STATUSES, { column: matchSquads.status }),
}).build();

const ConfigKeyQueryFragment = z.object({
  configKey: z.string().min(1).optional().openapi({
    param: { name: "configKey", in: "query" },
    description: "Filter by config id or alias.",
  }),
});

export const TeamListQuerySchema = matchSquadFilters.querySchema
  .merge(ConfigKeyQueryFragment)
  .openapi("MatchSquadListQuery");

// ─── Request body schemas ────────────────────────────────────────

export const CreateTeamSchema = z
  .object({
    configKey: z.string().min(1).openapi({
      description: "Config id or alias.",
      example: "5v5-ranked",
    }),
    metadata: MetadataSchema,
  })
  .openapi("MatchSquadCreate");

export const UpdateTeamStatusSchema = z
  .object({
    status: z.enum(["open", "closed", "in_game"]).openapi({
      description: "New squad status. Cannot set to 'dissolved' — use dissolve endpoint.",
    }),
  })
  .openapi("MatchSquadUpdateStatus");

export const InviteSchema = z
  .object({
    toUserId: z.string().min(1).max(256).openapi({
      description: "Invitee end user id.",
    }),
  })
  .openapi("MatchSquadInvite");

export const QuickMatchQuerySchema = z.object({
  configAlias: z.string().min(1).openapi({
    param: { name: "configAlias", in: "query" },
    description: "Config id or alias.",
  }),
});

export const TransferLeaderSchema = z
  .object({
    newLeaderUserId: z.string().min(1).max(256).openapi({
      description: "The new leader's end user id.",
    }),
  })
  .openapi("MatchSquadTransferLeader");

// ─── Response schemas ────────────────────────────────────────────

export const ConfigResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    maxMembers: z.number().int(),
    autoDissolveOnLeaderLeave: z.boolean(),
    allowQuickMatch: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("MatchSquadConfig");

export const MemberResponseSchema = z
  .object({
    squadId: z.string(),
    endUserId: z.string(),
    tenantId: z.string(),
    role: z.enum(MEMBER_ROLES),
    joinedAt: z.string(),
  })
  .openapi("MatchSquadMember");

export const TeamResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    configId: z.string(),
    leaderUserId: z.string(),
    status: z.enum(MATCH_SQUAD_STATUSES),
    memberCount: z.number().int(),
    dissolvedAt: z.string().nullable(),
    version: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    members: z.array(MemberResponseSchema).optional(),
  })
  .openapi("MatchSquad");

export const InvitationResponseSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    squadId: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    status: z.enum(INVITATION_STATUSES),
    expiresAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("MatchSquadInvitation");


export const ConfigListResponseSchema = pageOf(ConfigResponseSchema).openapi(
  "TeamConfigList",
);

export const TeamListResponseSchema = pageOf(TeamResponseSchema).openapi("MatchSquadList");
