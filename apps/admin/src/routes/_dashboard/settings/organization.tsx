import { OrganizationSettingsCards } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { seo } from "#/lib/seo"

/**
 * Organization (= organization / billing parent) settings.
 *
 * Renders the `@daveyplate/better-auth-ui` `OrganizationSettingsCards`
 * bundle — organization name/slug, logo, member list with role-update,
 * pending invitations, and the danger zone (delete organization).
 *
 * Under the dual-tenant model, this is the COMPANY-level settings
 * page. Project (Better Auth team) settings live separately at
 * `/settings/project` and use `TeamsCard` for cross-project listing.
 *
 * The localization override (auth-localization-en.ts / -zh.ts mounted
 * in providers.tsx) maps Better Auth's internal `ORGANIZATION_*`
 * strings to "Organization / 组织".
 *
 * Role-aware UI is handled by daveyplate: a `member`-role user won't
 * see the Invite / Remove / Update-Role buttons. The server-side
 * `/api/auth/organization/*` endpoints stay as the authoritative gate.
 */
export const Route = createFileRoute("/_dashboard/settings/organization")({
  head: () => seo({ title: "Organization settings", noindex: true }),
  component: OrganizationSettingsPage,
})

function OrganizationSettingsPage() {
  // Org-level surface (member mgmt + delete) — operator/viewer roles must
  // not see any of it. RouteGuard 403s with the unauthorized page when
  // the user lacks org-level write capability.
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <OrganizationSettingsCards />
      </div>
    </RouteGuard>
  )
}
