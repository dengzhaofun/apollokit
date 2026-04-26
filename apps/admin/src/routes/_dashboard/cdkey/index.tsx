import { createFileRoute, Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { useMemo } from "react"

import * as m from "#/paraglide/messages.js"
import { DataTable } from "#/components/data-table/DataTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { useCdkeyBatches } from "#/hooks/use-cdkey"
import type { CdkeyBatch } from "#/lib/types/cdkey"

export const Route = createFileRoute("/_dashboard/cdkey/")({
  component: CdkeyListPage,
})

const columnHelper = createColumnHelper<CdkeyBatch>()

function useColumns(): ColumnDef<CdkeyBatch, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/cdkey/$batchId"
            params={{ batchId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("codeType", {
        header: () => m.cdkey_code_type(),
        cell: (info) => (
          <Badge variant="outline">
            {info.getValue() === "universal"
              ? m.cdkey_code_type_universal()
              : m.cdkey_code_type_unique()}
          </Badge>
        ),
      }),
      columnHelper.accessor("totalRedeemed", {
        header: () => m.cdkey_redeemed(),
        cell: (info) => {
          const b = info.row.original
          return (
            <>
              {info.getValue()}
              {b.totalLimit != null ? ` / ${b.totalLimit}` : ""}
            </>
          )
        },
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
      }),
    ],
    [],
  ) as ColumnDef<CdkeyBatch, unknown>[]
}

function CdkeyListPage() {
  const list = useCdkeyBatches()
  const columns = useColumns()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/cdkey/create">
                <Plus className="size-4" />
                {m.cdkey_new_batch()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
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
      </main>
    </>
  )
}
