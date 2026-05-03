import {
  OrganizationSettingsCards,
  TeamsCard,
} from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"

/**
 * Organization-level settings — billing parent / cross-project hub.
 *
 * Two card stacks rendered together so org-admins find everything in
 * one place:
 *
 *   1. `OrganizationSettingsCards` (daveyplate) — org name / URL slug /
 *      logo, member list with role updates, pending invitations, and
 *      the danger zone (delete organization).
 *   2. `TeamsCard` (daveyplate) — list of every project (Better Auth
 *      team) under this organization, with create / update / delete
 *      dialogs. Project membership at the team level is managed inside
 *      each project's own settings.
 *
 * Per-project settings (rename / delete THIS project, members of THIS
 * project, API keys, webhooks) live at `/settings/project*` instead.
 *
 * The localization override in providers.tsx maps Better Auth's
 * `ORGANIZATION_*` strings to "Organization / 组织" and `TEAM_*` to
 * "Project / 项目".
 */
export const Route = createFileRoute("/_dashboard/settings/organization")({
  head: () => seo({ title: "Organization settings", noindex: true }),
  component: OrganizationSettingsPage,
})

function OrganizationSettingsPage() {
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <OrganizationSettingsCards />
        <ActiveOrgTeamsCard />
      </div>
    </RouteGuard>
  )
}

function ActiveOrgTeamsCard() {
  // daveyplate `TeamsCard` requires `organizationId`. Pull it from the
  // live session — switching orgs from the sidebar re-renders this via
  // useSession's subscription.
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId
  if (!orgId) return null
  return <TeamsCard organizationId={orgId} />
}
