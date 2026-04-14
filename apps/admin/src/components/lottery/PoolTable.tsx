import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
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
import type { LotteryPool } from "#/lib/types/lottery"

const columnHelper = createColumnHelper<LotteryPool>()

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => (
      <Link
        to="/lottery/$poolId"
        params={{ poolId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("alias", {
    header: "Alias",
    cell: (info) => {
      const alias = info.getValue()
      return alias ? (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  }),
  columnHelper.accessor("costPerPull", {
    header: "Cost/Pull",
    cell: (info) => {
      const cost = info.getValue()
      return cost.length === 0 ? (
        <span className="text-muted-foreground">Free</span>
      ) : (
        <span className="text-xs">{cost.length} item(s)</span>
      )
    },
  }),
  columnHelper.accessor("globalPullCount", {
    header: "Pulls",
    cell: (info) => {
      const pool = info.row.original
      return pool.globalPullLimit
        ? `${info.getValue()} / ${pool.globalPullLimit}`
        : info.getValue()
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
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => <ActionsCell pool={info.row.original} />,
  }),
]

function ActionsCell({ pool }: { pool: LotteryPool }) {
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
          <Link to="/lottery/$poolId" params={{ poolId: pool.id }}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/lottery/$poolId"
            params={{ poolId: pool.id }}
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

interface PoolTableProps {
  data: LotteryPool[]
}

export function LotteryPoolTable({ data }: PoolTableProps) {
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
              No lottery pools yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
