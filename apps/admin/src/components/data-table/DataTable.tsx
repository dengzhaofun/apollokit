import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react"
import { type ReactNode, useState } from "react"

import { Button } from "#/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import * as m from "#/paraglide/messages.js"

interface Props<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  data: T[]
  isLoading?: boolean
  empty?: ReactNode
  /** Optional left-side content next to the search box (e.g. filters). */
  toolbar?: ReactNode
  /** Hide the built-in search box if the caller wants their own. */
  showSearch?: boolean
  /** Initial page size, defaults to 20. */
  pageSize?: number
  /** Custom rowId for stable selection / persistence. */
  getRowId?: (row: T, index: number) => string
}

/**
 * Generic shadcn + tanstack-table list component. Wraps the boilerplate
 * (sort headers, pagination, global filter, loading skeleton, empty
 * state) so list pages only declare columns + data.
 *
 * Server-side pagination is not implemented here yet — all rows are
 * passed in and filtered/paginated client-side. Modules with thousands
 * of rows should switch to manual pagination later.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  empty,
  toolbar,
  showSearch = true,
  pageSize = 20,
  getRowId,
}: Props<T>) {
  const [globalFilter, setGlobalFilter] = useState("")

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const rows = table.getRowModel().rows
  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex
  const totalRows = table.getFilteredRowModel().rows.length

  return (
    <div className="space-y-3">
      {(showSearch || toolbar) && (
        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={m.data_table_search_placeholder()}
                className="pl-8"
              />
            </div>
          )}
          {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort()
                  const sortDir = h.column.getIsSorted()
                  return (
                    <TableHead key={h.id}>
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sortDir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sortDir === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_c, ci) => (
                    <TableCell key={ci}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 p-0">
                  {empty ?? (
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>{m.data_table_no_results()}</EmptyTitle>
                        <EmptyDescription>
                          {m.command_palette_no_results()}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {m.data_table_pagination_summary({
              page: pageIndex + 1,
              total: pageCount,
              count: totalRows,
            })}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs">{m.data_table_page_size()}</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {m.data_table_prev()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {m.data_table_next()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export type DataTableRow<T> = Row<T>
