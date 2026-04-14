import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

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
import type { ExchangeOption } from "#/lib/types/exchange"

const columnHelper = createColumnHelper<ExchangeOption>()

const columns = [
  columnHelper.accessor("name", {
    header: () => m.common_name(),
    cell: (info) => (
      <Link
        to="/exchange/$configId/options/$optionId"
        params={{
          configId: info.row.original.configId,
          optionId: info.row.original.id,
        }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("costItems", {
    header: () => m.exchange_costs(),
    cell: (info) => (
      <span className="text-xs">{info.getValue().length} {m.exchange_items_suffix()}</span>
    ),
  }),
  columnHelper.accessor("rewardItems", {
    header: () => m.exchange_rewards(),
    cell: (info) => (
      <span className="text-xs">{info.getValue().length} {m.exchange_items_suffix()}</span>
    ),
  }),
  columnHelper.accessor("globalCount", {
    header: () => m.exchange_usage(),
    cell: (info) => {
      const option = info.row.original
      if (option.globalLimit != null) {
        return `${info.getValue()} / ${option.globalLimit}`
      }
      return info.getValue()
    },
  }),
  columnHelper.accessor("isActive", {
    header: () => m.common_status(),
    cell: (info) => (
      <Badge variant={info.getValue() ? "default" : "outline"}>
        {info.getValue() ? m.common_active() : m.common_inactive()}
      </Badge>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => <ActionsCell option={info.row.original} />,
  }),
]

function ActionsCell({ option }: { option: ExchangeOption }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">{m.common_actions()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            to="/exchange/$configId/options/$optionId"
            params={{
              configId: option.configId,
              optionId: option.id,
            }}
          >
            <Pencil className="size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/exchange/$configId/options/$optionId"
            params={{
              configId: option.configId,
              optionId: option.id,
            }}
            search={{ delete: true }}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface OptionTableProps {
  data: ExchangeOption[]
}

export function OptionTable({ data }: OptionTableProps) {
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
              {m.exchange_no_options()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
