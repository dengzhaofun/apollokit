import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

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
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  // Redirect logged-in users straight into the dashboard. We don't block the
  // initial paint on the session probe — anonymous visitors (the audience of
  // the marketing page) see the landing immediately, which also keeps the
  // route SEO-friendly. Logged-in users briefly see the landing, then bounce.
  useEffect(() => {
    if (isPending) return
    if (session) {
      navigate({ to: "/dashboard", replace: true })
    }
  }, [isPending, session, navigate])

  return <Landing />
}
