import { useMemo } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { format } from "date-fns"
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
import type { LedgerEntry } from "#/lib/types/currency"

const columnHelper = createColumnHelper<LedgerEntry>()

function useColumns(resolveCurrencyName: (id: string) => string) {
  return useMemo(
    () => [
      columnHelper.accessor("createdAt", {
        header: m.common_created(),
        cell: (info) =>
          format(new Date(info.getValue()), "yyyy-MM-dd HH:mm:ss"),
      }),
      columnHelper.accessor("endUserId", {
        header: m.currency_end_user_id(),
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {info.getValue()}
          </code>
        ),
      }),
      columnHelper.accessor("currencyId", {
        header: m.currency_currency(),
        cell: (info) => resolveCurrencyName(info.getValue()),
      }),
      columnHelper.accessor("delta", {
        header: m.currency_delta(),
        cell: (info) => {
          const v = info.getValue()
          return (
            <Badge variant={v >= 0 ? "default" : "destructive"}>
              {v >= 0 ? "+" : ""}
              {v}
            </Badge>
          )
        },
      }),
      columnHelper.accessor("balanceAfter", {
        header: m.currency_balance_after(),
        cell: (info) => {
          const v = info.getValue()
          return v ?? <span className="text-muted-foreground">—</span>
        },
      }),
      columnHelper.accessor("source", {
        header: m.currency_source(),
        cell: (info) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {info.getValue()}
          </code>
        ),
      }),
      columnHelper.accessor("sourceId", {
        header: m.currency_source_id(),
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {v.slice(0, 12)}
              {v.length > 12 ? "…" : ""}
            </code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      }),
    ],
    [resolveCurrencyName],
  )
}

interface LedgerTableProps {
  data: LedgerEntry[]
  resolveCurrencyName: (id: string) => string
}

export function LedgerTable({ data, resolveCurrencyName }: LedgerTableProps) {
  const columns = useColumns(resolveCurrencyName)
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
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
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
              {m.currency_ledger_empty()}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
