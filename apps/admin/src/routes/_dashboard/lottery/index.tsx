import { createFileRoute, Link } from "@tanstack/react-router"
import { DicesIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useLotteryPools } from "#/hooks/use-lottery"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/lottery/")({
  component: LotteryListPage,
})

function LotteryListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: pools, isPending, error, refetch } = useLotteryPools(
    scopeToFilter(scope),
  )
  const total = pools?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<DicesIcon className="size-5" />}
        title={t("抽奖池", "Lottery pools")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个抽奖池`, `${total} pools total`)
        }
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Button asChild size="sm">
              <Link to="/lottery/create">
                <Plus />
                {t("新建抽奖池", "New pool")}
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
            title={t("抽奖池加载失败", "Failed to load lottery pools")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有抽奖池", "No lottery pools yet")}
            description={t(
              "创建第一个抽奖池,设置奖品和概率分布。",
              "Create your first pool with prize tiers and probability distribution.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/lottery/create">
                  <Plus />
                  {t("新建抽奖池", "New pool")}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <LotteryPoolTable data={pools ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
