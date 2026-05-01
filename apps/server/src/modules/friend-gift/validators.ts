import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";

import { pageOf } from "../../lib/pagination";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({
    description: "Arbitrary JSON blob for tenant-specific extensions.",
  });

const TimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .default("UTC")
  .openapi({
    description: "IANA timezone id, e.g. 'Asia/Shanghai'.",
    example: "Asia/Shanghai",
  });

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description:
      "Optional human-readable key, unique within the project.",
    example: "daily-flower",
  });

const GiftItemSchema = z.object({
  definitionId: z.string().min(1),
  quantity: z.number().int().positive(),
});

// ─── Settings schemas ────────────────────────────────────────────

export const UpsertSettingsSchema = z
  .object({
    dailySendLimit: z.number().int().positive().default(5).openapi({
      description: "Maximum number of gifts a user can send per day.",
      example: 5,
    }),
    dailyReceiveLimit: z.number().int().positive().default(10).openapi({
      description: "Maximum number of gifts a user can receive per day.",
      example: 10,
    }),
    timezone: TimezoneSchema.optional(),
    metadata: MetadataSchema,
  })
  .openapi("FriendGiftUpsertSettings");

export type UpsertSettingsInput = z.input<typeof UpsertSettingsSchema>;

// ─── Package schemas ─────────────────────────────────────────────

export const CreatePackageSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Flower Bouquet" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    giftItems: z.array(GiftItemSchema).min(1).openapi({
      description: "Items deducted from sender and granted to receiver.",
    }),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("FriendGiftCreatePackage");

export const UpdatePackageSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(500).nullable().optional(),
    giftItems: z.array(GiftItemSchema).min(1).optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("FriendGiftUpdatePackage");

export type CreatePackageInput = z.input<typeof CreatePackageSchema>;
export type UpdatePackageInput = z.input<typeof UpdatePackageSchema>;

// ─── Send gift schema ────────────────────────────────────────────

export const SendGiftSchema = z
  .object({
    packageId: z.string().uuid().openapi({
      description: "The gift package to send.",
    }),
    receiverUserId: z.string().min(1).max(256).openapi({
      description: "The receiver's end user id.",
      example: "user-99",
    }),
    message: z.string().max(500).nullable().optional().openapi({
      description: "Optional message attached to the gift.",
    }),
  })
  .openapi("FriendGiftSend");

export type SendGiftInput = z.input<typeof SendGiftSchema>;

// ─── Path/query param schemas ────────────────────────────────────

export const PackageIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Package id.",
  }),
});

export const SendIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "Gift send id.",
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

export const EndUserQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
    description: "The end user's business id.",
  }),
});

// ─── Response schemas ────────────────────────────────────────────

export const SettingsResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    dailySendLimit: z.number().int(),
    dailyReceiveLimit: z.number().int(),
    timezone: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendGiftSettings");

export const PackageResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    giftItems: z.array(GiftItemSchema),
    isActive: z.boolean(),
    sortOrder: FractionalKeySchema,
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendGiftPackage");

export const GiftSendResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    packageId: z.string().nullable(),
    senderUserId: z.string(),
    receiverUserId: z.string(),
    giftItems: z.array(GiftItemSchema),
    status: z.string(),
    claimedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    message: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendGiftSendRecord");

export const DailyStatusResponseSchema = z
  .object({
    dateKey: z.string(),
    sendCount: z.number().int(),
    receiveCount: z.number().int(),
    dailySendLimit: z.number().int(),
    dailyReceiveLimit: z.number().int(),
  })
  .openapi("FriendGiftDailyStatus");

export const PackageListResponseSchema = pageOf(PackageResponseSchema).openapi(
  "FriendGiftPackageList",
);

export const GiftSendListResponseSchema = pageOf(GiftSendResponseSchema).openapi(
  "FriendGiftSendList",
);


// ─── Client-route body schemas ───────────────────────────────────

export const ClientSendGiftSchema = z
  .object({
    endUserId: z.string().min(1).max(256).openapi({
      description: "The sender's end user id.",
    }),
    userHash: z.string().optional().openapi({
      description: "HMAC-SHA256(endUserId, clientSecret).",
    }),
    packageId: z.string().uuid().openapi({
      description: "The gift package to send.",
    }),
    receiverUserId: z.string().min(1).max(256).openapi({
      description: "The receiver's end user id.",
    }),
    message: z.string().max(500).nullable().optional(),
  })
  .openapi("ClientFriendGiftSend");

export const ClientClaimGiftSchema = z
  .object({
    endUserId: z.string().min(1).max(256),
    userHash: z.string().optional(),
  })
  .openapi("ClientFriendGiftClaim");
