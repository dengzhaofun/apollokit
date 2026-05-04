/**
 * Layout for the platform-operator surface (`/admin/*`).
 *
 * Distinct from `_dashboard.tsx` (the tenant view): no org/project
 * switcher, no business-module sidebar, simpler header. The two
 * surfaces are deliberately separate route groups so URL state
 * (`o.$orgSlug/p.$projectSlug`) doesn't bleed into platform pages
 * that are inherently cross-tenant.
 *
 * Access gate: `useCapabilities().isPlatformAdmin`. Non-admins are
 * redirected back to `/dashboard` (their own workspace) rather than
 * shown a 403 — they're legitimate users, just not for this surface.
 */

import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AdminSidebar } from "../components/AdminSidebar"
import { authClient } from "../lib/auth-client"
import { useCapabilities } from "../lib/capabilities"
import { seo } from "../lib/seo"
import { Separator } from "../components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar"

export const Route = createFileRoute("/admin")({
  head: () => seo({ title: "Platform admin", noindex: true }),
  component: AdminLayout,
})

/**
 * Same SSR-bypass pattern as `_dashboard.tsx` — Better Auth's
 * `useSession` hits a dual-React-package issue under Vite SSR.
 * Render a skeleton until client mount, then mount the real
 * session-aware shell.
 */
function AdminLayout() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return <AdminLayoutClient />
}

function AdminLayoutClient() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  // We use `activeTeamId` as the cache key for `useCapabilities` to mirror
  // `_dashboard`. Platform admins always have an org/team of their own
  // (auto-provisioned at signup), so this isn't usually null. If it is —
  // e.g. mid-onboarding — the redirect below kicks in first anyway.
  const orgId = session?.session.activeTeamId ?? null
  const { data: capabilities, isPending: capsPending } = useCapabilities(orgId)

  useEffect(() => {
    if (isPending) return
    if (!session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
      return
    }
    // Wait for capabilities to load before deciding admin status —
    // jumping early would briefly redirect every admin to /dashboard
    // on a hard refresh.
    if (capsPending) return
    if (!capabilities?.isPlatformAdmin) {
      navigate({ to: "/dashboard", replace: true })
    }
  }, [isPending, session, capsPending, capabilities, navigate])

  if (isPending || capsPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!session) return null
  if (!capabilities?.isPlatformAdmin) return null

  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2" />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
