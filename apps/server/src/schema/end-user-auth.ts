/**
 * End-user auth schema — second Better Auth instance, serves game players
 * (not SaaS operators). Tables are prefixed `eu_` to stay isolated from the
 * admin auth tables (`user`, `session`, `account`, `verification`).
 *
 * Tenancy model
 * -------------
 * Every row carries `tenantId` (FK → organization). One player belongs
 * to exactly one organization — the `cpk_` publishable key used by the game
 * client determines which org, and we refuse to ever let that change.
 *
 * Email uniqueness is **per-tenant**. We don't want to block a player who
 * signed up in game A from signing up in game B with the same address. The
 * DB column has a global `UNIQUE(email)`, but the `email` we actually store
 * is namespaced: `{orgId}__{rawEmail}`. See `src/end-user-auth.ts` for the
 * hooks that attach/strip the prefix at the edges, so callers only ever see
 * raw emails.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

export const euUser = pgTable(
  "eu_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Stored as `{orgId}__{rawEmail}` — see file header. `UNIQUE(email)`
    // therefore expresses "(orgId, rawEmail) is unique" without needing a
    // composite key Better Auth can't describe.
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    // Tenant anchor. Populated from the cpk_ publishable key in
    // `user.create.before` — never trusted from client input.
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    // Opaque id the tenant uses in their own user system. Populated only by
    // POST /api/v1/users/sync. Partial-unique so a row without an external id
    // (managed-only) doesn't collide on NULL.
    externalId: text("external_id"),
    // Soft-ban: disabled players can't sign in (enforced in
    // `session.create.before` of end-user-auth) and can't resolve a
    // session server-side (enforced in `requireClientUser` Channel A).
    // Admin-facing "disable" action also deletes existing eu_session
    // rows so the ban is immediate, not on cookie expiry.
    disabled: boolean("disabled").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("eu_user_organization_id_idx").on(table.tenantId),
    uniqueIndex("eu_user_org_external_id_uidx")
      .on(table.tenantId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);

export const euSession = pgTable(
  "eu_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => euUser.id, { onDelete: "cascade" }),
    // Denormalized from eu_user — filled by `session.create.before`. Lets
    // `requireClientUser` compare against the cpk_-derived org id in a
    // single cookie-round-trip without an extra user lookup.
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("eu_session_user_id_idx").on(table.userId),
    index("eu_session_organization_id_idx").on(table.tenantId),
  ],
);

export const euAccount = pgTable(
  "eu_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => euUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("eu_account_user_id_idx").on(table.userId)],
);

export const euVerification = pgTable(
  "eu_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("eu_verification_identifier_idx").on(table.identifier)],
);

export const euUserRelations = relations(euUser, ({ many, one }) => ({
  sessions: many(euSession),
  accounts: many(euAccount),
  tenant: one(team, {
    fields: [euUser.tenantId],
    references: [team.id],
  }),
}));

export const euSessionRelations = relations(euSession, ({ one }) => ({
  user: one(euUser, {
    fields: [euSession.userId],
    references: [euUser.id],
  }),
  tenant: one(team, {
    fields: [euSession.tenantId],
    references: [team.id],
  }),
}));

export const euAccountRelations = relations(euAccount, ({ one }) => ({
  user: one(euUser, {
    fields: [euAccount.userId],
    references: [euUser.id],
  }),
}));
