import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { GroupTable } from "#/components/banner/GroupTable"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { useBannerGroups } from "#/hooks/use-banner"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/banner/")({
  component: BannerListPage,
})

function BannerListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: items, isPending, error } = useBannerGroups(
    scopeToFilter(scope),
  )

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.banner_title()}</h1>
        <div className="ml-auto flex items-center gap-3">
          <ActivityScopeFilter value={scope} onChange={setScope} />
          <Button asChild size="sm">
            <Link to="/banner/create">
              <Plus className="size-4" />
              {m.banner_new_group()}
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
            {m.banner_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <GroupTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
