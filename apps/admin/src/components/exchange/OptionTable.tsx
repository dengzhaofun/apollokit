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
import type { ExchangeOption } from "#/lib/types/exchange"

const columnHelper = createColumnHelper<ExchangeOption>()

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
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
    header: "Costs",
    cell: (info) => (
      <span className="text-xs">{info.getValue().length} item(s)</span>
    ),
  }),
  columnHelper.accessor("rewardItems", {
    header: "Rewards",
    cell: (info) => (
      <span className="text-xs">{info.getValue().length} item(s)</span>
    ),
  }),
  columnHelper.accessor("globalCount", {
    header: "Usage",
    cell: (info) => {
      const option = info.row.original
      if (option.globalLimit != null) {
        return `${info.getValue()} / ${option.globalLimit}`
      }
      return info.getValue()
    },
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <Badge variant={info.getValue() ? "default" : "outline"}>
        {info.getValue() ? "Active" : "Inactive"}
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
          <span className="sr-only">Actions</span>
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
            Edit
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
            Delete
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
              No exchange options yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
