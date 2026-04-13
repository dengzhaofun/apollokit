import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * Client credentials for C-end API access with HMAC identity verification.
 *
 * Each row represents a publishable key + encrypted secret pair owned by an
 * organization. The publishable key (`cpk_xxx`) is sent from the client in
 * every request; the secret (`csk_xxx`) is held by the customer's backend
 * and used to compute HMAC-SHA256(endUserId) to prove identity.
 *
 * `encrypted_secret` is AES-256-GCM encrypted using a key derived from
 * BETTER_AUTH_SECRET. The server decrypts it at verification time to compute
 * the expected HMAC.
 *
 * `dev_mode` skips HMAC verification for local development convenience.
 * Customers should disable it in production.
 */
export const clientCredentials = pgTable(
  "client_credentials",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publishableKey: text("publishable_key").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    devMode: boolean("dev_mode").default(false).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("client_credentials_organization_id_idx").on(table.organizationId),
    uniqueIndex("client_credentials_publishable_key_uidx").on(
      table.publishableKey,
    ),
  ],
);
