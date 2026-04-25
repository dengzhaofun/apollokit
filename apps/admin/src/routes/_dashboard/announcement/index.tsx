import { createFileRoute, Link } from "@tanstack/react-router"
import { MegaphoneIcon, Plus } from "lucide-react"

import { AnnouncementTable } from "#/components/announcement/AnnouncementTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { useAnnouncements } from "#/hooks/use-announcement"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/announcement/")({
  component: AnnouncementListPage,
})

function AnnouncementListPage() {
  const { data: items, isPending, error, refetch } = useAnnouncements()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<MegaphoneIcon className="size-5" />}
        title={t("公告", "Announcements")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 条公告`, `${total} announcements total`)
        }
        actions={
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/announcement/create">
                <Plus />
                {m.announcement_new()}
              </Link>
            </Button>
          </WriteGate>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.announcement_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("公告加载失败", "Failed to load announcements")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有公告", "No announcements yet")}
            description={t(
              "发布第一条公告,触达全体玩家。",
              "Publish your first announcement to reach all players.",
            )}
            action={
              <WriteGate>
                <Button asChild size="sm">
                  <Link to="/announcement/create">
                    <Plus />
                    {m.announcement_new()}
                  </Link>
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <AnnouncementTable data={items ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
