import { z } from "@hono/zod-openapi";

import { MAIL_MULTICAST_MAX, MAIL_TARGET_TYPES } from "./types";

const ItemEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const TargetTypeSchema = z.enum(MAIL_TARGET_TYPES).openapi({
  description:
    "'broadcast' = visible to every end user in the org; " +
    "'multicast' = visible only to listed endUserIds (unicast = length 1).",
});

// ─── Create ─────────────────────────────────────────────────────

export const CreateMailSchema = z
  .object({
    title: z.string().min(1).max(200).openapi({ example: "Maintenance compensation" }),
    content: z.string().min(1).max(10_000).openapi({
      description: "Mail body. Tenant decides whether to render as markdown.",
    }),
    rewards: z.array(ItemEntrySchema).min(0).openapi({
      description: "Optional reward list. Empty = informational-only mail.",
    }),
    targetType: TargetTypeSchema,
    targetUserIds: z.array(z.string().min(1).max(256)).optional().openapi({
      description:
        `Required and 1..${MAIL_MULTICAST_MAX} when targetType='multicast'; ` +
        "must be omitted/null when targetType='broadcast'.",
    }),
    requireRead: z.boolean().optional().openapi({
      description:
        "When true, the user must hit the /read endpoint before /claim will succeed.",
    }),
    expiresAt: z.string().datetime().nullable().optional().openapi({
      description:
        "ISO-8601 timestamp. After this time the mail is hidden and no longer claimable. null/omitted = never expires.",
    }),
  })
  .openapi("MailCreateRequest");

export type CreateMailInput = z.input<typeof CreateMailSchema>;

/**
 * Internal (service-to-service) extension of CreateMailInput:
 * adds the programmatic idempotency pair. Not exposed to admin HTTP.
 */
export type ProgrammaticCreateMailInput = CreateMailInput & {
  originSource?: string;
  originSourceId?: string;
  senderAdminId?: string | null;
};

/** Convenience shape for `mailService.sendUnicast`. */
export type UnicastInput = Omit<CreateMailInput, "targetType" | "targetUserIds"> & {
  originSource: string;
  originSourceId: string;
};

// ─── List / query ──────────────────────────────────────────────

export const ListMailQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().openapi({
    param: { name: "limit", in: "query" },
  }),
  cursor: z.string().optional().openapi({
    param: { name: "cursor", in: "query" },
    description: "Opaque cursor from a previous response's `nextCursor`.",
  }),
  targetType: TargetTypeSchema.optional().openapi({
    param: { name: "targetType", in: "query" },
  }),
});

export const InboxQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
    description: "The end user whose inbox to load.",
  }),
  since: z.string().datetime().optional().openapi({
    param: { name: "since", in: "query" },
    description:
      "ISO-8601 timestamp. Broadcasts with sentAt < since are filtered out. " +
      "Typically set to the player's registration time so new users don't see historical broadcasts. " +
      "Multicasts are unaffected.",
  }),
  limit: z.coerce.number().int().min(1).max(200).optional().openapi({
    param: { name: "limit", in: "query" },
  }),
});

export const EndUserBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The end user's business id.",
      example: "user-42",
    }),
    userHash: z.string().optional().openapi({
      description: "HMAC-SHA256(endUserId, clientSecret).",
    }),
  })
  .openapi("MailEndUserRequest");

export const EndUserQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
  }),
});

// ─── Params ─────────────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Mail message UUID.",
  }),
});

// ─── Response schemas ───────────────────────────────────────────

export const MailMessageResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    title: z.string(),
    content: z.string(),
    rewards: z.array(ItemEntrySchema),
    targetType: TargetTypeSchema,
    targetUserIds: z.array(z.string()).nullable(),
    requireRead: z.boolean(),
    senderAdminId: z.string().nullable(),
    sentAt: z.string(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    originSource: z.string().nullable(),
    originSourceId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("MailMessage");

export const MailMessageWithStatsResponseSchema = MailMessageResponseSchema.extend({
  readCount: z.number().int(),
  claimCount: z.number().int(),
  targetCount: z.number().int().nullable(),
}).openapi("MailMessageWithStats");

export const MailListResponseSchema = z
  .object({
    items: z.array(MailMessageResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("MailList");

export const InboxItemResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    rewards: z.array(ItemEntrySchema),
    requireRead: z.boolean(),
    sentAt: z.string(),
    expiresAt: z.string().nullable(),
    readAt: z.string().nullable(),
    claimedAt: z.string().nullable(),
  })
  .openapi("MailInboxItem");

export const InboxListResponseSchema = z
  .object({
    items: z.array(InboxItemResponseSchema),
  })
  .openapi("MailInboxList");

export const ClaimResultResponseSchema = z
  .object({
    messageId: z.string(),
    endUserId: z.string(),
    rewards: z.array(ItemEntrySchema),
    claimedAt: z.string(),
    readAt: z.string().nullable(),
  })
  .openapi("MailClaimResult");

export const MailUserStateResponseSchema = z
  .object({
    messageId: z.string(),
    endUserId: z.string(),
    readAt: z.string().nullable(),
    claimedAt: z.string().nullable(),
  })
  .openapi("MailUserState");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("MailErrorResponse");
