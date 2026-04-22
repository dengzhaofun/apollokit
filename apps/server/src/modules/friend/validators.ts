import { z } from "@hono/zod-openapi";

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

// ─── Settings schemas ────────────────────────────────────────────

export const UpsertSettingsSchema = z
  .object({
    maxFriends: z.number().int().positive().default(50).openapi({
      description: "Maximum number of friends per user.",
      example: 50,
    }),
    maxBlocked: z.number().int().positive().default(50).openapi({
      description: "Maximum number of blocked users per user.",
      example: 50,
    }),
    maxPendingRequests: z.number().int().positive().default(20).openapi({
      description: "Maximum number of outgoing pending requests per user.",
      example: 20,
    }),
    metadata: MetadataSchema,
  })
  .openapi("FriendUpsertSettings");

export type UpsertSettingsInput = z.input<typeof UpsertSettingsSchema>;

// ─── Request schemas ─────────────────────────────────────────────

export const SendRequestSchema = z
  .object({
    toUserId: z.string().min(1).max(256).openapi({
      description: "The target end user's business id.",
      example: "user-99",
    }),
    message: z.string().max(500).nullable().optional().openapi({
      description: "Optional message attached to the request.",
    }),
  })
  .openapi("FriendSendRequest");

export const BlockUserSchema = z
  .object({
    blockedUserId: z.string().min(1).max(256).openapi({
      description: "The end user to block.",
      example: "user-99",
    }),
  })
  .openapi("FriendBlockUser");

// ─── Path/query param schemas ────────────────────────────────────

export const RequestIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Friend request id.",
  }),
});

export const RelationshipIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Friend relationship id.",
  }),
});

export const BlockedUserIdParamSchema = z.object({
  blockedUserId: z.string().min(1).openapi({
    param: { name: "blockedUserId", in: "path" },
    description: "The blocked user's id.",
  }),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
    param: { name: "limit", in: "query" },
    description: "Page size (1-100).",
  }),
  offset: z.coerce.number().int().min(0).default(0).openapi({
    param: { name: "offset", in: "query" },
    description: "Number of items to skip.",
  }),
});

export const MutualFriendsQuerySchema = z.object({
  withUserId: z.string().min(1).max(256).openapi({
    param: { name: "withUserId", in: "query" },
    description: "The other end user to compare against.",
  }),
});

// ─── Response schemas ────────────────────────────────────────────

export const FriendSettingsResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    maxFriends: z.number().int(),
    maxBlocked: z.number().int(),
    maxPendingRequests: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendSettings");

export const FriendRelationshipResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    userA: z.string(),
    userB: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
  })
  .openapi("FriendRelationship");

export const FriendRequestResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    status: z.string(),
    message: z.string().nullable(),
    respondedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendRequest");

export const FriendBlockResponseSchema = z
  .object({
    organizationId: z.string(),
    blockerUserId: z.string(),
    blockedUserId: z.string(),
    createdAt: z.string(),
  })
  .openapi("FriendBlock");

export const FriendRelationshipListSchema = z
  .object({
    items: z.array(FriendRelationshipResponseSchema),
    total: z.number().int(),
  })
  .openapi("FriendRelationshipList");

export const FriendRequestListSchema = z
  .object({
    items: z.array(FriendRequestResponseSchema),
  })
  .openapi("FriendRequestList");

export const FriendBlockListSchema = z
  .object({
    items: z.array(FriendBlockResponseSchema),
  })
  .openapi("FriendBlockList");


// ─── Client-route body schemas ───────────────────────────────────

export const ClientSendRequestSchema = z
  .object({
    toUserId: z.string().min(1).max(256).openapi({
      description: "The target end user id.",
    }),
    message: z.string().max(500).nullable().optional(),
  })
  .openapi("ClientFriendSendRequest");

export const ClientBlockSchema = z
  .object({
    blockedUserId: z.string().min(1).max(256),
  })
  .openapi("ClientFriendBlock");
