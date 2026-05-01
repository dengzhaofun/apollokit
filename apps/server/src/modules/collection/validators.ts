/**
 * Zod schemas for the collection module.
 *
 * Shared between HTTP validation (routes.ts / client-routes.ts) and
 * service-layer input typing (`z.input<typeof ...>` below). `.openapi()`
 * metadata is attached so the Scalar UI at /docs renders helpful fields.
 *
 * Cross-field validation lives on `.superRefine()` because Zod's field
 * rules can't see sibling values — specifically, milestone `scope` must
 * be consistent with whether `groupId` / `entryId` is filled.
 */

import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";

import { pageOf } from "../../lib/pagination";
import { ALBUM_SCOPES, MILESTONE_SCOPES, TRIGGER_TYPES } from "./types";

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
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description: "Optional human-readable key, unique within its parent.",
    example: "dragons",
  });

const AlbumScopeSchema = z
  .enum(ALBUM_SCOPES)
  .openapi({
    description:
      "Display classification for the album. Non-semantic — affects UI only.",
  });

const TriggerTypeSchema = z.enum(TRIGGER_TYPES).openapi({
  description:
    "How entries unlock. Only 'item' is implemented in MVP; 'event' is reserved.",
});

const MilestoneScopeSchema = z.enum(MILESTONE_SCOPES).openapi({
  description:
    "Milestone granularity: 'entry' (per-card), 'group' (per-chapter), 'album' (per-book).",
});

const RewardItemSchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

// ─── Album ────────────────────────────────────────────────────────

export const CreateAlbumSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Dragon Codex" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().max(1024).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    scope: AlbumScopeSchema.optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionCreateAlbum");

export const UpdateAlbumSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    coverImage: z.string().max(1024).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    scope: AlbumScopeSchema.optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionUpdateAlbum");

// ─── Group ────────────────────────────────────────────────────────

export const CreateGroupSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionCreateGroup");

export const UpdateGroupSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionUpdateGroup");

// ─── Entry ────────────────────────────────────────────────────────

export const CreateEntrySchema = z
  .object({
    groupId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    image: z.string().max(1024).nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    hiddenUntilUnlocked: z.boolean().optional(),
    triggerType: TriggerTypeSchema.optional(),
    triggerItemDefinitionId: z.string().uuid().nullable().optional(),
    triggerQuantity: z.number().int().positive().optional(),
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    // MVP: trigger='item' requires triggerItemDefinitionId. 'event' is a
    // reserved future path — reject it explicitly so callers don't think
    // it works silently.
    const type = val.triggerType ?? "item";
    if (type === "event") {
      ctx.addIssue({
        code: "custom",
        path: ["triggerType"],
        message: "triggerType='event' is reserved and not yet implemented",
      });
    }
    if (type === "item" && !val.triggerItemDefinitionId) {
      ctx.addIssue({
        code: "custom",
        path: ["triggerItemDefinitionId"],
        message: "triggerItemDefinitionId is required when triggerType='item'",
      });
    }
  })
  .openapi("CollectionCreateEntry");

/** Bulk-create variant: body is an array of CreateEntry inputs. */
export const BulkCreateEntriesSchema = z
  .object({
    entries: z.array(CreateEntrySchema).min(1).max(500).openapi({
      description: "Batch of entries to create under this album.",
    }),
  })
  .openapi("CollectionBulkCreateEntries");

export const UpdateEntrySchema = z
  .object({
    groupId: z.string().uuid().nullable().optional(),
    alias: AliasSchema.nullable().optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    image: z.string().max(1024).nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    hiddenUntilUnlocked: z.boolean().optional(),
    triggerType: TriggerTypeSchema.optional(),
    triggerItemDefinitionId: z.string().uuid().nullable().optional(),
    triggerQuantity: z.number().int().positive().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionUpdateEntry");

// ─── Milestone ────────────────────────────────────────────────────

export const CreateMilestoneSchema = z
  .object({
    scope: MilestoneScopeSchema,
    groupId: z.string().uuid().nullable().optional(),
    entryId: z.string().uuid().nullable().optional(),
    threshold: z.number().int().positive().optional(),
    label: z.string().max(200).nullable().optional(),
    rewardItems: z.array(RewardItemSchema).min(1),
    autoClaim: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .superRefine((val, ctx) => {
    // Scope must match which FK is filled.
    if (val.scope === "entry") {
      if (!val.entryId) {
        ctx.addIssue({
          code: "custom",
          path: ["entryId"],
          message: "entryId is required when scope='entry'",
        });
      }
      if (val.groupId) {
        ctx.addIssue({
          code: "custom",
          path: ["groupId"],
          message: "groupId must not be set when scope='entry'",
        });
      }
    } else if (val.scope === "group") {
      if (!val.groupId) {
        ctx.addIssue({
          code: "custom",
          path: ["groupId"],
          message: "groupId is required when scope='group'",
        });
      }
      if (val.entryId) {
        ctx.addIssue({
          code: "custom",
          path: ["entryId"],
          message: "entryId must not be set when scope='group'",
        });
      }
    } else if (val.scope === "album") {
      if (val.groupId || val.entryId) {
        ctx.addIssue({
          code: "custom",
          path: ["scope"],
          message:
            "album-scope milestones must not set groupId or entryId",
        });
      }
    }
  })
  .openapi("CollectionCreateMilestone");

export const UpdateMilestoneSchema = z
  .object({
    threshold: z.number().int().positive().optional(),
    label: z.string().max(200).nullable().optional(),
    rewardItems: z.array(RewardItemSchema).min(1).optional(),
    autoClaim: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("CollectionUpdateMilestone");

// ─── Shared input types ───────────────────────────────────────────

export type CreateAlbumInput = z.input<typeof CreateAlbumSchema>;
export type UpdateAlbumInput = z.input<typeof UpdateAlbumSchema>;
export type CreateGroupInput = z.input<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.input<typeof UpdateGroupSchema>;
export type CreateEntryInput = z.input<typeof CreateEntrySchema>;
export type UpdateEntryInput = z.input<typeof UpdateEntrySchema>;
export type CreateMilestoneInput = z.input<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.input<typeof UpdateMilestoneSchema>;

// ─── Param schemas ────────────────────────────────────────────────

export const AlbumKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .openapi({
      param: { name: "key", in: "path" },
      description: "Album id or alias.",
    }),
});

export const AlbumIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const GroupIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const EntryIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const MilestoneIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const ClientAlbumKeyParamSchema = z.object({
  key: z.string().min(1).openapi({ param: { name: "key", in: "path" } }),
});

export const ClientMilestoneIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

// ─── Response schemas ─────────────────────────────────────────────

export const AlbumResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    coverImage: z.string().nullable(),
    icon: z.string().nullable(),
    scope: z.string(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CollectionAlbum");

export const AlbumListResponseSchema = pageOf(AlbumResponseSchema).openapi(
  "CollectionAlbumList",
);

export const GroupResponseSchema = z
  .object({
    id: z.string(),
    albumId: z.string(),
    organizationId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: FractionalKeySchema,
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CollectionGroup");

export const GroupListResponseSchema = z
  .object({
    items: z.array(GroupResponseSchema),
  })
  .openapi("CollectionGroupList");

export const EntryResponseSchema = z
  .object({
    id: z.string(),
    albumId: z.string(),
    groupId: z.string().nullable(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    rarity: z.string().nullable(),
    sortOrder: FractionalKeySchema,
    hiddenUntilUnlocked: z.boolean(),
    triggerType: z.string(),
    triggerItemDefinitionId: z.string().nullable(),
    triggerQuantity: z.number().int(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CollectionEntry");

export const EntryListResponseSchema = z
  .object({
    items: z.array(EntryResponseSchema),
  })
  .openapi("CollectionEntryList");

export const MilestoneResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    albumId: z.string(),
    scope: z.string(),
    groupId: z.string().nullable(),
    entryId: z.string().nullable(),
    threshold: z.number().int(),
    label: z.string().nullable(),
    rewardItems: z.array(RewardItemSchema),
    autoClaim: z.boolean(),
    sortOrder: FractionalKeySchema,
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CollectionMilestone");

export const MilestoneListResponseSchema = z
  .object({
    items: z.array(MilestoneResponseSchema),
  })
  .openapi("CollectionMilestoneList");

/** Entry rendered from the client side — redacts name/description/image
 *  when `hiddenUntilUnlocked=true` AND the entry is locked for this user. */
export const ClientEntryViewSchema = z
  .object({
    id: z.string(),
    albumId: z.string(),
    groupId: z.string().nullable(),
    alias: z.string().nullable(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    rarity: z.string().nullable(),
    sortOrder: FractionalKeySchema,
    hidden: z.boolean(),
    unlocked: z.boolean(),
    unlockedAt: z.string().nullable(),
  })
  .openapi("CollectionClientEntryView");

export const ClientMilestoneViewSchema = z
  .object({
    id: z.string(),
    scope: z.string(),
    groupId: z.string().nullable(),
    entryId: z.string().nullable(),
    threshold: z.number().int(),
    label: z.string().nullable(),
    rewardItems: z.array(RewardItemSchema),
    autoClaim: z.boolean(),
    sortOrder: FractionalKeySchema,
    unlockedCount: z.number().int(),
    reached: z.boolean(),
    claimed: z.boolean(),
    claimedAt: z.string().nullable(),
    deliveryMode: z.string().nullable(),
  })
  .openapi("CollectionClientMilestoneView");

export const ClientAlbumDetailSchema = z
  .object({
    album: AlbumResponseSchema,
    groups: z.array(GroupResponseSchema),
    entries: z.array(ClientEntryViewSchema),
    milestones: z.array(ClientMilestoneViewSchema),
    totals: z.object({
      entryCount: z.number().int(),
      unlockedCount: z.number().int(),
      unclaimedMilestones: z.number().int(),
    }),
  })
  .openapi("CollectionClientAlbumDetail");

export const ClientAlbumSummarySchema = z
  .object({
    album: AlbumResponseSchema,
    entryCount: z.number().int(),
    unlockedCount: z.number().int(),
    unclaimedMilestones: z.number().int(),
  })
  .openapi("CollectionClientAlbumSummary");

export const ClientAlbumListResponseSchema = z
  .object({
    items: z.array(ClientAlbumSummarySchema),
  })
  .openapi("CollectionClientAlbumList");

export const SyncResponseSchema = z
  .object({
    unlocked: z.array(z.string().uuid()).openapi({
      description: "Entry ids that were newly unlocked by this sync.",
    }),
  })
  .openapi("CollectionSyncResponse");

export const ClaimResponseSchema = z
  .object({
    milestoneId: z.string(),
    grantedItems: z.array(RewardItemSchema),
    claimedAt: z.string(),
  })
  .openapi("CollectionClaimResponse");

export const StatsResponseSchema = z
  .object({
    albumId: z.string(),
    totalEndUsers: z.number().int(),
    entries: z.array(
      z.object({
        entryId: z.string(),
        name: z.string(),
        unlockedCount: z.number().int(),
      }),
    ),
    milestones: z.array(
      z.object({
        milestoneId: z.string(),
        scope: z.string(),
        threshold: z.number().int(),
        claimedCount: z.number().int(),
      }),
    ),
  })
  .openapi("CollectionStats");

export const RescanBodySchema = z
  .object({
    endUserId: z.string().min(1).max(256),
  })
  .openapi("CollectionRescanBody");

