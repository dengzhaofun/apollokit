import {
  OrganizationSettingsCards,
  TeamsCard,
} from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

/**
 * 组织 → 概览页 (`/settings/organization`)。
 *
 * Settings IA 拆分后,本页只承载"组织 General"(名称 / slug / logo 等)。
 * 成员 / 邀请 / 危险区移到独立的子页(`organization.members.tsx` 等)。
 *
 * 当前还在用 daveyplate `OrganizationSettingsCards` 做 General 卡片;
 * 后续(PR follow-up)用自家 shadcn 表单完整重写,以统一视觉与权限驱动
 * 字段可见性。`TeamsCard`(项目列表)也是 daveyplate 的,等 OrgOverview
 * 页(/o/:slug)完整后从这里下线。
 */
export const Route = createFileRoute("/_dashboard/settings/organization/")({
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
      <div className="mx-auto w-full max-w-3xl">
        <SettingsPageHeader
          title={m.settings_org_overview()}
          description={m.settings_org_overview_description()}
        />
        <div className="space-y-6">
          <OrganizationSettingsCards />
          <ActiveOrgTeamsCard />
        </div>
      </div>
    </RouteGuard>
  )
}

function ActiveOrgTeamsCard() {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId
  if (!orgId) return null
  return <TeamsCard organizationId={orgId} />
}
