/**
 * Maps the current admin route to a "surface" string the AI agent uses
 * to decide which tools / sub-prompt are relevant.
 *
 * The surface format mirrors the server-side `AdminSurface` enum
 * (see `apps/server/src/modules/admin-agent/types.ts`):
 *   - `"dashboard"` for the main page and any unmatched route
 *   - `"<module>:list"` for `/<module>` (no modal)
 *   - `"<module>:create"` for `/<module>?modal=create`
 *   - `"<module>:edit"` for `/<module>/$xxx` (any sub-path = edit-ish)
 *
 * Drift between the two enums (admin vs server) is detected by the
 * server's surface whitelist: a request with an unknown surface is
 * rejected with HTTP 400 by `routes.ts`.
 *
 * This hook reads only Router state (no Form state), so it's safe to
 * mount inside the global FAB which lives outside any FormProvider.
 */

import { useLocation, useRouterState } from "@tanstack/react-router"

export type AdminSurface =
  | "dashboard"
  | `${string}:list`
  | `${string}:create`
  | `${string}:edit`

export function useCurrentSurface(): AdminSurface {
  const { pathname } = useLocation()
  // useRouterState gives us the resolved search object across all
  // matches; useSearch from a route requires knowing the route id at
  // call site, which we don't have in a global hook.
  const search = useRouterState({
    select: (s) =>
      (s.location.search ?? {}) as Record<string, unknown>,
  })

  return computeSurface(pathname, search)
}

export function computeSurface(
  pathname: string,
  search: Record<string, unknown>,
): AdminSurface {
  const segments = pathname.split("/").filter(Boolean)

  // `/` and `/dashboard` -> dashboard
  if (segments.length === 0) return "dashboard"
  if (segments[0] === "dashboard") return "dashboard"

  const moduleName = segments[0]

  // Modal-driven create (`/check-in?modal=create`).
  if (search.modal === "create") return `${moduleName}:create`

  // Plain list page (`/check-in`).
  if (segments.length === 1) return `${moduleName}:list`

  // Anything deeper (`/check-in/$id`, `/check-in/$id/rewards`, …) is
  // treated as an edit context. Sub-resources (rewards, options, etc.)
  // could later get their own surface name; for now they inherit
  // `<module>:edit` so the AI still proposes module-relevant configs.
  return `${moduleName}:edit`
}
