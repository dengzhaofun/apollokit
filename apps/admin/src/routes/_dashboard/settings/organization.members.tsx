import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { MembersTable } from "#/components/members/MembersTable"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { seo } from "#/lib/seo"

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
          title="组织成员"
          description="管理该组织内所有成员。成员可在多个项目中担任不同角色。邀请新成员请到 邀请 子页。"
        />
        <MembersTable scope="org" />
      </div>
    </RouteGuard>
  )
}
