import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarRangeIcon, FileStack, Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { ActivityTable } from "#/components/activity/ActivityTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import {
  useActivities,
  useActivityTickRun,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/activity/")({
  component: ActivityListPage,
})

function ActivityListPage() {
  const { data: activities, isPending, error, refetch } = useActivities()
  const tickMutation = useActivityTickRun()

  const total = activities?.length ?? 0
  const description = isPending
    ? t("加载中…", "Loading…")
    : error
      ? t("加载失败", "Failed to load")
      : t(`共 ${total} 个活动`, `${total} activities total`)

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarRangeIcon className="size-5" />}
        title={m.activity_page_title()}
        description={description}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/activity/templates">
                <FileStack />
                {m.activity_action_templates()}
              </Link>
            </Button>
            <WriteGate>
              <Button
                variant="outline"
                size="sm"
                disabled={tickMutation.isPending}
                onClick={async () => {
                  try {
                    const r = await tickMutation.mutateAsync()
                    toast.success(
                      m.activity_tick_success({
                        advanced: r.advanced,
                        scheduleFired: r.scheduleFired,
                        errors: r.errors,
                      }),
                    )
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error(m.activity_tick_failed())
                  }
                }}
              >
                <RotateCw />
                {m.activity_action_tick()}
              </Button>
            </WriteGate>
            <WriteGate>
              <Button asChild size="sm">
                <Link to="/activity/create">
                  <Plus />
                  {m.activity_action_create()}
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
            title={t("活动列表加载失败", "Failed to load activities")}
            description={t(
              "请检查网络或服务端 API。如果一直失败,请联系管理员。",
              "Check network and the API server. If this keeps happening, contact an admin.",
            )}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有活动", "No activities yet")}
            description={t(
              "创建第一个活动,触达你的玩家。",
              "Create your first activity to reach your players.",
            )}
            action={
              <WriteGate>
                <Button asChild size="sm">
                  <Link to="/activity/create">
                    <Plus />
                    {m.activity_action_create()}
                  </Link>
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ActivityTable data={activities ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
