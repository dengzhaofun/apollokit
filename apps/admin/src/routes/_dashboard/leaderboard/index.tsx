import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { LeaderboardConfigTable } from "#/components/leaderboard/ConfigTable"
import { Button } from "#/components/ui/button"
import {
  useLeaderboardConfigs,
  useRunLeaderboardSettle,
} from "#/hooks/use-leaderboard"
import { ApiError } from "#/lib/api-client"
import { PageHeaderActions } from "#/components/PageHeader"

export const Route = createFileRoute("/_dashboard/leaderboard/")({
  component: LeaderboardListPage,
})

function LeaderboardListPage() {
  const { data: configs, isPending, error } = useLeaderboardConfigs()
  const settleMutation = useRunLeaderboardSettle()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={settleMutation.isPending}
            onClick={async () => {
              try {
                const r = await settleMutation.mutateAsync()
                toast.success(
                  `结算完成：成功 ${r.settled} 条，错误 ${r.errors} 条`,
                )
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("触发结算失败")
              }
            }}
          >
            <RotateCw className="size-4" />
            手动触发结算
          </Button>
          <Button asChild size="sm">
            <Link to="/leaderboard/create">
              <Plus className="size-4" />
              新建榜单
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            加载中…
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            加载失败：{error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <LeaderboardConfigTable data={configs ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
