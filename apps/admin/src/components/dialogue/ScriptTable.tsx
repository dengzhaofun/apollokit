import { Link } from "#/components/router-helpers"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import {
  DIALOGUE_SCRIPT_FILTER_DEFS,
  useDialogueScripts,
} from "#/hooks/use-dialogue"
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

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function ScriptTable({ route }: Props) {
  const list = useDialogueScripts(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.id}
      filters={DIALOGUE_SCRIPT_FILTER_DEFS}
      filterValues={list.filters}
      onFilterChange={list.setFilter}
      onResetFilters={list.resetFilters}
      hasActiveFilters={list.hasActiveFilters}
      activeFilterCount={list.activeFilterCount}
      mode={list.mode}
      onModeChange={list.setMode}
      advancedQuery={
        list.advanced as
          | import("#/components/ui/query-builder").RuleGroupType
          | undefined
      }
      onAdvancedQueryChange={list.setAdvanced}
      {...list.tableProps}
    />
  )
}
