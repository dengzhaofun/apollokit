import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { MembersTable } from "#/components/members/MembersTable"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

/**
 * 组织 → 成员 (`/settings/organization/members`)。
 *
 * Org 级成员管理:列出该组织的所有成员、角色变更、移除。邀请相关在
 * 同级 invitations 子页。
 *
 * 权限:`organization:update`(orgOwner / orgAdmin)。
 */
export const Route = createFileRoute("/_dashboard/settings/organization/members")({
  head: () => seo({ title: "Organization members", noindex: true }),
  component: OrgMembersPage,
})

function OrgMembersPage() {
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-5xl">
        <SettingsPageHeader
          title={m.settings_members()}
          description={m.settings_org_members_description()}
        />
        <MembersTable scope="org" />
      </div>
    </RouteGuard>
  )
}
