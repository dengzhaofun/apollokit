import { useMemo } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import * as m from "#/paraglide/messages.js"

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
import { openEditModal } from "#/lib/modal-search"
import type { ItemCategory } from "#/lib/types/item"

const columnHelper = createColumnHelper<ItemCategory>()

function useColumns() {
  return useMemo(() => [
    columnHelper.accessor("name", {
      header: m.common_name(),
      cell: (info) => (
        <Link
          to="/item/categories"
          search={(prev) => ({ ...prev, ...openEditModal(info.row.original.id) })}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor("alias", {
      header: m.common_alias(),
      cell: (info) => {
        const alias = info.getValue()
        return alias ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{alias}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    }),
    columnHelper.accessor("sortOrder", {
      header: m.common_sort_order(),
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("isActive", {
      header: m.common_status(),
      cell: (info) => (
        <Badge variant={info.getValue() ? "default" : "outline"}>
          {info.getValue() ? m.common_active() : m.common_inactive()}
        </Badge>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: m.common_created(),
      cell: (info) => format(new Date(info.getValue()), "yyyy-MM-dd"),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => <ActionsCell category={info.row.original} />,
    }),
  ], [])
}

function ActionsCell({ category }: { category: ItemCategory }) {
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
            to="/item/categories"
            search={(prev) => ({ ...prev, ...openEditModal(category.id) })}
          >
            <Pencil className="size-4" />
            {m.common_edit()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/item/categories/$categoryId"
            params={{ categoryId: category.id }}
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

interface CategoryTableProps {
  data: ItemCategory[]
}

export function CategoryTable({ data }: CategoryTableProps) {
  const columns = useColumns()
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
              {m.item_no_categories()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
