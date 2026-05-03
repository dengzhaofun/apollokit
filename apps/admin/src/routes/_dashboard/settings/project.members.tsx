import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { MembersTable } from "#/components/members/MembersTable"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { seo } from "#/lib/seo"

/**
 * 项目 → 成员 (`/settings/project/members`)。
 *
 * Project 级成员管理:列出当前 active project 的成员,支持邀请、
 * 角色变更、移除。基于 teamMember 表(项目级 RBAC 角色:owner /
 * admin / operator / viewer / member)。
 *
 * 权限:`team:read-members`(viewer 起)。变更类操作需 `team:invite` /
 * `team:remove-member` / `team:update-role`(owner / admin)。
 */
export const Route = createFileRoute("/_dashboard/settings/project/members")({
  head: () => seo({ title: "Project members", noindex: true }),
  component: ProjectMembersPage,
})

function ProjectMembersPage() {
  return (
    <RouteGuard
      resource="team"
      action="read"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-5xl">
        <SettingsPageHeader
          title="项目成员"
          description="管理当前项目内的成员与角色。成员必须先是该组织的成员才能加入项目。"
        />
        <MembersTable scope="project" />
      </div>
    </RouteGuard>
  )
}
