import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { fractionalSortKey } from "./_fractional-sort";

import type { LinkAction } from "../modules/link/types";
import { team } from "./auth";

/**
 * Banner groups — "a carousel slot" — one group per placement in the app
 * (home-main, shop-top, activity-page, …).
 *
 * Alias convention mirrors the rest of the codebase (check-in / shop / item
 * / lottery / exchange): an optional, organization-scoped human-readable
 * key. The client-facing endpoint only resolves groups by alias, so a group
 * without an alias is effectively a draft — admins can stage the layout and
 * its banners internally, then publish by setting an alias.
 */
export const bannerGroups = pgTable(
  "banner_groups",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    // 'carousel' | 'single' | 'grid' — Zod-enforced at the validator layer.
    layout: text("layout").default("carousel").notNull(),
    intervalMs: integer("interval_ms").default(4000).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Soft link to an `activity_configs.id` when this banner group is an
     * activity-scoped carousel (e.g. a spring-festival landing page). NULL
     * means this is a permanent group (home, shop top, …). The activity
     * service flips `isActive` off for its groups per the activity's
     * `cleanupRule` when archiving.
     */
    activityId: uuid("activity_id"),
    activityNodeId: uuid("activity_node_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("banner_groups_tenant_idx").on(table.tenantId),
    uniqueIndex("banner_groups_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
    index("banner_groups_activity_idx").on(table.activityId),
  ],
);

/**
 * Banners — individual slides inside a group.
 *
 * Each row carries its own image (mobile + desktop URLs), on-click
 * `LinkAction` (from the shared link module), optional time window, and
 * optional multicast targeting — reusing the same shape documented in
 * `mail_messages` so admins don't have to learn two targeting models.
 *
 * Visibility predicate evaluated at read time:
 *   isActive
 *   AND (visibleFrom IS NULL OR visibleFrom <= now)
 *   AND (visibleUntil IS NULL OR visibleUntil  > now)
 *   AND (targetType = 'broadcast'
 *        OR targetUserIds @> [endUserId]::jsonb)
 *
 * Ordering is stable by `sortOrder ASC, createdAt ASC`. `sortOrder` is a
 * base62 fractional indexing key (see `lib/fractional-order.ts`); text
 * lex-sort is the natural ordering, no integer arithmetic needed.
 */
export const banners = pgTable(
  "banners",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => bannerGroups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    imageUrlMobile: text("image_url_mobile").notNull(),
    imageUrlDesktop: text("image_url_desktop").notNull(),
    altText: text("alt_text"),
    linkAction: jsonb("link_action").$type<LinkAction>().notNull(),
    // Fractional indexing key (base62, lex-sortable). Service layer sets this
    // via `lib/fractional-order.ts → appendKey / resolveMoveKey`. See
    // `apps/server/src/lib/fractional-order.ts` for the contract.
    sortOrder: fractionalSortKey("sort_order").notNull(),
    visibleFrom: timestamp("visible_from"),
    visibleUntil: timestamp("visible_until"),
    // 'broadcast' | 'multicast' — Zod-enforced at the validator layer.
    targetType: text("target_type").default("broadcast").notNull(),
    // text[] serialized as jsonb; null for broadcasts.
    // Matches the mail_messages targeting model verbatim.
    targetUserIds: jsonb("target_user_ids").$type<string[]>(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("banners_tenant_group_sort_idx").on(
      table.tenantId,
      table.groupId,
      table.sortOrder,
    ),
    index("banners_tenant_visible_window_idx").on(
      table.tenantId,
      table.groupId,
      table.isActive,
      table.visibleFrom,
      table.visibleUntil,
    ),
    // GIN on jsonb targetUserIds for multicast containment queries,
    // partial so broadcast rows (null) don't bloat the index.
    // Mirrors mail_messages_multicast_gin_idx.
    index("banners_multicast_gin_idx")
      .using("gin", table.targetUserIds)
      .where(sql`${table.targetType} = 'multicast'`),
  ],
);
