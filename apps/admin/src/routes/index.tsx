import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import Landing from "#/components/landing/Landing"
import { authClient } from "#/lib/auth-client"

export const Route = createFileRoute("/")({
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
