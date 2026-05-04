import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { RotateCcw } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { DataTable } from "#/components/data-table/DataTable"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { Button } from "#/components/ui/button"
import {
  CHECK_IN_USER_STATE_FILTER_DEFS,
  useCheckInUserStates,
  useResetCheckInUserState,
} from "#/hooks/use-check-in"
import type { CheckInUserState } from "#/lib/types/check-in"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<CheckInUserState>()

function ResetCell({ configKey, endUserId }: { configKey: string; endUserId: string }) {
  const reset = useResetCheckInUserState(configKey)
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive">
            <RotateCcw className="size-3.5" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.checkin_reset_progress_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{endUserId}</code>
            <br />
            <br />
            {m.checkin_reset_progress_confirm_desc()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction
            disabled={reset.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              reset.mutate(endUserId, {
                onSuccess: () => toast.success(m.checkin_reset_progress_success()),
                onError: () => toast.error(m.checkin_reset_progress_failed()),
              })
            }}
          >
            {reset.isPending ? m.checkin_resetting() : m.checkin_reset_progress()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function useColumns(configKey: string): ColumnDef<CheckInUserState, unknown>[] {
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
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <ResetCell configKey={configKey} endUserId={info.row.original.endUserId} />
        ),
      }),
    ],
    [configKey],
  ) as ColumnDef<CheckInUserState, unknown>[]
}

interface Props {
  configKey: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any
}

export function UserStatesTable({ configKey, route }: Props) {
  const list = useCheckInUserStates(configKey, route)
  const columns = useColumns(configKey)
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
