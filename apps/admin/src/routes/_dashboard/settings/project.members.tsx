import { createFileRoute } from "@tanstack/react-router"

import { RouteGuard } from "#/components/auth/RouteGuard"
import { MembersTable } from "#/components/members/MembersTable"
import { SettingsPageHeader } from "#/components/settings/SettingsPageHeader"
import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

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
  // 鉴权说明:Better Auth defaultStatements.team 没有 "read" action,
  // 所以用 "update"——与 project.index/project.roles 保持一致(orgOwner/
  // orgAdmin 通过 ownerAc/adminAc.statements 获得 team:update;团队级 owner
  // 通过自定义 manageEverywhere 不直接拿 team,但他们仍是该项目成员,可在
  // 业务层通过 useProjectMembers 自家 endpoint 读到)。
  // 写操作(邀请/角色变更/移除)由 server endpoint 进一步用 orgMember:invite /
  // orgMember:remove 守卫。
  return (
    <RouteGuard
      resource="team"
      action="update"
      visibility="unauthorized-page"
    >
      <div className="mx-auto w-full max-w-5xl">
        <SettingsPageHeader
          title={m.settings_members()}
          description={m.settings_project_members_description()}
        />
        <MembersTable scope="project" />
      </div>
    </RouteGuard>
  )
}
