import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { ConfigTable } from "#/components/check-in/ConfigTable"
import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { useCheckInConfigs } from "#/hooks/use-check-in"

export const Route = createFileRoute("/_dashboard/check-in/")({
  component: CheckInListPage,
})

function CheckInListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: configs, isPending, error } = useCheckInConfigs(
    scopeToFilter(scope),
  )

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.checkin_title()}</h1>
        <div className="ml-auto flex items-center gap-3">
          <ActivityScopeFilter value={scope} onChange={setScope} />
          <Button asChild size="sm">
            <Link to="/check-in/create">
              <Plus className="size-4" />
              {m.checkin_new_config()}
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.checkin_failed_load_configs()} {error.message}
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
