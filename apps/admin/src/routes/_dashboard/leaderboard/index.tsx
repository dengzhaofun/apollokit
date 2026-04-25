import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, RotateCw, TrophyIcon } from "lucide-react"
import { toast } from "sonner"

import { LeaderboardConfigTable } from "#/components/leaderboard/ConfigTable"
import {
  confirm,
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  useLeaderboardConfigs,
  useRunLeaderboardSettle,
} from "#/hooks/use-leaderboard"
import { ApiError } from "#/lib/api-client"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/leaderboard/")({
  component: LeaderboardListPage,
})

function LeaderboardListPage() {
  const { data: configs, isPending, error, refetch } = useLeaderboardConfigs()
  const settleMutation = useRunLeaderboardSettle()
  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<TrophyIcon className="size-5" />}
        title={t("排行榜", "Leaderboards")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个榜单`, `${total} leaderboards total`)
        }
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
            <Button asChild size="sm">
              <Link to="/leaderboard/create">
                <Plus />
                {t("新建榜单", "New leaderboard")}
              </Link>
            </Button>
          </>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {t("加载中…", "Loading…")}
          </div>
        ) : error ? (
          <ErrorState
            title={t("榜单加载失败", "Failed to load leaderboards")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有榜单", "No leaderboards yet")}
            description={t(
              "创建第一个榜单,设置周期、排序规则、奖励配置。",
              "Create your first leaderboard with cycle, ranking rules, and rewards.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/leaderboard/create">
                  <Plus />
                  {t("新建榜单", "New leaderboard")}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <LeaderboardConfigTable data={configs ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
