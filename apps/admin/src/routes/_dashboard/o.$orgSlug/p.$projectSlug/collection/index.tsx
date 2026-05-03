import { createFileRoute, Link } from "@tanstack/react-router"
import { LayersIcon, Plus } from "lucide-react"

import { AlbumTable } from "#/components/collection/AlbumTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useCollectionAlbums } from "#/hooks/use-collection"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/collection/")({
  component: CollectionListPage,
})

function CollectionListPage() {
  const { data: items, isPending, error, refetch } = useCollectionAlbums()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<LayersIcon className="size-5" />}
        title={t("图鉴", "Collections")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个图鉴册`, `${total} albums total`)
        }
        actions={
          <Button
            render={
              <Link to="/collection/create">
                <Plus />
                {m.collection_new_album()}
              </Link>
            }
            size="sm"
          />
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("图鉴加载失败", "Failed to load collections")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有图鉴册", "No collection albums yet")}
            description={t(
              "创建第一本图鉴册,聚合角色、皮肤、成就等收藏品。",
              "Create your first album to bundle character/skin/achievement collectibles.",
            )}
            action={
              <Button
                render={
                  <Link to="/collection/create">
                    <Plus />
                    {m.collection_new_album()}
                  </Link>
                }
                size="sm"
              />
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <AlbumTable data={items ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
