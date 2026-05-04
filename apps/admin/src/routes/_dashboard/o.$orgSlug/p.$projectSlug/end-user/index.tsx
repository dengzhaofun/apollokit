/**
 * End-user list page — admin view of the players in the current org.
 *
 * Server-side cursor pagination + faceted filters + advanced query
 * builder all driven from URL search params (so refresh / share /
 * back-button all "just work"). The page itself is intentionally
 * tiny — `<EndUserTable />` reads the route handle and the rest is
 * driven by `useListSearch` inside `useEndUsers`.
 */
import { createFileRoute } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { z } from "zod"

import { EndUserTable } from "#/components/end-user/EndUserTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { listSearchSchema } from "#/lib/list-search"
import { modalSearchSchema } from "#/lib/modal-search"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

/**
 * Per-module filter schema — keys MUST match the server's
 * `endUserFilters` declaration. Layered onto the standard
 * `modalSearchSchema` + `listSearchSchema` so URL-encoded filters are
 * validated end-to-end (no silent passthrough for typos).
 */
const endUserFilterSchema = z
  .object({
    origin: z.enum(["managed", "synced"]).optional(),
    disabled: z.coerce.boolean().optional(),
    emailVerified: z.coerce.boolean().optional(),
    externalId: z.string().optional(),
    createdAtGte: z.string().optional(),
    createdAtLte: z.string().optional(),
  })
  .passthrough()

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/end-user/")({
  validateSearch: modalSearchSchema
    .merge(listSearchSchema)
    .merge(endUserFilterSchema)
    .passthrough(),
  component: EndUsersPage,
})

function EndUsersPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<UsersIcon className="size-5" />}
        title={t("用户", "Users")}
        description={t(
          "搜索 / 筛选 / 翻页均走服务端，全部状态写入 URL。",
          "Search, filter, and pagination are server-driven; all state lives in the URL.",
        )}
      />

      <PageBody>
        <EndUserTable route={Route} />
      </PageBody>
    </PageShell>
  )
}
