/**
 * Route-level permission gate.
 *
 * Wraps the page component of a sensitive route. While the capability
 * bag is loading, renders a minimal placeholder; once loaded, either
 * passes through or redirects according to the visibility mode passed
 * by the route file.
 *
 *   <RouteGuard resource="auditLog" action="read" visibility="redirect-dashboard">
 *     <ActualPage />
 *   </RouteGuard>
 *
 * Visibility modes mirror the table in `AppSidebar.tsx`:
 *
 *   - "redirect-dashboard"  silent send to /dashboard. Use when even
 *                           knowing the route exists would leak
 *                           information (audit-log, billing).
 *   - "unauthorized-page"   send to /unauthorized with the originating
 *                           path + resource so the user gets explicit
 *                           "ask an admin for access" feedback.
 *   - "hidden"              this guard is a no-op when set to "hidden";
 *                           server middleware does the enforcement and
 *                           the page renders (the user just sees 403
 *                           toasts as the data hooks fire). Provided
 *                           for symmetry with the sidebar config.
 *
 * Server enforcement remains the source of truth — this component is
 * UX, not security. A bypassed guard still gets 403'd by
 * `requirePermission` middleware on the server.
 */

import { Navigate, useLocation } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { authClient } from "#/lib/auth-client"
import {
  hasAction,
  hasAnyAction,
  useCapabilities,
} from "#/lib/capabilities"

import type { Visibility } from "../AppSidebar"

type RouteGuardProps = {
  resource: string
  /**
   * Specific action to require. When omitted, "any action on this
   * resource" passes — same semantics as the sidebar `hasAnyAction`
   * filter.
   */
  action?: string
  visibility?: Visibility
  children: ReactNode
}

export function RouteGuard({
  resource,
  action,
  visibility = "redirect-dashboard",
  children,
}: RouteGuardProps) {
  const { pathname } = useLocation()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const orgId = session?.session.activeTeamId ?? null
  const { data: bag, isPending: bagPending } = useCapabilities(orgId)

  // Wait for both session + bag before deciding. Without this the
  // first render briefly thinks the bag is empty and redirects users
  // who actually have access. Render nothing during this window — the
  // dashboard layout already shows a "Loading…" skeleton during
  // session bootstrap, so a blank page-body is acceptable.
  if (sessionPending || bagPending) return null

  const allowed = action
    ? hasAction(bag, resource, action)
    : hasAnyAction(bag, resource)
  if (allowed) return <>{children}</>

  if (visibility === "hidden") return <>{children}</>
  if (visibility === "unauthorized-page") {
    return (
      <Navigate
        to="/unauthorized"
        search={{ from: pathname, resource }}
        replace
      />
    )
  }
  // redirect-dashboard (default for sensitive routes)
  return <Navigate to="/dashboard" replace />
}
