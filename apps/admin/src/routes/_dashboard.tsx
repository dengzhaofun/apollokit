import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AppSidebar } from "../components/AppSidebar"
import { authClient } from "../lib/auth-client"
import {
  SidebarInset,
  SidebarProvider,
} from "../components/ui/sidebar"

export const Route = createFileRoute("/_dashboard")({
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
    if (!isPending && !session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" } })
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
