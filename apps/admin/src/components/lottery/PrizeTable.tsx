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
import type { LotteryPrize } from "#/lib/types/lottery"
import type { LotteryTier } from "#/lib/types/lottery"

const columnHelper = createColumnHelper<LotteryPrize>()

interface PrizeTableProps {
  data: LotteryPrize[]
  tiers?: LotteryTier[]
  onEdit: (prize: LotteryPrize) => void
  onDelete: (prize: LotteryPrize) => void
}

export function PrizeTable({ data, tiers, onEdit, onDelete }: PrizeTableProps) {
  const tierMap = new Map(tiers?.map((t) => [t.id, t.name]) ?? [])

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => (
        <span className="font-medium">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("tierId", {
      header: "Tier",
      cell: (info) => {
        const tierId = info.getValue()
        return tierId ? (
          <Badge variant="secondary">{tierMap.get(tierId) ?? tierId}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    }),
    columnHelper.accessor("weight", {
      header: "Weight",
    }),
    columnHelper.accessor("isRateUp", {
      header: "Rate Up",
      cell: (info) => {
        const prize = info.row.original
        return info.getValue() ? (
          <Badge variant="default">UP +{prize.rateUpWeight}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    }),
    columnHelper.accessor("globalStockLimit", {
      header: "Stock",
      cell: (info) => {
        const prize = info.row.original
        return info.getValue()
          ? `${prize.globalStockUsed} / ${info.getValue()}`
          : "Unlimited"
      },
    }),
    columnHelper.accessor("rewardItems", {
      header: "Rewards",
      cell: (info) => {
        const items = info.getValue()
        return items.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="text-xs">{items.length} item(s)</span>
        )
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
      cell: (info) => {
        const prize = info.row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(prize)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(prize)}>
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
            <TableCell colSpan={8} className="h-24 text-center">
              No prizes yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
