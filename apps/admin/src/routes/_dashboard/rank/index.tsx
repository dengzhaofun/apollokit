import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarClock, Plus, SwordsIcon } from "lucide-react"

import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { TierConfigTable } from "#/components/rank/TierConfigTable"
import { Button } from "#/components/ui/button"
import { useRankTierConfigs } from "#/hooks/use-rank"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/rank/")({
  component: RankConfigsPage,
})

function RankConfigsPage() {
  const { data: configs, isPending, error, refetch } = useRankTierConfigs()
  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<SwordsIcon className="size-5" />}
        title={t("段位配置", "Rank tiers")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个段位体系`, `${total} tier configs total`)
        }
        actions={
          <>
            <Button
              render={
                <Link to="/rank/seasons">
                  <CalendarClock />
                  {m.rank_tab_seasons()}
                </Link>
              }
              variant="outline" size="sm"
            />
            <Button
              render={
                <Link to="/rank/create">
                  <Plus />
                  {m.rank_new_config()}
                </Link>
              }
              size="sm"
            />
          </>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.rank_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("段位配置加载失败", "Failed to load rank configs")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有段位配置", "No rank tiers yet")}
            description={t(
              "创建第一个段位体系,定义青铜→王者的进阶规则与赛季奖励。",
              "Create your first tier ladder with progression rules and season rewards.",
            )}
            action={
              <Button
                render={
                  <Link to="/rank/create">
                    <Plus />
                    {m.rank_new_config()}
                  </Link>
                }
                size="sm"
              />
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <TierConfigTable data={configs ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
