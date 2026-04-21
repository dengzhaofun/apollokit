import { z } from "@hono/zod-openapi";

/**
 * Input schema for POST /api/end-user/sync.
 *
 * `emailVerified` defaults to `true` because tenants going through the
 * sync path already ran their own verification flow — we trust them.
 * Managed sign-ups default to `false` and require Better Auth's email
 * verification to flip.
 */
export const SyncEndUserSchema = z
  .object({
    externalId: z.string().min(1).max(255).optional().openapi({
      description: "Opaque id in the tenant's own user system.",
      example: "u_1abc",
    }),
    email: z.string().email().openapi({ example: "alice@example.com" }),
    name: z.string().min(1).max(255).openapi({ example: "Alice" }),
    image: z.string().url().nullable().optional(),
    emailVerified: z.boolean().optional().default(true),
  })
  .openapi("SyncEndUser");

export const SyncEndUserResponseSchema = z
  .object({
    euUserId: z.string().openapi({ example: "u_abcdef" }),
    created: z.boolean().openapi({
      description:
        "true when this call inserted a new row, false when it merged onto an existing row.",
    }),
  })
  .openapi("SyncEndUserResponse");

export const EndUserIdParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "u_abcdef" }),
  })
  .openapi("EndUserIdParam");

export const ListEndUsersQuerySchema = z
  .object({
    search: z.string().min(1).max(255).optional(),
    origin: z.enum(["managed", "synced"]).optional(),
    disabled: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .openapi("ListEndUsersQuery");

export const EndUserViewSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
    emailVerified: z.boolean(),
    externalId: z.string().nullable(),
    disabled: z.boolean(),
    origin: z.enum(["managed", "synced"]),
    sessionCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EndUserView");

export const EndUserListResponseSchema = z
  .object({
    items: z.array(EndUserViewSchema),
    total: z.number().int(),
  })
  .openapi("EndUserListResponse");

export const UpdateEndUserSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    image: z.string().url().nullable().optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "at least one field must be provided",
  })
  .openapi("UpdateEndUser");

export const SignOutAllResponseSchema = z
  .object({ revoked: z.number().int() })
  .openapi("SignOutAllResponse");

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
  })
  .openapi("ErrorResponse");
