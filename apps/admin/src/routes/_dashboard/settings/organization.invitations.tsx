import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { InvitationsTable } from "#/components/members/InvitationsTable"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

/**
 * 组织 → 邀请 (`/settings/organization/invitations`)。
 *
 * 列出待审/已过期 org 邀请,支持重发 / 撤销 / 复制邀请链接。
 * 新邀请的提交入口在 organization.members.tsx 的"邀请成员"按钮。
 */
export const Route = createFileRoute("/_dashboard/settings/organization/invitations")({
  head: () => seo({ title: "Organization invitations", noindex: true }),
  component: OrgInvitationsPage,
})

function OrgInvitationsPage() {
  return (
    <RouteGuard
      resource="organization"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-5xl">
        <SettingsPageHeader
          title={m.settings_invitations()}
          description={m.settings_org_invitations_description()}
        />
        <InvitationsTable scope="org" />
      </div>
    </RouteGuard>
  )
}
