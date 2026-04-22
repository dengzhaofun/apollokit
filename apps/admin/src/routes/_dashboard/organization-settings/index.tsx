import { OrganizationSettingsCards } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { seo } from "#/lib/seo"

/**
 * Admin-side organization settings.
 *
 * Renders the `@daveyplate/better-auth-ui` composite card bundle —
 * name/slug, logo, members list with role-update, pending invitations,
 * and "leave organization". The component already reads session state
 * from the `AuthUIProvider` mounted in `providers.tsx` and drives all
 * mutations through `authClient.organization.*`, so we don't need to
 * render sub-cards by hand.
 *
 * Role-aware UI is handled by the library: a `member`-role user won't
 * see the Invite / Remove / Update-Role buttons at all, so we don't
 * need to wrap anything in `<WriteGate>` here. The server-side
 * `/api/auth/organization/*` endpoints enforce the matrix as a
 * second line of defense (see `has-permission.mjs` in Better Auth).
 */
export const Route = createFileRoute("/_dashboard/organization-settings/")({
  head: () => seo({ title: "Organization settings", noindex: true }),
  component: OrganizationSettingsPage,
})

function OrganizationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <OrganizationSettingsCards />
    </main>
  )
}
