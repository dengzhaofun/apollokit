import { TeamsCard } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"

/**
 * Project (= Better Auth team) settings — cross-project list view inside
 * the active organization.
 *
 * Renders daveyplate's `TeamsCard` which shows every project under the
 * current organization, with create/update/delete dialogs. Each row is a
 * project (Better Auth team) tied to `tenantId` on every business table.
 *
 * Per-project deep settings (members, roles, API keys, webhooks, etc.)
 * are scoped to the **active** project — they live alongside the
 * business modules on existing routes; switching the project via the
 * sidebar `ProjectSwitcher` re-scopes the entire dashboard.
 *
 * Organization-level settings (members, billing, delete) live at
 * `/settings/organization`.
 */
export const Route = createFileRoute("/_dashboard/settings/project/")({
  head: () => seo({ title: "Project settings", noindex: true }),
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  // Org-level "team:create / team:delete" perms — orgAdmin and orgOwner
  // can manage projects; orgViewer can only see the list. We gate
  // visually with RouteGuard but server-side `/api/auth/organization/*-team`
  // endpoints are the source of truth.
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <ActiveOrgTeamsCard />
      </div>
    </RouteGuard>
  )
}

function ActiveOrgTeamsCard() {
  // daveyplate TeamsCard requires an organizationId. Pull it from the
  // live session — switching organizations re-renders via useSession's
  // subscription. While loading or when there is no active org we
  // render nothing rather than passing undefined (which the TeamsCard
  // prop type doesn't accept).
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId
  if (!orgId) return null
  return <TeamsCard organizationId={orgId} />
}
