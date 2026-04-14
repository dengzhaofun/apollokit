import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
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
import type { LotteryTier } from "#/lib/types/lottery"

const columnHelper = createColumnHelper<LotteryTier>()

interface TierTableProps {
  data: LotteryTier[]
  onEdit: (tier: LotteryTier) => void
  onDelete: (tier: LotteryTier) => void
}

export function TierTable({ data, onEdit, onDelete }: TierTableProps) {
  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => (
        <span className="font-medium">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("baseWeight", {
      header: "Weight",
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("color", {
      header: "Color",
      cell: (info) => {
        const color = info.getValue()
        return color ? (
          <div className="flex items-center gap-2">
            <div
              className="size-4 rounded-full border"
              style={{ backgroundColor: color }}
            />
            <code className="text-xs">{color}</code>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    }),
    columnHelper.accessor("sortOrder", {
      header: "Order",
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
      cell: (info) => {
        const tier = info.row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(tier)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(tier)}>
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }),
  ]

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
            <TableCell colSpan={6} className="h-24 text-center">
              No tiers yet. Add tiers for gacha-style two-level selection.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
