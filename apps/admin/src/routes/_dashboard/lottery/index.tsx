import { createFileRoute, Link } from "@tanstack/react-router"
import { DicesIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { LotteryPoolTable } from "#/components/lottery/PoolTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/lottery/")({
  component: LotteryListPage,
})

function LotteryListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<DicesIcon className="size-5" />}
        title={t("抽奖池", "Lottery pools")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
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
        <LotteryPoolTable
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>
    </PageShell>
  )
}
