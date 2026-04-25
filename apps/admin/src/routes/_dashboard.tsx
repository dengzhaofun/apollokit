import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AppSidebar } from "../components/AppSidebar"
import { CommandPalette } from "../components/CommandPalette"
import { DocsHelpButton } from "../components/DocsHelpButton"
import { PAGE_HEADER_SLOT_ID } from "../components/PageHeader"
import { RouteBreadcrumb } from "../components/RouteBreadcrumb"
import { authClient } from "../lib/auth-client"
import { seo } from "../lib/seo"
import { Separator } from "../components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar"

export const Route = createFileRoute("/_dashboard")({
  // 后台登录后内容不面向搜索引擎。布局路由打 noindex,所有 `/dashboard/*`
  // 子路由继承;需要更细 tab title 的子路由再各自覆盖 title 即可。
  head: () => seo({ title: "Dashboard", noindex: true }),
  component: DashboardLayout,
})

/**
 * `better-auth/react`'s `useSession` internally uses a store built on
 * `useSyncExternalStore`/`useRef`. Under Vite SSR, that module ends up
 * loading a second copy of React (dual-package hazard) and React's
 * internal dispatcher is null when the hooks run — producing the
 * "Invalid hook call / Cannot read properties of null (reading 'useRef')"
 * error. Bypassing SSR for the protected dashboard shell is the least
 * invasive fix: render a skeleton during SSR + initial hydration, then
 * mount the real session-aware component on the client.
 */
function DashboardLayout() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return <DashboardLayoutClient />
}

function DashboardLayoutClient() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (isPending) return
    if (!session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
      return
    }
    // Server-side admin routes gate on `activeOrganizationId` (see
    // `require-admin-or-api-key.ts`). A session without one 401s every
    // business endpoint, producing a dashboard full of silent failures.
    // Send the user to onboarding to create (or pick) an org first.
    if (!session.session.activeOrganizationId) {
      navigate({ to: "/onboarding/create-org", replace: true })
    }
  }, [isPending, session, navigate])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) return null
  if (!session.session.activeOrganizationId) return null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <RouteBreadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <DocsHelpButton />
            <div
              id={PAGE_HEADER_SLOT_ID}
              className="flex items-center gap-2"
            />
          </div>
        </header>
        <Outlet />
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}
