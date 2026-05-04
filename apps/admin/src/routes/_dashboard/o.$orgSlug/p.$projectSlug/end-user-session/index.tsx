import { createFileRoute } from "@tanstack/react-router"
import { MonitorSmartphone } from "lucide-react"

import { EndUserSessionTable } from "#/components/end-user/EndUserSessionTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { listSearchSchema } from "#/lib/list-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/end-user-session/",
)({
  validateSearch: listSearchSchema.passthrough(),
  component: EndUserSessionPage,
})

function EndUserSessionPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<MonitorSmartphone className="size-5" />}
        title={t("会话管理", "Sessions")}
        description={t(
          "查看当前项目所有玩家的活跃会话，支持翻页。",
          "View all active sessions for players in this project.",
        )}
      />
      <PageBody>
        <EndUserSessionTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
