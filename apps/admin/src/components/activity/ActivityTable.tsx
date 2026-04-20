import { Link } from "@tanstack/react-router"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { format } from "date-fns"

import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
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

const columns = [
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
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {info.getValue()}
      </code>
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
]

export function ActivityTable({ data }: { data: Activity[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>
                {h.isPlaceholder
                  ? null
                  : flexRender(h.column.columnDef.header, h.getContext())}
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
              {m.activity_table_empty()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export { STATE_LABELS, STATE_VARIANT }
