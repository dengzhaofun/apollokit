/**
 * Per-user progress for a campaign. Mirrors check-in's UserStatesTable —
 * paginated server-side via useListSearch, displays the columns the
 * admin actually uses for support / fraud triage:
 *   - end-user id (truncated)
 *   - spots completed count
 *   - daily count (only meaningful in 'daily' mode but harmless to show)
 *   - completed_at (when set)
 *   - last activity timestamp
 */

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { Check } from "lucide-react"
import { useMemo } from "react"
import type { AnyRoute } from "@tanstack/react-router"

import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { useOfflineCheckInProgress } from "#/hooks/use-offline-check-in"
import type { OfflineCheckInProgress } from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<OfflineCheckInProgress>()

function useColumns(): ColumnDef<OfflineCheckInProgress, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("endUserId", {
        header: () => "End User",
        cell: (info) => (
          <code className="text-xs">{info.getValue()}</code>
        ),
      }),
      columnHelper.accessor("totalCount", {
        header: () => m.offline_checkin_progress_total(),
      }),
      columnHelper.accessor("dailyCount", {
        header: () => m.offline_checkin_progress_daily(),
      }),
      columnHelper.accessor("completedAt", {
        header: () => m.offline_checkin_progress_completed_at(),
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <Badge variant="default">
              <Check className="size-3" />
              {format(new Date(v), "yyyy-MM-dd HH:mm")}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
      columnHelper.accessor("lastCheckInAt", {
        header: () => m.checkin_last_checkin_at(),
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <span>{format(new Date(v), "yyyy-MM-dd HH:mm")}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
    ],
    [],
  ) as ColumnDef<OfflineCheckInProgress, unknown>[]
}

interface Props {
  campaignKey: string
  route: AnyRoute
}

export function ProgressTable({ campaignKey, route }: Props) {
  const list = useOfflineCheckInProgress(campaignKey, route)
  const columns = useColumns()
  return (
    <DataTable
      columns={columns}
      mobileLayout="cards"
      data={list.items}
      getRowId={(row) => row.endUserId}
      filters={[]}
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
