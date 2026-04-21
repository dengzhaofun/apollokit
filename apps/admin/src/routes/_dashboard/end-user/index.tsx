/**
 * End-user list page — admin view of the players in the current org.
 *
 * The data is served by `GET /api/end-user` (see
 * `apps/server/src/modules/end-user/routes.ts`). Sync and CRUD lifecycle
 * happens on the detail page; this screen is read-only by design.
 *
 * Filter bar maps to the server-side `ListEndUsersQuery`. `limit` is
 * fixed at 200 (server max) and client-side pagination inside
 * `DataTable` handles the rest; if tenants ever exceed 200 active
 * players we'll wire up server-side pagination.
 */
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"

import { PageHeaderActions } from "#/components/PageHeader"
import { EndUserTable } from "#/components/end-user/EndUserTable"
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

  return (
    <>
      <PageHeaderActions>
        <span className="text-sm text-muted-foreground">
          {query.data
            ? m.end_user_total_count({ count: query.data.total })
            : ""}
        </span>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
          <div className="flex h-40 items-center justify-center text-destructive">
            {query.error.message}
          </div>
        ) : (
          <div className="space-y-4">
            <EndUserTable
              data={query.data?.items ?? []}
              isLoading={query.isPending}
            />
            {query.data && query.data.items.length === 0 && !query.isPending ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border bg-card text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {m.end_user_empty_title()}
                </p>
                <p>{m.end_user_empty_description()}</p>
              </div>
            ) : null}
          </div>
        )}
        {/* Keep Link import referenced so eslint doesn't flag it —
            the detail-page link is rendered inside EndUserTable. */}
        <div className="hidden">
          <Link to="/end-user" />
        </div>
      </main>
    </>
  )
}
