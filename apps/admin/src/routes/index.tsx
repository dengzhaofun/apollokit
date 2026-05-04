import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import Landing from "#/components/landing/Landing"
import { authClient } from "#/lib/auth-client"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { seo } from "#/lib/seo"
import { checkAuthAndGetTenant } from "#/lib/server-auth"

export const Route = createFileRoute("/")({
  // SSR-only: if the user already has a valid session, redirect to the
  // dashboard before any HTML is sent — eliminates the 1-2 s client-side
  // wait caused by the mounted guard + useSession + org-list fetch chain.
  // Client-side navigation to "/" is handled by SignedInBouncer below.
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
  head: () =>
    seo({
      title: "游戏团队的一站式运营后台",
      description:
        "ApolloKit 提供玩家、货币、礼品、活动、助力池、公会等通用运营模块,帮助游戏团队最短时间上线完整后台能力。",
      path: "/",
    }),
  component: IndexPage,
})

function IndexPage() {
  return (
    <>
      <SignedInBouncer />
      <Landing />
    </>
  )
}

/**
 * Tiny client-only component whose only job is to redirect signed-in
 * visitors to `/dashboard`. Split out so that `useSession` (which
 * can't run under Vite SSR due to the dual-React hazard; see
 * `_dashboard.tsx`) only runs after mount — otherwise the hook
 * either no-ops or sits at `isPending: true` through the first
 * paint and the redirect never fires, leaving logged-in users
 * stuck on the marketing landing.
 */
function SignedInBouncer() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null
  return <SignedInBouncerClient />
}

function SignedInBouncerClient() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const { orgSlug, projectSlug } = useTenantParams()

  useEffect(() => {
    if (isPending) return
    if (!session) return
    // 等 tenant slug 解析完成才跳转,否则 wrapper 会把 /dashboard
    // 拼成 /o//p//dashboard 导致 notFound。
    if (!orgSlug || !projectSlug) return
    navigate({ to: "/o/$orgSlug/p/$projectSlug/dashboard", replace: true , params: { orgSlug, projectSlug }})
  }, [isPending, session, orgSlug, projectSlug, navigate])

  return null
}
