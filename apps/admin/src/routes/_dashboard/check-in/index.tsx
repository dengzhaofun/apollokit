import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarCheckIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { ConfigTable } from "#/components/check-in/ConfigTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/check-in/")({
  component: CheckInListPage,
})

function CheckInListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  // Map scope kind → server filter. The scope filter doesn't carry an
  // activityId for "standalone" — useCheckInConfigs's default filters
  // out activity-bound configs.
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<CalendarCheckIcon className="size-5" />}
        title={t("签到配置", "Check-in")}
        description={t(
          "签到配置分页 / 搜索均走服务端。",
          "Check-in configs are paginated server-side.",
        )}
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
        <ConfigTable
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>
    </PageShell>
  )
}
