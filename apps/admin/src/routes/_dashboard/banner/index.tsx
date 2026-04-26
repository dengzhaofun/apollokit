import { createFileRoute, Link } from "@tanstack/react-router"
import { GalleryHorizontalIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { GroupTable } from "#/components/banner/GroupTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/banner/")({
  component: BannerListPage,
})

function BannerListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const filter = scopeToFilter(scope)

  return (
    <PageShell>
      <PageHeader
        icon={<GalleryHorizontalIcon className="size-5" />}
        title={t("Banner 组", "Banner groups")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <>
            <ActivityScopeFilter value={scope} onChange={setScope} />
            <Button asChild size="sm">
              <Link to="/banner/create">
                <Plus />
                {m.banner_new_group()}
              </Link>
            </Button>
          </>
        }
      />

      <PageBody>
        <GroupTable
          activityId={filter.activityId}
          includeActivity={filter.includeActivity}
        />
      </PageBody>
    </PageShell>
  )
}
