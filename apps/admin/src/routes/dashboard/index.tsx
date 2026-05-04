import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { authClient } from "#/lib/auth-client"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { checkAuthAndGetTenant } from "#/lib/server-auth"

/**
 * `/dashboard` — entry point after sign-in (used by Better Auth redirectTo
 * and oneTap callbackURL). Immediately bounces to the tenant-scoped dashboard.
 *
 * SSR: resolves org/project via service binding and issues a 302 before HTML.
 * Client: waits for session + tenant params then navigates.
 */
export const Route = createFileRoute("/dashboard/")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") return
    const tenant = await checkAuthAndGetTenant()
    if (tenant) {
      throw redirect({
        to: "/o/$orgSlug/p/$projectSlug/dashboard",
        params: tenant,
        replace: true,
      })
    }
  },
  component: DashboardRedirect,
})

function DashboardRedirect() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null
  return <DashboardRedirectClient />
}

function DashboardRedirectClient() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const { orgSlug, projectSlug } = useTenantParams()

  useEffect(() => {
    if (isPending) return
    if (!session) {
      navigate({ to: "/auth/$authView", params: { authView: "sign-in" }, replace: true })
      return
    }
    if (!orgSlug || !projectSlug) return
    navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true, params: { orgSlug, projectSlug } })
  }, [isPending, session, orgSlug, projectSlug, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  )
}
