import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarClock, Plus } from "lucide-react"

import { TierConfigTable } from "#/components/rank/TierConfigTable"
import { Button } from "#/components/ui/button"
import { useRankTierConfigs } from "#/hooks/use-rank"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/rank/")({
  component: RankConfigsPage,
})

function RankConfigsPage() {
  const { data: configs, isPending, error } = useRankTierConfigs()

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="outline" size="sm">
          <Link to="/rank/seasons">
            <CalendarClock className="size-4" />
            {m.rank_tab_seasons()}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/rank/create">
            <Plus className="size-4" />
            {m.rank_new_config()}
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.rank_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.rank_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <TierConfigTable data={configs ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
