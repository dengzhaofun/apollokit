import { createFileRoute, Link } from "@tanstack/react-router"
import { GalleryHorizontalIcon, Plus } from "lucide-react"
import { useState } from "react"

import {
  ActivityScopeFilter,
  scopeToFilter,
  type ActivityScope,
} from "#/components/activity/ActivityScopeFilter"
import { GroupTable } from "#/components/banner/GroupTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useBannerGroups } from "#/hooks/use-banner"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/banner/")({
  component: BannerListPage,
})

function BannerListPage() {
  const [scope, setScope] = useState<ActivityScope>({ kind: "standalone" })
  const { data: items, isPending, error, refetch } = useBannerGroups(
    scopeToFilter(scope),
  )

  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<GalleryHorizontalIcon className="size-5" />}
        title={t("Banner 组", "Banner groups")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个 banner 组`, `${total} groups total`)
        }
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
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("Banner 组加载失败", "Failed to load banner groups")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有 Banner 组", "No banner groups yet")}
            description={t(
              "创建第一个 banner 组,集中管理首页轮播图、活动 hero。",
              "Create your first group to manage carousels and hero banners.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/banner/create">
                  <Plus />
                  {m.banner_new_group()}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <GroupTable data={items ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
