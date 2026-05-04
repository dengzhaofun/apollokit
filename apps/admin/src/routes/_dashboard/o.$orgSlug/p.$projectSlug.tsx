import { Outlet, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { CompassIcon } from "lucide-react"

import { authClient } from "#/lib/auth-client"
import {
  resolveOrgBySlug,
  resolveTeamBySlug,
  syncActiveTenant,
} from "#/lib/tenant"
import { seo } from "#/lib/seo"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty"

/**
 * 项目作用域 layout —— `/o/:orgSlug/p/:projectSlug` 下所有业务模块共享。
 *
 * 关键职责:URL 是 SoT —— 把 URL 里的 :projectSlug 反解成 teamId,
 * 若 session.activeTeamId 不一致就调 setActiveTeam 拨过去。这样:
 *   - 多 tab 各自停在不同项目的 URL,刷新页面互不串数据
 *   - 切换项目走 router.navigate 到新 URL,不再 window.location.reload
 *   - 分享一个项目内的页面 URL 给同事,他们打开后能落到同一项目
 *
 * 当前 team 表无 slug 列,:projectSlug 实际承载的是 teamId(见
 * lib/tenant.ts 的 doc)。后续给 team 加 slug 时统一替换。
 */
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug")({
  head: () => seo({ title: "Project", noindex: true }),
  component: ProjectScopeLayout,
})

function ProjectScopeLayout() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <ProjectScopeLayoutClient />
}

type Resolved =
  | { state: "loading" }
  | { state: "ok"; orgId: string; teamId: string }
  | { state: "missing"; reason: "org" | "team" }

function ProjectScopeLayoutClient() {
  const { orgSlug, projectSlug } = Route.useParams()
  const { data: session } = authClient.useSession()
  const [resolved, setResolved] = useState<Resolved>({ state: "loading" })

  useEffect(() => {
    let cancelled = false
    if (!session) return
    ;(async () => {
      const org = await resolveOrgBySlug(orgSlug)
      if (cancelled) return
      if (!org) {
        setResolved({ state: "missing", reason: "org" })
        return
      }
      const team = await resolveTeamBySlug(org.id, projectSlug)
      if (cancelled) return
      if (!team) {
        setResolved({ state: "missing", reason: "team" })
        return
      }
      setResolved({ state: "ok", orgId: org.id, teamId: team.id })
      // URL → session 同步
      const sessionOrg = session.session.activeOrganizationId
      const sessionTeam = session.session.activeTeamId
      if (sessionOrg !== org.id || sessionTeam !== team.id) {
        await syncActiveTenant({
          organizationId: org.id,
          teamId: team.id,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgSlug, projectSlug, session])

  if (!session) return null

  if (resolved.state === "missing") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CompassIcon className="size-4" />
            </EmptyMedia>
            <EmptyTitle>
              {resolved.reason === "org" ? "组织不存在或无权访问" : "项目不存在或无权访问"}
            </EmptyTitle>
            <EmptyDescription>
              {resolved.reason === "org" ? (
                <>组织 <code>{orgSlug}</code> 找不到。</>
              ) : (
                <>项目 <code>{projectSlug}</code> 在该组织下找不到,可能已被删除或你没有权限。</>
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  if (resolved.state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  return <Outlet />
}
