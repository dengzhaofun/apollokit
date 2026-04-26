import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { useDialogueScripts } from "#/hooks/use-dialogue"
import type { DialogueScript } from "#/lib/types/dialogue"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<DialogueScript>()

function useColumns(): ColumnDef<DialogueScript, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.dialogue_col_name(),
        cell: (info) => (
          <Link
            to="/dialogue/$scriptId"
            params={{ scriptId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.dialogue_col_alias(),
        cell: (info) => {
          const alias = info.getValue()
          return alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
          ) : (
            <Badge variant="outline">{m.dialogue_draft_badge()}</Badge>
          )
        },
      }),
      columnHelper.accessor("nodes", {
        header: () => m.dialogue_col_nodes(),
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue().length}</span>
        ),
      }),
      columnHelper.accessor("repeatable", {
        header: () => m.dialogue_col_repeatable(),
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="secondary">✓</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("isActive", {
        header: () => m.dialogue_col_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "outline"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: () => m.common_updated(),
        cell: (info) => (
          <span className="text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
    ],
    [],
  ) as ColumnDef<DialogueScript, unknown>[]
}

export function ScriptTable() {
  const list = useDialogueScripts()
  const columns = useColumns()
  return (
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
  )
}
