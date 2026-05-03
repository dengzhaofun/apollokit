import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { fractionalSortKey } from "./_fractional-sort";
import { team, user } from "./auth"

/**
 * Navigation favorites — per-user, per-org pinned routes shown in the
 * admin sidebar's "Favorites" group above the main navigation.
 *
 * Scope is `(tenantId, userId)`: every project keeps its own
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
 * `sortOrder` is a base62 fractional indexing key (see
 * `lib/fractional-order.ts`). New favorites are appended via `appendKey`
 * so the most-recently-pinned item lands at the tail; the renderer
 * reverses to put it at the top.
 */
export const navigationFavorites = pgTable(
  "navigation_favorites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    routePath: text("route_path").notNull(),
    sortOrder: fractionalSortKey("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("navigation_favorites_unique").on(
      t.tenantId,
      t.userId,
      t.routePath,
    ),
    index("navigation_favorites_lookup").on(
      t.tenantId,
      t.userId,
    ),
  ],
)
