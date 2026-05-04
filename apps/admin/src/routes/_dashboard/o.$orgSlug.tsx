import { Outlet, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { CompassIcon } from "lucide-react"

import { authClient } from "#/lib/auth-client"
import { resolveOrgBySlug, syncActiveTenant } from "#/lib/tenant"
import { seo } from "#/lib/seo"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty"

/**
 * 组织作用域 layout —— `/o/:orgSlug` 下所有页面共享。
 *
 * 关键职责:把 URL slug 反解成 organizationId,并在 session 的
 * `activeOrganizationId` 不一致时拨过去(URL 是 SoT)。这样多 tab
 * 各自停留在不同 org 的 URL 时,刷新页面不会互相串数据。
 *
 * UI 上不渲染壳子(沿用 `_dashboard` 的 sidebar / header),只 Outlet。
 *
 * 鉴权同 `_dashboard.tsx` 走 CSR mounting —— `better-auth/react` 的
 * `useSession` 在 SSR 下因 dual-React 报错。
 */
export const Route = createFileRoute("/_dashboard/o/$orgSlug")({
  head: () => seo({ title: "Organization", noindex: true }),
  component: OrgScopeLayout,
})

function OrgScopeLayout() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <OrgScopeLayoutClient />
}

type Resolved = { state: "loading" } | { state: "ok"; id: string } | { state: "missing" }

function OrgScopeLayoutClient() {
  const { orgSlug } = Route.useParams()
  const { data: session } = authClient.useSession()
  const [resolved, setResolved] = useState<Resolved>({ state: "loading" })

  useEffect(() => {
    let cancelled = false
    if (!session) return
    ;(async () => {
      const org = await resolveOrgBySlug(orgSlug)
      if (cancelled) return
      if (!org) {
        setResolved({ state: "missing" })
        return
      }
      setResolved({ state: "ok", id: org.id })
      // URL 是 SoT —— 若 session 不一致,拨到 URL 指向的 org。
      // 不传 teamId,让 server hook 选第一个 team,后续 project layout
      // 会再校正到 URL 里的 :projectSlug。
      if (session.session.activeOrganizationId !== org.id) {
        await syncActiveTenant({ organizationId: org.id })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgSlug, session])

  if (!session) return null

  if (resolved.state === "missing") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CompassIcon className="size-4" />
            </EmptyMedia>
            <EmptyTitle>组织不存在或无权访问</EmptyTitle>
            <EmptyDescription>
              链接里的组织 slug <code>{orgSlug}</code> 找不到对应组织,
              可能已被删除,或你没有该组织的访问权限。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  if (resolved.state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return <Outlet />
}
