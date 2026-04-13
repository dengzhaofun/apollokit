import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { AppSidebar } from "../components/AppSidebar"
import { authClient } from "../lib/auth-client"
import {
  SidebarInset,
  SidebarProvider,
} from "../components/ui/sidebar"

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
})

function DashboardLayout() {
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
