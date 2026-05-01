import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useMemo } from "react"

import { DataTable } from "#/components/data-table/DataTable"
import {
  CHECK_IN_USER_STATE_FILTER_DEFS,
  useCheckInUserStates,
} from "#/hooks/use-check-in"
import type { CheckInUserState } from "#/lib/types/check-in"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<CheckInUserState>()

function useColumns(): ColumnDef<CheckInUserState, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("endUserId", {
        header: () => m.checkin_user_id(),
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {info.getValue()}
          </code>
        ),
      }),
      columnHelper.accessor("totalDays", { header: () => m.checkin_total_days() }),
      columnHelper.accessor("currentStreak", { header: () => m.checkin_current_streak() }),
      columnHelper.accessor("longestStreak", { header: () => m.checkin_longest_streak() }),
      columnHelper.accessor("currentCycleDays", { header: () => m.checkin_cycle_days() }),
      columnHelper.accessor("currentCycleKey", {
        header: () => m.checkin_cycle_key(),
        cell: (info) => {
          const key = info.getValue()
          return key ?? <span className="text-muted-foreground">—</span>
        },
      }),
      columnHelper.accessor("lastCheckInDate", {
        header: () => m.checkin_last_checkin_date(),
        cell: (info) => {
          const date = info.getValue()
          return date ?? <span className="text-muted-foreground">—</span>
        },
      }),
      columnHelper.accessor("firstCheckInAt", {
        header: () => m.checkin_first_checkin_at(),
        cell: (info) => {
          const val = info.getValue()
          return val ? (
            format(new Date(val), "yyyy-MM-dd HH:mm")
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
    ],
    [],
  ) as ColumnDef<CheckInUserState, unknown>[]
}

interface Props {
  configKey: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function UserStatesTable({ configKey, route }: Props) {
  const list = useCheckInUserStates(configKey, route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.endUserId}
      filters={CHECK_IN_USER_STATE_FILTER_DEFS}
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
