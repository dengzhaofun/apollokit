import { and, eq } from "drizzle-orm"

import type { AppDeps } from "../../deps"
import { member, team, teamMember, user } from "../../schema/auth"

import {
  DuplicateTeamMember,
  TargetUserNotInOrg,
  TeamMemberNotFound,
  TeamNotInActiveOrg,
} from "./errors"
import type { TeamMemberWithUser } from "./types"

type TeamMemberDeps = Pick<AppDeps, "db">

/**
 * 项目级成员服务 —— 操作 Better Auth `team_member` 表 + JOIN `user` 拿到
 * 显示信息。所有方法都要求传入 `organizationId`,内部校验 team 必须属于
 * 该 org,防止横向越权。
 */
export function createTeamMemberService(d: TeamMemberDeps) {
  return {
    async list(args: {
      organizationId: string
      teamId: string
    }): Promise<TeamMemberWithUser[]> {
      await assertTeamInOrg(d, args.teamId, args.organizationId)

      const rows = await d.db
        .select({
          id: teamMember.id,
          teamId: teamMember.teamId,
          userId: teamMember.userId,
          role: teamMember.role,
          createdAt: teamMember.createdAt,
          userIdJoin: user.id,
          userName: user.name,
          userEmail: user.email,
          userImage: user.image,
        })
        .from(teamMember)
        .leftJoin(user, eq(user.id, teamMember.userId))
        .where(eq(teamMember.teamId, args.teamId))

      return rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        userId: r.userId,
        role: r.role,
        createdAt: r.createdAt,
        // leftJoin 命中时 user.* 都非 null(schema 上 email/name 都 notNull),
        // 但 drizzle 推断不出条件依赖,这里手动收口。
        user: r.userIdJoin && r.userEmail
          ? {
              id: r.userIdJoin,
              name: r.userName,
              email: r.userEmail,
              image: r.userImage,
            }
          : null,
      }))
    },

    async updateRole(args: {
      organizationId: string
      teamMemberId: string
      role: string
    }): Promise<TeamMemberWithUser> {
      const row = await d.db
        .select()
        .from(teamMember)
        .where(eq(teamMember.id, args.teamMemberId))
        .limit(1)
      const tm = row[0]
      if (!tm) throw new TeamMemberNotFound(args.teamMemberId)
      await assertTeamInOrg(d, tm.teamId, args.organizationId)

      await d.db
        .update(teamMember)
        .set({ role: args.role })
        .where(eq(teamMember.id, args.teamMemberId))

      const list = await this.list({
        organizationId: args.organizationId,
        teamId: tm.teamId,
      })
      const updated = list.find((m) => m.id === args.teamMemberId)
      if (!updated) throw new TeamMemberNotFound(args.teamMemberId)
      return updated
    },

    async remove(args: {
      organizationId: string
      teamMemberId: string
    }): Promise<void> {
      const row = await d.db
        .select()
        .from(teamMember)
        .where(eq(teamMember.id, args.teamMemberId))
        .limit(1)
      const tm = row[0]
      if (!tm) throw new TeamMemberNotFound(args.teamMemberId)
      await assertTeamInOrg(d, tm.teamId, args.organizationId)

      await d.db.delete(teamMember).where(eq(teamMember.id, args.teamMemberId))
    },

    async add(args: {
      organizationId: string
      teamId: string
      userId: string
      role: string
    }): Promise<TeamMemberWithUser> {
      await assertTeamInOrg(d, args.teamId, args.organizationId)

      // 校验目标用户已经是该 org 的成员
      const orgMember = await d.db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, args.organizationId),
            eq(member.userId, args.userId),
          ),
        )
        .limit(1)
      if (orgMember.length === 0) throw new TargetUserNotInOrg()

      // 防止重复添加
      const existing = await d.db
        .select({ id: teamMember.id })
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, args.teamId),
            eq(teamMember.userId, args.userId),
          ),
        )
        .limit(1)
      if (existing.length > 0) throw new DuplicateTeamMember()

      const id = crypto.randomUUID()
      await d.db.insert(teamMember).values({
        id,
        teamId: args.teamId,
        userId: args.userId,
        role: args.role,
        createdAt: new Date(),
      })

      const list = await this.list({
        organizationId: args.organizationId,
        teamId: args.teamId,
      })
      const created = list.find((m) => m.id === id)
      if (!created) throw new TeamMemberNotFound(id)
      return created
    },
  }
}

async function assertTeamInOrg(
  d: TeamMemberDeps,
  teamId: string,
  organizationId: string,
) {
  const r = await d.db
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
    .limit(1)
  if (r.length === 0) throw new TeamNotInActiveOrg()
}

export type TeamMemberService = ReturnType<typeof createTeamMemberService>
