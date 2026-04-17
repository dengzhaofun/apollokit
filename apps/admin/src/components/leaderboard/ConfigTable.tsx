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
import type { LeaderboardConfig } from "#/lib/types/leaderboard"

const columnHelper = createColumnHelper<LeaderboardConfig>()

const columns = [
  columnHelper.accessor("name", {
    header: () => "名称",
    cell: (info) => (
      <Link
        to="/leaderboard/$alias"
        params={{ alias: info.row.original.alias }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("alias", {
    header: () => "别名",
    cell: (info) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {info.getValue()}
      </code>
    ),
  }),
  columnHelper.accessor("metricKey", {
    header: () => "指标 key",
    cell: (info) => (
      <code className="text-xs text-muted-foreground">{info.getValue()}</code>
    ),
  }),
  columnHelper.accessor("cycle", {
    header: () => "周期",
    cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
  }),
  columnHelper.accessor("scope", {
    header: () => "作用域",
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  columnHelper.accessor("aggregation", {
    header: () => "聚合",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("status", {
    header: () => "状态",
    cell: (info) => {
      const s = info.getValue()
      return (
        <Badge variant={s === "active" ? "default" : "outline"}>{s}</Badge>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    header: () => "创建时间",
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
  }),
]

export function LeaderboardConfigTable({
  data,
}: {
  data: LeaderboardConfig[]
}) {
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
              暂无排行榜配置
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
