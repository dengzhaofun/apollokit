import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
import { useLotteryPools } from "#/hooks/use-lottery"

export const Route = createFileRoute("/_dashboard/lottery/")({
  component: LotteryListPage,
})

function LotteryListPage() {
  const { data: pools, isPending, error } = useLotteryPools()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">Lottery Pools</h1>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/lottery/create">
              <Plus className="size-4" />
              New Pool
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
