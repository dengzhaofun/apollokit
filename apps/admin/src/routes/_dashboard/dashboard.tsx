import { createFileRoute } from "@tanstack/react-router"

import { authClient } from "../../lib/auth-client"
import * as m from "../../paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: Dashboard,
})

function Dashboard() {
  const { data: session } = authClient.useSession()

  return (
    <>
      <main className="flex-1 p-6">
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">
            Welcome{session?.user.name ? `, ${session.user.name}` : ""}
          </h2>
          <p className="text-muted-foreground">
            {m.dashboard_signed_in_as()} {session?.user.email}
          </p>
        </div>
      </main>
    </>
  )
}
