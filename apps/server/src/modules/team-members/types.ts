/**
 * 项目级成员(teamMember)模块类型定义。
 *
 * teamMember 表已经存在于 schema/auth.ts(Better Auth team plugin)。
 * 本模块只新增 admin 端的 list/update-role/remove/add 路由,不动表结构。
 */

import type { teamMember } from "../../schema/auth"

export type TeamMember = typeof teamMember.$inferSelect

export interface TeamMemberWithUser {
  id: string
  teamId: string
  userId: string
  role: string
  createdAt: Date | null
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}
