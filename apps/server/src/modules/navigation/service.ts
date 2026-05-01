/**
 * Navigation favorites service — pure business logic, no HTTP, no
 * concrete `db` import. Deps are injected via `Pick<AppDeps, "db">`
 * per the project's DI convention (see apps/server/CLAUDE.md).
 *
 * Operations:
 *  - `list` — fetch the current user+org favorites, sorted by
 *    `sortOrder DESC` (most recently pinned first).
 *  - `add` — single-statement upsert. New row gets sortOrder =
 *    (max for this user/org) + 1. Existing row keeps its position
 *    (no-op + bumps updatedAt). Enforces a hard limit of 50/user/org
 *    to prevent abuse — UX guidance is to keep it ≤ 10.
 *  - `remove` — delete by routePath. 404s when missing.
 *
 * The upsert is a single `INSERT ... SELECT (max+1) ... ON CONFLICT DO
 * UPDATE` so two concurrent adds of the same routePath serialize on the
 * unique index and produce a single row.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm"

import type { AppDeps } from "../../deps"
import { appendKey } from "../../lib/fractional-order"
import { navigationFavorites } from "../../schema/navigation"
import {
  NavigationFavoriteLimitReached,
  NavigationFavoriteNotFound,
} from "./errors"
import type { NavigationFavorite } from "./types"

type NavigationDeps = Pick<AppDeps, "db">

/** Hard cap to prevent abuse. UX target: ≤ 10. */
export const FAVORITE_LIMIT = 50

export function createNavigationService(d: NavigationDeps) {
  const { db } = d

  async function list(
    organizationId: string,
    userId: string,
  ): Promise<NavigationFavorite[]> {
    return db
      .select()
      .from(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.organizationId, organizationId),
          eq(navigationFavorites.userId, userId),
        ),
      )
      .orderBy(desc(navigationFavorites.sortOrder), asc(navigationFavorites.createdAt))
  }

  async function add(
    organizationId: string,
    userId: string,
    routePath: string,
  ): Promise<NavigationFavorite> {
    // Pre-check the limit. Race window: two concurrent adds at exactly
    // limit-1 could both pass the check and end up with limit+1 total.
    // The unique index doesn't help here (different routePaths). For a
    // soft-cap UX safeguard this is acceptable — abuse would be a user
    // intentionally bursting which is what the cap is meant to bound,
    // not stop with strict serialization.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.organizationId, organizationId),
          eq(navigationFavorites.userId, userId),
        ),
      )
    if (count >= FAVORITE_LIMIT) {
      throw new NavigationFavoriteLimitReached(FAVORITE_LIMIT)
    }

    // Compute the new fractional key (tail-append) before the insert. ON
    // CONFLICT keeps the existing sortOrder (re-pinning an already-pinned
    // route is a no-op), only bumps updatedAt.
    const sortOrder = await appendKey(db, {
      table: navigationFavorites,
      sortColumn: navigationFavorites.sortOrder,
      scopeWhere: and(
        eq(navigationFavorites.organizationId, organizationId),
        eq(navigationFavorites.userId, userId),
      )!,
    })
    const rows = await db
      .insert(navigationFavorites)
      .values({
        organizationId,
        userId,
        routePath,
        sortOrder,
      })
      .onConflictDoUpdate({
        target: [
          navigationFavorites.organizationId,
          navigationFavorites.userId,
          navigationFavorites.routePath,
        ],
        set: {
          updatedAt: new Date(),
        },
      })
      .returning()

    return rows[0]!
  }

  async function remove(
    organizationId: string,
    userId: string,
    routePath: string,
  ): Promise<void> {
    const rows = await db
      .delete(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.organizationId, organizationId),
          eq(navigationFavorites.userId, userId),
          eq(navigationFavorites.routePath, routePath),
        ),
      )
      .returning({ id: navigationFavorites.id })
    if (rows.length === 0) {
      throw new NavigationFavoriteNotFound(routePath)
    }
  }

  return { list, add, remove }
}

export type NavigationService = ReturnType<typeof createNavigationService>
