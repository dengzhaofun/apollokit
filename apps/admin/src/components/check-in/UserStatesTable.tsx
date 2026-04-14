import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { format } from "date-fns"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import * as m from "#/paraglide/messages.js"
import type { CheckInUserState } from "#/lib/types/check-in"

const columnHelper = createColumnHelper<CheckInUserState>()

const columns = [
  columnHelper.accessor("endUserId", {
    header: () => m.checkin_user_id(),
    cell: (info) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {info.getValue()}
      </code>
    ),
  }),
  columnHelper.accessor("totalDays", {
    header: () => m.checkin_total_days(),
  }),
  columnHelper.accessor("currentStreak", {
    header: () => m.checkin_current_streak(),
  }),
  columnHelper.accessor("longestStreak", {
    header: () => m.checkin_longest_streak(),
  }),
  columnHelper.accessor("currentCycleDays", {
    header: () => m.checkin_cycle_days(),
  }),
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
]

interface UserStatesTableProps {
  data: CheckInUserState[]
}

export function UserStatesTable({ data }: UserStatesTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              No users have checked in yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
