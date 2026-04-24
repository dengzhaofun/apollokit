import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { MoreHorizontal, Pencil } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import * as m from "#/paraglide/messages.js"
import type { TaskDefinition } from "#/lib/types/task"

const columnHelper = createColumnHelper<TaskDefinition>()

const columns = [
  columnHelper.accessor("name", {
    header: () => m.common_name(),
    cell: (info) => (
      <Link
        to="/task/$taskId"
        params={{ taskId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("alias", {
    header: () => m.common_alias(),
    cell: (info) => {
      const alias = info.getValue()
      return alias ? (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  }),
  columnHelper.accessor("period", {
    header: () => "Period",
    cell: (info) => (
      <Badge variant="outline">{info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor("countingMethod", {
    header: () => "Method",
    cell: (info) => {
      const v = info.getValue()
      return v === "event_count"
        ? "Count"
        : v === "event_value"
          ? "Value"
          : "Children"
    },
  }),
  columnHelper.accessor("targetValue", {
    header: () => "Target",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("isActive", {
    header: () => m.common_status(),
    cell: (info) => (
      <Badge variant={info.getValue() ? "default" : "outline"}>
        {info.getValue() ? m.common_active() : m.common_inactive()}
      </Badge>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: () => m.common_created(),
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => <ActionsCell def={info.row.original} />,
  }),
]

function ActionsCell({ def }: { def: TaskDefinition }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/task/$taskId" params={{ taskId: def.id }}>
            <Pencil className="mr-2 size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DefinitionTable({ data }: { data: TaskDefinition[] }) {
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
            {hg.headers.map((header) => (
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
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              No task definitions yet.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
