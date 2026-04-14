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
import type { LotteryPityRule, LotteryTier } from "#/lib/types/lottery"

const columnHelper = createColumnHelper<LotteryPityRule>()

interface PityRuleTableProps {
  data: LotteryPityRule[]
  tiers: LotteryTier[]
  onEdit: (rule: LotteryPityRule) => void
  onDelete: (rule: LotteryPityRule) => void
}

export function PityRuleTable({
  data,
  tiers,
  onEdit,
  onDelete,
}: PityRuleTableProps) {
  const tierMap = new Map(tiers.map((t) => [t.id, t.name]))

  const columns = [
    columnHelper.accessor("guaranteeTierId", {
      header: "Guarantee Tier",
      cell: (info) => (
        <Badge variant="secondary">
          {tierMap.get(info.getValue()) ?? info.getValue()}
        </Badge>
      ),
    }),
    columnHelper.accessor("hardPityThreshold", {
      header: "Hard Pity",
      cell: (info) => `${info.getValue()} pulls`,
    }),
    columnHelper.accessor("softPityStartAt", {
      header: "Soft Pity Start",
      cell: (info) => {
        const val = info.getValue()
        return val ? `${val} pulls` : "—"
      },
    }),
    columnHelper.accessor("softPityWeightIncrement", {
      header: "Weight Increment",
      cell: (info) => {
        const val = info.getValue()
        return val ? `+${val}/pull` : "—"
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
        const rule = info.row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(rule)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(rule)}>
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
              No pity rules. Add tiers first, then configure pity guarantees.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
