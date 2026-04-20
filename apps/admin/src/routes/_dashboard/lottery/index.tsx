import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { Button } from "#/components/ui/button"
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
import { useLotteryPools } from "#/hooks/use-lottery"
import { PageHeaderActions } from "#/components/PageHeader"

export const Route = createFileRoute("/_dashboard/lottery/")({
  component: LotteryListPage,
})

function LotteryListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: pools, isPending, error } = useLotteryPools(
    scopeToFilter(scope),
  )

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-3">
          <ActivityScopeFilter value={scope} onChange={setScope} />
          <Button asChild size="sm">
            <Link to="/lottery/create">
              <Plus className="size-4" />
              New Pool
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Failed to load pools: {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <LotteryPoolTable data={pools ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
