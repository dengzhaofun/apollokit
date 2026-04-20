import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { authClient } from "../lib/auth-client"

export const Route = createFileRoute("/")({
  component: IndexRedirect,
})

function IndexRedirect() {
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

  return <IndexRedirectClient />
}

function IndexRedirectClient() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending) return
    if (session) {
      navigate({ to: "/dashboard", replace: true })
    } else {
      navigate({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
        replace: true,
      })
    }
  }, [isPending, session, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  )
}
