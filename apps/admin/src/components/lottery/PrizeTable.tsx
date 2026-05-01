import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import {
  RowMoveActions,
  SortableTableProvider,
  SortableTableRow,
} from "#/components/common/SortableTable"
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
import { useMoveLotteryPrize } from "#/hooks/use-move"
import type { LotteryPrize } from "#/lib/types/lottery"
import type { LotteryTier } from "#/lib/types/lottery"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<LotteryPrize>()

interface PrizeTableProps {
  data: LotteryPrize[]
  tiers?: LotteryTier[]
  onEdit: (prize: LotteryPrize) => void
  onDelete: (prize: LotteryPrize) => void
}

export function PrizeTable({ data, tiers, onEdit, onDelete }: PrizeTableProps) {
  const moveMutation = useMoveLotteryPrize()
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
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
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

  const rows = table.getRowModel().rows

  return (
    <SortableTableProvider
      items={data}
      onMove={(id, body) => moveMutation.mutate({ id, body })}
      disabled={moveMutation.isPending}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              <TableHead className="w-8" />
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
              <TableHead className="w-40 text-right">
                {m.data_table_reorder_actions()}
              </TableHead>
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row, idx) => (
              <SortableTableRow key={row.id} id={row.original.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <RowMoveActions
                      id={row.original.id}
                      prevId={data[idx - 1]?.id}
                      nextId={data[idx + 1]?.id}
                      isFirst={idx === 0}
                      isLast={idx === data.length - 1}
                    />
                  </div>
                </TableCell>
              </SortableTableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                No prizes yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </SortableTableProvider>
  )
}
