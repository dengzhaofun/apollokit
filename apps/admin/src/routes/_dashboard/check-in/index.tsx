import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { ConfigTable } from "#/components/check-in/ConfigTable"
import { useCheckInConfigs } from "#/hooks/use-check-in"

export const Route = createFileRoute("/_dashboard/check-in/")({
  component: CheckInListPage,
})

function CheckInListPage() {
  const { data: configs, isPending, error } = useCheckInConfigs()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">Check-in Configs</h1>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/check-in/create">
              <Plus className="size-4" />
              New Config
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Failed to load configs: {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <ConfigTable data={configs ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
