import { OrganizationSettingsCards } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { seo } from "#/lib/seo"

/**
 * Project settings.
 *
 * Renders the `@daveyplate/better-auth-ui` composite card bundle —
 * name/slug, logo, members list with role-update, pending invitations,
 * and "leave project". The component reads session state from
 * the `AuthUIProvider` mounted in `providers.tsx` and drives all
 * mutations through `authClient.organization.*` (Better Auth's plugin
 * is still named `organization` internally; the UI uses "project"
 * terminology via the localization override in providers.tsx).
 *
 * Role-aware UI is handled by the library: a `member`-role user won't
 * see the Invite / Remove / Update-Role buttons, so we don't need to
 * wrap anything in `<Can resource="organization" action="write" mode="disable">` here. The server-side
 * `/api/auth/organization/*` endpoints enforce the matrix as a second
 * line of defense.
 */
export const Route = createFileRoute("/_dashboard/settings/project")({
  head: () => seo({ title: "Project settings", noindex: true }),
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  // Project settings exposes member management + role-update + delete-org.
  // operator/viewer have no business reading any of it. Use the
  // unauthorized page so an operator who pasted the URL knows they
  // need admin/owner.
  return (
    <RouteGuard resource="organization" action="update" visibility="unauthorized-page">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <OrganizationSettingsCards />
      </div>
    </RouteGuard>
  )
}
