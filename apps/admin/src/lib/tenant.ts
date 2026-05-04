import { authClient } from "#/lib/auth-client"

/**
 * 双层租户解析工具 — URL 是 SoT (`/o/:orgSlug/p/:projectSlug/...`)，
 * 但 server 中间件读 `session.activeOrganizationId` / `activeTeamId`。
 * 这里负责 URL slug → id 的解析，并把 session 的 active 字段拨到
 * 与 URL 一致。
 *
 * 命名约定:
 *   - org slug 来自 `organization.slug`(Better Auth schema 字段)。
 *   - project slug 我们用 `team.id` 作 fallback —— Better Auth team 表
 *     当前没有 slug 列(见 apps/server/src/schema/auth.ts:120)。一期内
 *     URL 里 `:projectSlug` 实际承载的是 teamId,后续若给 team 加 slug
 *     列再迁移。这是务实选择:URL 仍能分享、刷新仍正确,只是不"美"。
 */

type OrgRow = {
  id: string
  name: string
  slug: string
  logo?: string | null
}

type TeamRow = {
  id: string
  name: string
  organizationId: string
}

export type ResolvedOrg = OrgRow
export type ResolvedTeam = TeamRow

const orgListCache = new Map<string, Promise<OrgRow[]>>()
const teamListCache = new Map<string, Promise<TeamRow[]>>()

function listOrganizations(): Promise<OrgRow[]> {
  const key = "__shared__"
  let p = orgListCache.get(key)
  if (!p) {
    p = (async () => {
      const res = await authClient.organization.list()
      const rows = ((res?.data ?? []) as OrgRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        logo: r.logo ?? null,
      }))
      return rows
    })()
    orgListCache.set(key, p)
  }
  return p
}

function listTeams(organizationId: string): Promise<TeamRow[]> {
  let p = teamListCache.get(organizationId)
  if (!p) {
    p = (async () => {
      const res = await (
        authClient.organization as unknown as {
          listTeams: (args: {
            query: { organizationId: string }
          }) => Promise<{ data?: TeamRow[] | null }>
        }
      ).listTeams({ query: { organizationId } })
      return (res?.data ?? []) as TeamRow[]
    })()
    teamListCache.set(organizationId, p)
  }
  return p
}

/** 强制刷新缓存 — 创建/删除 org/team 后调用。 */
export function invalidateTenantCache() {
  orgListCache.clear()
  teamListCache.clear()
}

export async function resolveOrgBySlug(slug: string): Promise<OrgRow | null> {
  const orgs = await listOrganizations()
  return orgs.find((o) => o.slug === slug) ?? null
}

export async function resolveTeamBySlug(
  organizationId: string,
  slug: string,
): Promise<TeamRow | null> {
  const teams = await listTeams(organizationId)
  // 当前 team 没有 slug 列,project slug 实际是 teamId
  return teams.find((t) => t.id === slug) ?? null
}

export async function listOrgsForUser(): Promise<OrgRow[]> {
  return await listOrganizations()
}

export async function listTeamsForOrg(
  organizationId: string,
): Promise<TeamRow[]> {
  return await listTeams(organizationId)
}

/** 把 session.activeOrganizationId/activeTeamId 拨到与给定 ids 一致。 */
export async function syncActiveTenant(opts: {
  organizationId: string
  teamId?: string | null
}): Promise<void> {
  const { organizationId, teamId } = opts
  // setActiveOrganization 会顺带选 team(server hook 自动选第一个),
  // 我们紧接着再 setActiveTeam 覆盖到指定 teamId。
  await authClient.organization.setActive({ organizationId })
  if (teamId) {
    await (
      authClient.organization as unknown as {
        setActiveTeam: (args: { teamId: string }) => Promise<unknown>
      }
    ).setActiveTeam({ teamId })
  }
}

/**
 * 项目 URL 拼接器 — 单一出口,避免散落的 string concat。
 *
 * 对 router.navigate 友好:返回的字符串可直接给 `to: ...`。
 * 对未来的 typed param 友好:这里集中以后好替换。
 */
export function projectUrl(
  orgSlug: string,
  projectSlug: string,
  rest: string = "",
): string {
  const tail = rest.startsWith("/") ? rest : rest ? `/${rest}` : ""
  return `/o/${orgSlug}/p/${projectSlug}${tail}`
}

export function orgUrl(orgSlug: string, rest: string = ""): string {
  const tail = rest.startsWith("/") ? rest : rest ? `/${rest}` : ""
  return `/o/${orgSlug}${tail}`
}
