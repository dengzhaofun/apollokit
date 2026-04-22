import { authClient } from "#/lib/auth-client"

/**
 * Coarse-grained write-permission hook.
 *
 * Returns `true` when the current user's role in the active
 * organization allows mutating operations — Phase 1 treats both
 * `owner` and `admin` as write-capable and `member` as read-only.
 *
 * This is the mirror of the server-side `requireOrgManage` middleware:
 * both refuse writes for `member`. The UI uses it to disable buttons
 * so a member isn't clicking buttons that would 403 — the server
 * middleware is still what actually enforces access.
 *
 * While `authClient.useActiveMember()` is loading (or no active
 * org exists yet), we return `false` so the UI defaults to the
 * restrictive state. Phase 2 replaces this with `useCan(resource, action)`
 * backed by Better Auth's `createAccessControl` statements.
 */
export function useCanManage(): boolean {
  const { data: member } = authClient.useActiveMember()
  const role = member?.role
  return role === "owner" || role === "admin"
}
