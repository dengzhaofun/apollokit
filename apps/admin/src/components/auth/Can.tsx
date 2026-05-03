/**
 * Capability-aware render gate for admin UI.
 *
 * - `useCan(resource, action)` — boolean hook. Reads the capability bag
 *   from the active session's organization (cached by TanStack Query
 *   in `lib/capabilities.ts`).
 *
 * - `<Can resource action mode="hide" | "disable">` — wrapping
 *   component. Default `mode="hide"`: returns `fallback` (or null)
 *   when the user lacks the action. `mode="disable"`: keeps the
 *   children rendered but wraps them in a disabled fieldset + tooltip
 *   so the user can see the control exists and what role would unlock
 *   it. Use `disable` for write actions on visible modules; use `hide`
 *   for actions on resources the user shouldn't know about (audit-log,
 *   billing, etc.).
 *
 * Why a fieldset instead of cloning the element with `disabled={true}`:
 * children may be arbitrary trees (Button + Link + icons + tooltip
 * triggers); a fieldset propagates `disabled` down to every form
 * control with zero per-element knowledge. The wrapping <span> exists
 * because a disabled <button> swallows pointer events in some
 * browsers, breaking the tooltip trigger.
 *
 * Server enforcement is the source of truth — even if the UI gate is
 * bypassed, `requirePermission` returns 403. This component exists
 * for UX, not security.
 */

import type { ReactNode } from "react"

import { authClient } from "#/lib/auth-client"
import {
  hasAction,
  hasAnyAction,
  useCapabilities,
} from "#/lib/capabilities"
import * as m from "#/paraglide/messages.js"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"

/**
 * Returns true iff the active session's user can perform `action` on
 * `resource` in the active organization. While the bag is loading,
 * returns `false` (fail closed) — UI defaults to disabled / hidden
 * rather than briefly flashing accessible state.
 */
export function useCan(resource: string, action: string): boolean {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const { data: bag } = useCapabilities(orgId)
  return hasAction(bag, resource, action)
}

/**
 * Returns true iff the active user can perform ANY action on
 * `resource`. Used for menu visibility decisions.
 */
export function useCanAny(resource: string): boolean {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const { data: bag } = useCapabilities(orgId)
  return hasAnyAction(bag, resource)
}

type CanProps = {
  resource: string
  action: string
  /**
   * - "hide" (default): renders `fallback` or null when not allowed
   * - "disable": renders children inside a disabled fieldset with a
   *   tooltip explaining the missing permission
   */
  mode?: "hide" | "disable"
  fallback?: ReactNode
  children: ReactNode
}

export function Can({
  resource,
  action,
  mode = "hide",
  fallback = null,
  children,
}: CanProps) {
  const allowed = useCan(resource, action)
  if (allowed) return <>{children}</>
  if (mode === "hide") return <>{fallback}</>

  // disable mode: wrap in fieldset to grey-out interactive descendants
  // and a tooltip on a span trigger (disabled buttons don't fire
  // pointer events on Safari).
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="pointer-events-auto inline-block cursor-not-allowed" />
        }
      >
        <fieldset disabled className="contents">
          {children}
        </fieldset>
      </TooltipTrigger>
      <TooltipContent>{m.role_write_denied_tooltip()}</TooltipContent>
    </Tooltip>
  )
}
