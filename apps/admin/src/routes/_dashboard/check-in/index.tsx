import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarCheckIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { ConfigTable } from "#/components/check-in/ConfigTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { useCheckInConfigs } from "#/hooks/use-check-in"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/check-in/")({
  component: CheckInListPage,
})

function CheckInListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: configs, isPending, error, refetch } = useCheckInConfigs(
    scopeToFilter(scope),
  )

  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarCheckIcon className="size-5" />}
        title={t("签到配置", "Check-in")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个配置`, `${total} configs total`)
        }
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <WriteGate>
              <Button asChild size="sm">
                <Link to="/check-in/create">
                  <Plus />
                  {m.checkin_new_config()}
                </Link>
              </Button>
            </WriteGate>
          </>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("签到配置加载失败", "Failed to load check-in configs")}
            description={t(
              "请检查网络或服务端 API,如反复失败联系管理员。",
              "Check network and the API. If this keeps happening, contact an admin.",
            )}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有签到配置", "No check-in configs yet")}
            description={t(
              "创建第一个签到配置,触达每日活跃玩家。",
              "Create your first check-in to engage daily active players.",
            )}
            action={
              <WriteGate>
                <Button asChild size="sm">
                  <Link to="/check-in/create">
                    <Plus />
                    {m.checkin_new_config()}
                  </Link>
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ConfigTable data={configs ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
