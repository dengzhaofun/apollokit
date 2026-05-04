/**
 * Client-side mirror of the server's capability bag.
 *
 * The bag itself is fetched from `/api/v1/me/capabilities` (see
 * `apps/server/src/routes/me.ts`), which returns the resolved
 * (resource → action[]) map for the current user in the active org.
 *
 * Components consume the bag via `useCan(resource, action)` from
 * `components/auth/Can.tsx`, never by importing this module directly.
 *
 * The single source of truth for resource and role names is
 * `apps/server/src/auth/ac.ts`. This module duplicates the resource
 * union as a string literal type so the admin app does not need a
 * cross-package import; if a new resource is added on the server,
 * `useCan` calls remain unchanged because we accept arbitrary
 * `string`. Add the literal here only when a route or component
 * wants compile-time autocompletion.
 */

import { useQuery } from "@tanstack/react-query"

import { api } from "./api-client"

/** Shape returned by `/api/v1/me/capabilities`. */
export type CapabilityBag = {
  /** Comma-separated role string from member.role. null for admin-api-key auth. */
  role: string | null
  /** Map of resource name → array of granted action names. May contain "manage". */
  capabilities: Record<string, string[]>
  /**
   * True iff the current user has the platform-level `admin` role added by
   * Better Auth's admin plugin (NOT the same as tenant-level org/team
   * admin). Drives visibility of the `/admin/*` operator surface.
   */
  isPlatformAdmin: boolean
}

/** TanStack Query key. Bumped when the active org changes. */
export const capabilitiesQueryKey = (orgId: string | null | undefined) => [
  "me",
  "capabilities",
  orgId ?? "anon",
]

/**
 * Fetch the capability bag for the current session + active org.
 * `staleTime: Infinity` because the bag only changes when the user's
 * role changes (rare; see Phase 1 risk #2 in the plan — accepted as
 * "next refresh" today). `enabled` lets the caller skip while the
 * session/org is still loading.
 */
export function useCapabilities(
  orgId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CapabilityBag>({
    queryKey: capabilitiesQueryKey(orgId),
    queryFn: () => api.get<CapabilityBag>("/api/v1/me/capabilities"),
    enabled: options.enabled ?? Boolean(orgId),
    staleTime: Infinity,
    // Do not retry on 401/403 — those mean "no session" or "wrong org".
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status
      if (status === 401 || status === 403) return false
      return failureCount < 2
    },
  })
}

/**
 * True iff `bag` grants `action` (or `manage`) on `resource`. Pure
 * function — usable in non-React contexts (router beforeLoad, sidebar
 * filtering, etc.).
 */
export function hasAction(
  bag: CapabilityBag | undefined | null,
  resource: string,
  action: string,
): boolean {
  if (!bag) return false
  const actions = bag.capabilities[resource]
  if (!actions || actions.length === 0) return false
  return actions.includes(action) || actions.includes("manage")
}

/**
 * True iff `bag` grants ANY action on `resource`. Used by the sidebar
 * to decide whether a menu item with `permission: { resource }` (no
 * specific action declared) should appear at all — equivalent to "the
 * user can at least read this module".
 */
export function hasAnyAction(
  bag: CapabilityBag | undefined | null,
  resource: string,
): boolean {
  if (!bag) return false
  const actions = bag.capabilities[resource]
  return Boolean(actions && actions.length > 0)
}

/** Sentinel role names that drive UI-only behavior (e.g. invite default). */
export const ROLE_NAMES = ["owner", "admin", "operator", "viewer"] as const
export type RoleName = (typeof ROLE_NAMES)[number]
