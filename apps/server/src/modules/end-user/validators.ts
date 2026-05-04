import { z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";

import { defineListFilter, f } from "../../lib/list-filter";
import { pageOf } from "../../lib/pagination";
import { euAccount, euUser } from "../../schema/end-user-auth";

/**
 * Input schema for POST /api/v1/end-user/sync.
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

/**
 * Module filter handle — single source of truth for end-user list
 * filters. Drives both the route's request.query schema (server) and
 * the admin page's `validateSearch` schema (admin imports
 * `endUserFilters.adminQueryFragment`'s shape via `EndUserFilterShape`
 * below).
 *
 * `origin` is derived from a join (presence/absence of a credential
 * row in `eu_account`) rather than a column on `eu_user`, so it goes
 * through the custom `where` callback. Every other field maps to a
 * column directly.
 */
export const endUserFilters = defineListFilter({
  origin: f.enumOf(["managed", "synced"], {
    where: (v) =>
      v === "managed"
        ? sql`EXISTS (SELECT 1 FROM ${euAccount} WHERE ${euAccount.userId} = ${euUser.id} AND ${euAccount.providerId} = 'credential')`
        : sql`NOT EXISTS (SELECT 1 FROM ${euAccount} WHERE ${euAccount.userId} = ${euUser.id} AND ${euAccount.providerId} = 'credential')`,
  }),
  disabled: f.boolean({ column: euUser.disabled }),
  emailVerified: f.boolean({ column: euUser.emailVerified }),
  externalId: f.string({ column: euUser.externalId, ops: ["eq", "contains"] }),
  createdAt: f.dateRange({ column: euUser.createdAt }),
})
  .search({
    // pg_trgm GIN indexes exist on (name, email) — see drizzle/0002_pg_trgm_search_indexes.sql.
    // externalId is included for correctness but seq-scans (no trgm index on it yet);
    // trgm mode keeps the planner using the indexed columns when the term matches them.
    columns: [euUser.name, euUser.email, euUser.externalId],
    mode: "trgm",
  })
  .build();

export const ListEndUsersQuerySchema = endUserFilters.querySchema.openapi(
  "ListEndUsersQuery",
);

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

export const EndUserListResponseSchema = pageOf(EndUserViewSchema).openapi(
  "EndUserListResponse",
);

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

// ─── Session sub-resource schemas ─────────────────────────────────────────

export const EndUserSessionViewSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .openapi("EndUserSessionView");

export const EndUserSessionIdParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "u_abcdef" }),
    sessionId: z.string().min(1).openapi({ example: "sess_xyz" }),
  })
  .openapi("EndUserSessionIdParam");

export const ListEndUserSessionsQuerySchema = z
  .object({
    userId: z.string().optional().openapi({
      param: { name: "userId", in: "query" },
    }),
    cursor: z.string().optional().openapi({
      param: { name: "cursor", in: "query" },
    }),
    limit: z.coerce.number().int().min(1).max(200).optional().openapi({
      param: { name: "limit", in: "query" },
    }),
  })
  .openapi("ListEndUserSessionsQuery");

export const EndUserSessionListResponseSchema = pageOf(EndUserSessionViewSchema).openapi(
  "EndUserSessionListResponse",
);

// ─── Account sub-resource schemas ─────────────────────────────────────────

export const EndUserAccountViewSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    providerId: z.string(),
    createdAt: z.string(),
  })
  .openapi("EndUserAccountView");

export const ListEndUserAccountsQuerySchema = z
  .object({
    userId: z.string().optional().openapi({
      param: { name: "userId", in: "query" },
    }),
    providerId: z.string().optional().openapi({
      param: { name: "providerId", in: "query" },
    }),
    cursor: z.string().optional().openapi({
      param: { name: "cursor", in: "query" },
    }),
    limit: z.coerce.number().int().min(1).max(200).optional().openapi({
      param: { name: "limit", in: "query" },
    }),
  })
  .openapi("ListEndUserAccountsQuery");

export const EndUserAccountListResponseSchema = pageOf(EndUserAccountViewSchema).openapi(
  "EndUserAccountListResponse",
);

// ─── Verification sub-resource schemas ────────────────────────────────────

export const EndUserVerificationViewSchema = z
  .object({
    id: z.string(),
    identifier: z.string(),
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .openapi("EndUserVerificationView");

export const ListEndUserVerificationsQuerySchema = z
  .object({
    cursor: z.string().optional().openapi({
      param: { name: "cursor", in: "query" },
    }),
    limit: z.coerce.number().int().min(1).max(200).optional().openapi({
      param: { name: "limit", in: "query" },
    }),
  })
  .openapi("ListEndUserVerificationsQuery");

export const EndUserVerificationListResponseSchema = pageOf(EndUserVerificationViewSchema).openapi(
  "EndUserVerificationListResponse",
);
