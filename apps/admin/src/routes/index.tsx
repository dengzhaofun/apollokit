import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import Landing from "#/components/landing/Landing"
import { authClient } from "#/lib/auth-client"
import { seo } from "#/lib/seo"

export const Route = createFileRoute("/")({
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

  useEffect(() => {
    if (isPending) return
    if (session) {
      navigate({ to: "/dashboard", replace: true })
    }
  }, [isPending, session, navigate])

  return null
}
