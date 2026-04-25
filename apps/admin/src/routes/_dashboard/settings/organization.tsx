import { OrganizationSettingsCards } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { seo } from "#/lib/seo"

/**
 * Organization settings.
 *
 * Renders the `@daveyplate/better-auth-ui` composite card bundle —
 * name/slug, logo, members list with role-update, pending invitations,
 * and "leave organization". The component reads session state from
 * the `AuthUIProvider` mounted in `providers.tsx` and drives all
 * mutations through `authClient.organization.*`.
 *
 * Role-aware UI is handled by the library: a `member`-role user won't
 * see the Invite / Remove / Update-Role buttons, so we don't need to
 * wrap anything in `<WriteGate>` here. The server-side
 * `/api/auth/organization/*` endpoints enforce the matrix as a second
 * line of defense.
 */
export const Route = createFileRoute("/_dashboard/settings/organization")({
  head: () => seo({ title: "Organization settings", noindex: true }),
  component: OrganizationSettingsPage,
})

function OrganizationSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <OrganizationSettingsCards />
    </div>
  )
}
