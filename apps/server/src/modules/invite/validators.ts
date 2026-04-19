import { z } from "@hono/zod-openapi";

/* ─── Settings I/O ─────────────────────────────────────────────── */

export const UpsertInviteSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    codeLength: z
      .number()
      .int()
      .min(4)
      .max(24)
      .refine((n) => n % 4 === 0, { message: "codeLength must be a multiple of 4" })
      .optional(),
    allowSelfInvite: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("UpsertInviteSettingsInput");

export type UpsertInviteSettingsInput = z.infer<typeof UpsertInviteSettingsSchema>;

export const InviteSettingsViewSchema = z
  .object({
    organizationId: z.string(),
    enabled: z.boolean(),
    codeLength: z.number().int(),
    allowSelfInvite: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("InviteSettingsView");

/* ─── Code I/O ─────────────────────────────────────────────────── */

export const InviteCodeViewSchema = z
  .object({
    code: z.string().openapi({ description: "Human-readable form with dashes, e.g. ABCD-EFGH" }),
    rotatedAt: z.string().nullable(),
  })
  .openapi("InviteCodeView");

/* ─── Relationship I/O ─────────────────────────────────────────── */

export const InviteRelationshipViewSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    inviterEndUserId: z.string(),
    inviteeEndUserId: z.string(),
    inviterCodeSnapshot: z.string(),
    boundAt: z.string(),
    qualifiedAt: z.string().nullable(),
    qualifiedReason: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi("InviteRelationshipView");

export const InviteRelationshipListSchema = z
  .object({
    items: z.array(InviteRelationshipViewSchema),
    total: z.number().int(),
  })
  .openapi("InviteRelationshipList");

/* ─── Summary I/O ──────────────────────────────────────────────── */

export const InviteSummaryViewSchema = z
  .object({
    myCode: z.string(),
    myCodeRotatedAt: z.string().nullable(),
    boundCount: z.number().int(),
    qualifiedCount: z.number().int(),
    invitedBy: z
      .object({
        inviterEndUserId: z.string(),
        boundAt: z.string(),
        qualifiedAt: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("InviteSummaryView");

/* ─── Pagination / param / query ──────────────────────────────── */

export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .openapi({
      param: { name: "limit", in: "query" },
      description: "Page size, 1-100 (default 20).",
    }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .optional()
    .openapi({
      param: { name: "offset", in: "query" },
      description: "Items to skip (default 0).",
    }),
});

export const EndUserIdParamSchema = z.object({
  endUserId: z.string().min(1).max(256).openapi({
    param: { name: "endUserId", in: "path" },
    description: "The end user's opaque id from the customer's system.",
  }),
});

export const RelationshipIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
  }),
});

export const AdminListRelationshipsQuerySchema = PaginationQuerySchema.extend({
  inviterEndUserId: z.string().min(1).max(256).optional(),
  qualifiedOnly: z.coerce.boolean().optional(),
});

/* ─── Client (C-end) bodies ───────────────────────────────────── */

// endUserId + userHash are now read from x-end-user-id / x-user-hash headers
// by requireClientUser middleware — not from body or query params.

export const ClientBindBodySchema = z
  .object({
    code: z.string().min(1).max(64).openapi({
      description: "Inviter's code; case / dash-insensitive",
    }),
  })
  .openapi("ClientBindBody");

export const ClientQualifyBodySchema = z
  .object({
    qualifiedReason: z.string().max(128).nullable().optional(),
  })
  .openapi("ClientQualifyBody");

/* ─── Error response ──────────────────────────────────────────── */

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("ErrorResponse");
