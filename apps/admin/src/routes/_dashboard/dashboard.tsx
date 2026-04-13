import { createFileRoute } from "@tanstack/react-router"
import { SidebarTrigger } from "../../components/ui/sidebar"
import { Separator } from "../../components/ui/separator"

import { authClient } from "../../lib/auth-client"

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: Dashboard,
})

function Dashboard() {
  const { data: session } = authClient.useSession()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">
            Welcome{session?.user.name ? `, ${session.user.name}` : ""}
          </h2>
          <p className="text-muted-foreground">
            Signed in as {session?.user.email}
          </p>
        </div>
      </main>
    </>
  )
}
