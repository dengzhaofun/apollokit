/**
 * End-user list page — admin view of the players in the current org.
 *
 * Server-side cursor pagination + search live inside <EndUserTable />.
 * This page only owns the origin / status filter dropdowns and forwards
 * them into the table.
 */
import { createFileRoute } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { useState } from "react"

import { EndUserTable } from "#/components/end-user/EndUserTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
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
  const [origin, setOrigin] = useState<OriginFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  return (
    <PageShell>
      <PageHeader
        icon={<UsersIcon className="size-5" />}
        title={t("玩家", "End users")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
      />

      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
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

        <EndUserTable
          origin={origin === "all" ? undefined : origin}
          disabled={status === "all" ? undefined : status === "disabled"}
        />
      </PageBody>
    </PageShell>
  )
}
