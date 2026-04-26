import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { organization, user } from "./auth"

/**
 * Navigation favorites — per-user, per-org pinned routes shown in the
 * admin sidebar's "Favorites" group above the main navigation.
 *
 * Scope is `(organizationId, userId)`: every project keeps its own
 * pinned set so an operator working on a marketing-heavy project and a
 * commerce-heavy project doesn't see the same shortlist in both.
 *
 * `routePath` is a free-form string (e.g. `"/shop/categories"`) — the
 * client renders by looking it up in the static nav tree at render
 * time. Stale entries (route removed or renamed) are silently skipped
 * by the renderer; we don't try to validate against a server-side
 * enum because that list would silently drift from the admin's
 * `NavRoute` union.
 *
 * `sortOrder` is the on-screen ordering (higher = more recent). On
 * insert we set it to `(max(sortOrder) for this user/org) + 1`, so
 * the most-recently-pinned item floats to the top. The column is an
 * `integer` so a future drag-reorder feature can rewrite it without a
 * schema change.
 */
export const navigationFavorites = pgTable(
  "navigation_favorites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    routePath: text("route_path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("navigation_favorites_unique").on(
      t.organizationId,
      t.userId,
      t.routePath,
    ),
    index("navigation_favorites_lookup").on(
      t.organizationId,
      t.userId,
    ),
  ],
)
