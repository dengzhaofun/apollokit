import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { team } from "./auth";

/**
 * Announcements — per-tenant operational broadcasts rendered by the game
 * client as a modal, feed entry, or scrolling ticker. One row = one
 * broadcast; the `kind` column tells the client how to render it.
 *
 * v1 is broadcast-only. Per-player "already read / dismissed" state is
 * deliberately NOT stored here — clients persist that in local storage
 * so a hot write-path table doesn't need to exist until a tenant
 * actually asks for cross-device sync. The `platforms` / `locales`
 * columns are v2 placeholders: writable at the schema layer but ignored
 * by v1 validators and the client-facing query.
 *
 * Visibility predicate evaluated at read time:
 *   isActive = true
 *   AND (visibleFrom IS NULL OR visibleFrom <= now)
 *   AND (visibleUntil IS NULL OR visibleUntil  > now)
 *
 * Ordering for client payloads: `priority DESC, createdAt DESC`.
 */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    // 'modal' | 'feed' | 'ticker' — Zod-enforced at the validator layer.
    kind: text("kind").notNull(),

    title: text("title").notNull(),
    body: text("body").notNull(),
    coverImageUrl: text("cover_image_url"),
    ctaUrl: text("cta_url"),
    ctaLabel: text("cta_label"),

    priority: integer("priority").default(0).notNull(),
    // 'info' | 'warning' | 'urgent' — Zod-enforced at the validator layer.
    severity: text("severity").default("info").notNull(),

    isActive: boolean("is_active").default(true).notNull(),
    visibleFrom: timestamp("visible_from"),
    visibleUntil: timestamp("visible_until"),

    // v2 targeting placeholders — null for broadcast. v1 writes/reads ignore these.
    platforms: text("platforms").array(),
    locales: text("locales").array(),

    // Better Auth admin user id. Intentionally no FK: an operator deleting
    // their account should not cascade-wipe the announcements they published.
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("announcements_tenant_alias_uidx").on(
      table.tenantId,
      table.alias,
    ),
    index("announcements_tenant_visible_idx").on(
      table.tenantId,
      table.isActive,
      table.visibleFrom,
      table.visibleUntil,
    ),
  ],
);
