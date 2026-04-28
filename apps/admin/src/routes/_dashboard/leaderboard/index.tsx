import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, RotateCw, TrophyIcon } from "lucide-react"
import { toast } from "sonner"

import { LeaderboardConfigTable } from "#/components/leaderboard/ConfigTable"
import { confirm, PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useRunLeaderboardSettle } from "#/hooks/use-leaderboard"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/leaderboard/")({
  component: LeaderboardListPage,
  validateSearch: listSearchSchema.passthrough(),
})

function LeaderboardListPage() {
  const settleMutation = useRunLeaderboardSettle()

  return (
    <PageShell>
      <PageHeader
        icon={<TrophyIcon className="size-5" />}
        title={t("排行榜", "Leaderboards")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={settleMutation.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: t("立即触发结算?", "Trigger settlement now?"),
                  description: t(
                    "所有进行中的榜单都会按当前数据快照立即结算并入历史。运行中的赛季可能受影响。",
                    "All active leaderboards will be settled with current snapshot and archived. Active seasons may be affected.",
                  ),
                  confirmLabel: t("开始结算", "Settle now"),
                })
                if (!ok) return
                try {
                  const r = await settleMutation.mutateAsync()
                  toast.success(
                    t(
                      `结算完成：成功 ${r.settled} 条，错误 ${r.errors} 条`,
                      `Settled: ${r.settled} success, ${r.errors} errors`,
                    ),
                  )
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(t("触发结算失败", "Failed to settle"))
                }
              }}
            >
              <RotateCw />
              {t("手动触发结算", "Settle now")}
            </Button>
            <Button
              render={
                <Link to="/leaderboard/create">
                  <Plus />
                  {t("新建榜单", "New leaderboard")}
                </Link>
              }
              size="sm"
            />
          </>
        }
      />

      <PageBody>
        <LeaderboardConfigTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
