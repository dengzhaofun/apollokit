import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { authClient } from "#/lib/auth-client"

/**
 * 组织成员 hooks —— 包装 Better Auth client 的
 * `organization.listMembers / removeMember / updateMemberRole`,
 * 让上层用 React Query 拿到一致的 loading / error / refetch 状态。
 *
 * Better Auth 的 client SDK 类型对 organization plugin 暴露不全,
 * 这里用 unknown cast 做最小受限契约,只暴露我们用到的字段。
 */

export type OrgMemberRow = {
  id: string
  userId: string
  organizationId: string
  role: string
  createdAt: string | null
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}

export type OrgInvitationRow = {
  id: string
  organizationId: string
  email: string
  role: string | null
  status: string
  expiresAt: string | null
  inviterId: string | null
}

export function useOrgMembers(organizationId: string | null) {
  return useQuery({
    queryKey: ["org-members", organizationId] as const,
    enabled: !!organizationId,
    queryFn: async () => {
      const res = await (
        authClient.organization as unknown as {
          listMembers: (args: {
            query: { organizationId: string; limit?: number }
          }) => Promise<{ data?: { members?: OrgMemberRow[]; total?: number } }>
        }
      ).listMembers({
        query: { organizationId: organizationId!, limit: 200 },
      })
      const list = (res?.data?.members ?? []) as OrgMemberRow[]
      return list
    },
  })
}

export function useOrgInvitations(organizationId: string | null) {
  return useQuery({
    queryKey: ["org-invitations", organizationId] as const,
    enabled: !!organizationId,
    queryFn: async () => {
      const res = await (
        authClient.organization as unknown as {
          listInvitations: (args: {
            query: { organizationId: string }
          }) => Promise<{ data?: OrgInvitationRow[] | null }>
        }
      ).listInvitations({ query: { organizationId: organizationId! } })
      return (res?.data ?? []) as OrgInvitationRow[]
    },
  })
}

export function useUpdateMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      organizationId: string
      memberId: string
      role: string
    }) => {
      const { error } = await (
        authClient.organization as unknown as {
          updateMemberRole: (a: {
            memberId: string
            role: string
            organizationId: string
          }) => Promise<{ error?: { message?: string } | null }>
        }
      ).updateMemberRole({
        memberId: args.memberId,
        role: args.role,
        organizationId: args.organizationId,
      })
      if (error) throw new Error(error.message ?? "更新角色失败")
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["org-members", vars.organizationId] })
    },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      organizationId: string
      memberIdOrEmail: string
    }) => {
      const { error } = await (
        authClient.organization as unknown as {
          removeMember: (a: {
            memberIdOrEmail: string
            organizationId: string
          }) => Promise<{ error?: { message?: string } | null }>
        }
      ).removeMember({
        memberIdOrEmail: args.memberIdOrEmail,
        organizationId: args.organizationId,
      })
      if (error) throw new Error(error.message ?? "移除失败")
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["org-members", vars.organizationId] })
    },
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      organizationId: string
      email: string
      role: string
      teamId?: string
    }) => {
      const { error } = await (
        authClient.organization as unknown as {
          inviteMember: (a: {
            email: string
            role: string
            organizationId: string
            teamId?: string
          }) => Promise<{ error?: { message?: string } | null }>
        }
      ).inviteMember({
        email: args.email,
        role: args.role,
        organizationId: args.organizationId,
        ...(args.teamId ? { teamId: args.teamId } : {}),
      })
      if (error) throw new Error(error.message ?? "邀请失败")
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["org-invitations", vars.organizationId],
      })
    },
  })
}

export function useCancelInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { invitationId: string }) => {
      const { error } = await (
        authClient.organization as unknown as {
          cancelInvitation: (a: {
            invitationId: string
          }) => Promise<{ error?: { message?: string } | null }>
        }
      ).cancelInvitation({ invitationId: args.invitationId })
      if (error) throw new Error(error.message ?? "撤销失败")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-invitations"] })
    },
  })
}

/**
 * 项目成员(teamMember 表)hooks —— 当前 Better Auth client 没有
 * 现成的 listTeamMembers,我们通过自家 server endpoint
 * `/api/v1/team-members` 来访问。先以 fetch 形态暴露,等 PR 4
 * server 端补上路由后立刻可用。
 *
 * 当 server 还没就绪时,fetch 拿不到数据会 throw,这里返回空数组兜底
 * 让 UI 显示"暂无成员"而不是错误页。后续 PR 4 server 落地后切换到
 * 严格错误传播。
 */
export type ProjectMemberRow = {
  id: string
  userId: string
  teamId: string
  role: string
  createdAt: string | null
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  } | null
}

export function useProjectMembers(teamId: string | null) {
  return useQuery({
    queryKey: ["project-members", teamId] as const,
    enabled: !!teamId,
    queryFn: async (): Promise<ProjectMemberRow[]> => {
      const res = await fetch(`/api/v1/team-members?teamId=${teamId}`, {
        credentials: "include",
      })
      if (!res.ok) {
        // 后端 503 / 网络错时返回空,避免 UI 报红
        if (res.status >= 500 || res.status === 0) return []
        throw new Error(`team-members fetch failed: ${res.status}`)
      }
      // server 返回 envelope `{ code, data: { items: [...] }, message, requestId }`
      const json = (await res.json()) as {
        code?: string
        data?: { items?: ProjectMemberRow[] }
      }
      return json.data?.items ?? []
    },
  })
}
