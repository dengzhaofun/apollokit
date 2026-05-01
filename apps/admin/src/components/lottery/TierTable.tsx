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
import { useMoveLotteryTier } from "#/hooks/use-move"
import type { LotteryTier } from "#/lib/types/lottery"
import * as m from "#/paraglide/messages.js"

const columnHelper = createColumnHelper<LotteryTier>()

interface TierTableProps {
  data: LotteryTier[]
  onEdit: (tier: LotteryTier) => void
  onDelete: (tier: LotteryTier) => void
}

export function TierTable({ data, onEdit, onDelete }: TierTableProps) {
  const moveMutation = useMoveLotteryTier()
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
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
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
              <TableCell colSpan={7} className="h-24 text-center">
                No tiers yet. Add tiers for gacha-style two-level selection.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </SortableTableProvider>
  )
}
