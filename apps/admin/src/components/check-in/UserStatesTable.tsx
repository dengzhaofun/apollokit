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
import type { CheckInUserState } from "#/lib/types/check-in"

const columnHelper = createColumnHelper<CheckInUserState>()

const columns = [
  columnHelper.accessor("endUserId", {
    header: "User ID",
    cell: (info) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {info.getValue()}
      </code>
    ),
  }),
  columnHelper.accessor("totalDays", {
    header: "Total Days",
  }),
  columnHelper.accessor("currentStreak", {
    header: "Streak",
  }),
  columnHelper.accessor("longestStreak", {
    header: "Best Streak",
  }),
  columnHelper.accessor("currentCycleDays", {
    header: "Cycle Days",
  }),
  columnHelper.accessor("currentCycleKey", {
    header: "Cycle",
    cell: (info) => {
      const key = info.getValue()
      return key ?? <span className="text-muted-foreground">—</span>
    },
  }),
  columnHelper.accessor("lastCheckInDate", {
    header: "Last Check-in",
    cell: (info) => {
      const date = info.getValue()
      return date ?? <span className="text-muted-foreground">—</span>
    },
  }),
  columnHelper.accessor("firstCheckInAt", {
    header: "First Check-in",
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
