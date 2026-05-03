import { useQuery } from "@tanstack/react-query"

import { authClient } from "#/lib/auth-client"
import { listOrgsForUser } from "#/lib/tenant"

/**
 * 拿当前 active org 的 slug + active team id(我们用 teamId 做 :projectSlug)。
 *
 * 业务模块路由迁移到 `/o/$orgSlug/p/$projectSlug/...` 后,所有 Link / navigate
 * 都要带 `params={{ orgSlug, projectSlug }}`。这个 hook 是单一入口,session
 * 改变会自动 invalidate 拿新 slug。
 */
export function useTenantParams(): {
  orgSlug: string
  projectSlug: string
} {
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeOrganizationId ?? null
  const teamId = session?.session.activeTeamId ?? null

  const { data: orgs } = useQuery({
    queryKey: ["org-list-for-tenant"],
    queryFn: () => listOrgsForUser(),
  })
  const orgSlug = orgs?.find((o) => o.id === orgId)?.slug ?? ""

  return {
    orgSlug,
    projectSlug: teamId ?? "",
  }
}
