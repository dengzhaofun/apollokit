import { Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { ACTIVITY_FILTER_DEFS, useActivities } from "#/hooks/use-activity"
import type { Activity, ActivityState } from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

const STATE_VARIANT: Record<ActivityState, "default" | "outline" | "secondary"> = {
  draft: "outline",
  scheduled: "outline",
  teasing: "secondary",
  active: "default",
  settling: "secondary",
  ended: "outline",
  archived: "outline",
}

const STATE_LABELS: Record<ActivityState, () => string> = {
  draft: m.activity_state_draft,
  scheduled: m.activity_state_scheduled,
  teasing: m.activity_state_teasing,
  active: m.activity_state_active,
  settling: m.activity_state_settling,
  ended: m.activity_state_ended,
  archived: m.activity_state_archived,
}

const columnHelper = createColumnHelper<Activity>()

function useColumns(): ColumnDef<Activity, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        cell: (info) => (
          <Link
            to="/activity/$alias"
            params={{ alias: info.row.original.alias }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{info.getValue()}</code>
        ),
      }),
      columnHelper.accessor("kind", {
        header: () => m.common_type(),
        cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
      }),
      columnHelper.accessor("status", {
        header: () => m.common_status(),
        cell: (info) => {
          const s = info.getValue()
          return (
            <Badge variant={STATE_VARIANT[s]}>
              {STATE_LABELS[s] ? STATE_LABELS[s]() : s}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("visibleAt", {
        header: () => m.activity_col_visible_at(),
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
      columnHelper.accessor("startAt", {
        header: () => m.activity_col_start_at(),
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
      columnHelper.accessor("endAt", {
        header: () => m.activity_col_end_at(),
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {format(new Date(info.getValue()), "yyyy-MM-dd HH:mm")}
          </span>
        ),
      }),
    ],
    [],
  ) as ColumnDef<Activity, unknown>[]
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function ActivityTable({ route }: Props) {
  const list = useActivities(route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      data={list.items}
      getRowId={(row) => row.id}
      filters={ACTIVITY_FILTER_DEFS}
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

export { STATE_LABELS, STATE_VARIANT }
