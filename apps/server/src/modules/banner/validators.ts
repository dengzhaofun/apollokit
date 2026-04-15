import { z } from "@hono/zod-openapi";

import { LinkActionSchema } from "../link/validators";
import {
  BANNER_LAYOUTS,
  BANNER_MULTICAST_MAX,
  BANNER_TARGET_TYPES,
} from "./types";

const AliasSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, {
    message: "alias must be lowercase alphanumeric plus '-' or '_'",
  });

const TargetTypeSchema = z.enum(BANNER_TARGET_TYPES).openapi({
  description:
    "'broadcast' = visible to every end user; 'multicast' = visible only to listed endUserIds.",
});

const LayoutSchema = z.enum(BANNER_LAYOUTS);

// ─── Banner group schemas ───────────────────────────────────────

export const CreateBannerGroupSchema = z
  .object({
    alias: AliasSchema.nullable().optional().openapi({
      description:
        "Organization-scoped slug for client lookup. A group without an " +
        "alias is effectively a draft — client API can't resolve it.",
      example: "home-main",
    }),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    layout: LayoutSchema.optional(),
    intervalMs: z.number().int().min(500).max(60_000).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("BannerGroupCreateRequest");

export const UpdateBannerGroupSchema = CreateBannerGroupSchema.partial().openapi(
  "BannerGroupUpdateRequest",
);

export type CreateBannerGroupInput = z.input<typeof CreateBannerGroupSchema>;
export type UpdateBannerGroupInput = z.input<typeof UpdateBannerGroupSchema>;

// ─── Banner schemas ─────────────────────────────────────────────

export const CreateBannerSchema = z
  .object({
    title: z.string().min(1).max(200),
    imageUrlMobile: z.string().url().max(2048),
    imageUrlDesktop: z.string().url().max(2048),
    altText: z.string().max(500).nullable().optional(),
    linkAction: LinkActionSchema,
    sortOrder: z.number().int().optional(),
    visibleFrom: z.string().datetime().nullable().optional(),
    visibleUntil: z.string().datetime().nullable().optional(),
    targetType: TargetTypeSchema.optional(),
    targetUserIds: z
      .array(z.string().min(1).max(256))
      .max(BANNER_MULTICAST_MAX)
      .nullable()
      .optional()
      .openapi({
        description:
          `Required and 1..${BANNER_MULTICAST_MAX} when targetType='multicast'; ` +
          "must be omitted/null when targetType='broadcast'.",
      }),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi("BannerCreateRequest");

export const UpdateBannerSchema = CreateBannerSchema.partial().openapi(
  "BannerUpdateRequest",
);

export type CreateBannerInput = z.input<typeof CreateBannerSchema>;
export type UpdateBannerInput = z.input<typeof UpdateBannerSchema>;

// ─── Reorder schema ─────────────────────────────────────────────

export const ReorderBannersSchema = z
  .object({
    /**
     * The complete, ordered list of banner ids in the group. Service layer
     * verifies it exactly matches the current membership — partial reorders
     * must still send the full set (prevents drift / duplicate sortOrders).
     */
    bannerIds: z.array(z.string().uuid()).min(1),
  })
  .openapi("BannerReorderRequest");

export type ReorderBannersInput = z.input<typeof ReorderBannersSchema>;

// ─── Params / path ─────────────────────────────────────────────

export const IdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
  }),
});

export const GroupIdParamSchema = z.object({
  groupId: z.string().uuid().openapi({
    param: { name: "groupId", in: "path" },
  }),
});

export const GroupAliasParamSchema = z.object({
  alias: AliasSchema.openapi({
    param: { name: "alias", in: "path" },
  }),
});

// ─── Client queries ────────────────────────────────────────────

export const ClientGroupQuerySchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "query" },
    description: "Required for multicast visibility evaluation.",
  }),
});

// ─── Response shapes (admin) ───────────────────────────────────

export const BannerGroupResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    layout: LayoutSchema,
    intervalMs: z.number().int(),
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("BannerGroup");

export const BannerResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    groupId: z.string(),
    title: z.string(),
    imageUrlMobile: z.string(),
    imageUrlDesktop: z.string(),
    altText: z.string().nullable(),
    linkAction: LinkActionSchema,
    sortOrder: z.number().int(),
    visibleFrom: z.string().nullable(),
    visibleUntil: z.string().nullable(),
    targetType: TargetTypeSchema,
    targetUserIds: z.array(z.string()).nullable(),
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Banner");

export const BannerGroupListResponseSchema = z
  .object({
    items: z.array(BannerGroupResponseSchema),
  })
  .openapi("BannerGroupList");

export const BannerListResponseSchema = z
  .object({
    items: z.array(BannerResponseSchema),
  })
  .openapi("BannerList");

// ─── Response shapes (client) ──────────────────────────────────

export const ClientBannerResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    imageUrlMobile: z.string(),
    imageUrlDesktop: z.string(),
    altText: z.string().nullable(),
    linkAction: LinkActionSchema,
    sortOrder: z.number().int(),
  })
  .openapi("ClientBanner");

export const ClientBannerGroupResponseSchema = z
  .object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    layout: LayoutSchema,
    intervalMs: z.number().int(),
    banners: z.array(ClientBannerResponseSchema),
  })
  .openapi("ClientBannerGroup");

// ─── Error response ─────────────────────────────────────────────

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("BannerErrorResponse");
