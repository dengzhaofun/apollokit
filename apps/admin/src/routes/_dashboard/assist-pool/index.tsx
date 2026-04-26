import { createFileRoute, Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { HeartHandshakeIcon, Plus } from "lucide-react"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useAssistPoolConfigs } from "#/hooks/use-assist-pool"
import type {
  AssistContributionPolicy,
  AssistPoolConfig,
} from "#/lib/types/assist-pool"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/assist-pool/")({
  component: AssistPoolListPage,
})

function formatPolicy(p: AssistContributionPolicy): string {
  switch (p.kind) {
    case "fixed":
      return `fixed(${p.amount})`
    case "uniform":
      return `uniform(${p.min}..${p.max})`
    case "decaying":
      return `decaying(base=${p.base}, tail=${(p.tailRatio * 100).toFixed(0)}%→${p.tailFloor})`
  }
}

const columnHelper = createColumnHelper<AssistPoolConfig>()

function useColumns(): ColumnDef<AssistPoolConfig, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.assistpool_col_name(),
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("alias", {
        header: () => m.assistpool_col_alias(),
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>
        ),
      }),
      columnHelper.accessor("mode", { header: () => m.assistpool_col_mode() }),
      columnHelper.accessor("targetAmount", {
        header: () => m.assistpool_col_target(),
      }),
      columnHelper.accessor("contributionPolicy", {
        header: () => m.assistpool_col_policy(),
        cell: (info) => (
          <span className="font-mono text-xs">{formatPolicy(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("expiresInSeconds", { header: () => m.assistpool_col_ttl() }),
      columnHelper.accessor("isActive", {
        header: () => m.assistpool_col_active(),
        cell: (info) => (info.getValue() ? m.assistpool_yes() : m.assistpool_no()),
      }),
    ],
    [],
  ) as ColumnDef<AssistPoolConfig, unknown>[]
}

function AssistPoolListPage() {
  const list = useAssistPoolConfigs()
  const columns = useColumns()

  return (
    <PageShell>
      <PageHeader
        icon={<HeartHandshakeIcon className="size-5" />}
        title={t("助力池", "Assist pools")}
        description={t("分页 / 搜索均走服务端。", "Paginated and searched server-side.")}
        actions={
          <Button asChild size="sm">
            <Link to="/assist-pool/create">
              <Plus />
              {m.assistpool_new_config()}
            </Link>
          </Button>
        }
      />

      <PageBody>
        <DataTable
          columns={columns}
          data={list.items}
          isLoading={list.isLoading}
          getRowId={(row) => row.id}
          pageIndex={list.pageIndex}
          canPrev={list.canPrev}
          canNext={list.canNext}
          onNextPage={list.nextPage}
          onPrevPage={list.prevPage}
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          searchValue={list.searchInput}
          onSearchChange={list.setSearchInput}
        />
      </PageBody>
    </PageShell>
  )
}
