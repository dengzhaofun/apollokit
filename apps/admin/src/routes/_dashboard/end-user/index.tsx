/**
 * End-user list page — admin view of the players in the current org.
 *
 * 数据走 `GET /api/end-user`(`apps/server/src/modules/end-user/routes.ts`)。
 * 同步 + CRUD 在详情页;此页是 read-only。
 *
 * 筛选条件 → 服务端 `ListEndUsersQuery`。`limit` 固定 200(server max),
 * 客户端分页交给 DataTable。租户超 200 时会接服务端分页。
 */
import { createFileRoute } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { useState } from "react"

import { EndUserTable } from "#/components/end-user/EndUserTable"
import {
  EmptyList,
  EmptySearch,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useEndUsers } from "#/hooks/use-end-user"
import type { EndUserOrigin } from "#/lib/types/end-user"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/end-user/")({
  component: EndUsersPage,
})

type OriginFilter = EndUserOrigin | "all"
type StatusFilter = "all" | "enabled" | "disabled"

function EndUsersPage() {
  const [search, setSearch] = useState("")
  const [origin, setOrigin] = useState<OriginFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  const query = useEndUsers({
    search: search.trim() || undefined,
    origin: origin === "all" ? undefined : origin,
    disabled:
      status === "all" ? undefined : status === "disabled" ? true : false,
    limit: 200,
  })

  const isFiltered =
    search.trim() !== "" || origin !== "all" || status !== "all"
  const itemsCount = query.data?.items.length ?? 0
  const totalCount = query.data?.total

  return (
    <PageShell>
      <PageHeader
        icon={<UsersIcon className="size-5" />}
        title={t("玩家", "End users")}
        description={
          query.isPending
            ? t("加载中…", "Loading…")
            : query.error
              ? t("加载失败", "Failed to load")
              : totalCount != null
                ? m.end_user_total_count({ count: totalCount })
                : t(`共 ${itemsCount}`, `${itemsCount} total`)
        }
      />

      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={m.end_user_search_placeholder()}
            />
          </div>
          <Select
            value={origin}
            onValueChange={(v) => setOrigin(v as OriginFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.end_user_filter_all()}</SelectItem>
              <SelectItem value="managed">
                {m.end_user_filter_origin_managed()}
              </SelectItem>
              <SelectItem value="synced">
                {m.end_user_filter_origin_synced()}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.end_user_filter_all()}</SelectItem>
              <SelectItem value="enabled">
                {m.end_user_filter_enabled_only()}
              </SelectItem>
              <SelectItem value="disabled">
                {m.end_user_filter_disabled_only()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {query.error ? (
          <ErrorState
            title={t("玩家加载失败", "Failed to load end users")}
            onRetry={() => query.refetch()}
            retryLabel={t("重试", "Retry")}
            error={query.error instanceof Error ? query.error : null}
          />
        ) : query.data && itemsCount === 0 && !query.isPending ? (
          isFiltered ? (
            <EmptySearch
              query={search.trim() || undefined}
              onClear={() => {
                setSearch("")
                setOrigin("all")
                setStatus("all")
              }}
              clearLabel={t("清除筛选", "Clear filters")}
            />
          ) : (
            <EmptyList
              title={m.end_user_empty_title()}
              description={m.end_user_empty_description()}
            />
          )
        ) : (
          <EndUserTable
            data={query.data?.items ?? []}
            isLoading={query.isPending}
          />
        )}
      </PageBody>
    </PageShell>
  )
}
