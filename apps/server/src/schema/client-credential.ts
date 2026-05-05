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

import { team } from "./auth";

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
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publishableKey: text("publishable_key").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    // Cred type:
    //   'standard'  — full HMAC flow (existing behavior, the default)
    //   'anonymous' — accepts any `x-end-user-id` header, no HMAC.
    //                 Issued for `apollokit-pages` projects whose
    //                 authMode is 'anonymous'; pages worker writes a
    //                 device-fingerprint cookie that becomes the
    //                 endUserId. The encryptedSecret is still generated
    //                 and stored (so revocation/rotation work the same)
    //                 but never decrypted on the verify path.
    // Zod-enforced at the validator layer.
    kind: text("kind").notNull().default("standard"),
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
    index("client_credentials_organization_id_idx").on(table.tenantId),
    uniqueIndex("client_credentials_publishable_key_uidx").on(
      table.publishableKey,
    ),
  ],
);
