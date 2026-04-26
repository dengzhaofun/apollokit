/**
 * Generic shadcn + tanstack-table list component — server-paginated.
 *
 * Every list page in admin uses cursor pagination against the backend's
 * `?cursor&limit&q` contract (see `apps/server/src/lib/pagination.ts`).
 * The table itself does NO client-side filtering or sorting — the
 * server is the source of truth for both. This is what makes the
 * dashboard scale: a 100k-row table never lands in the browser.
 *
 * The caller's job: pass the current page's rows + `nextCursor` +
 * pagination callbacks. The `useCursorList` hook in
 * `#/hooks/use-cursor-list` does that boilerplate.
 *
 * Sorting: client-side sort is disabled. If a module needs sorted
 * output, the server's list service returns rows in its canonical
 * order (e.g. `(createdAt DESC, id DESC)` — see lib/pagination.ts).
 */

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table"
import { Search } from "lucide-react"
import { type ReactNode } from "react"

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
  /** Rows for the current page only — never the full dataset. */
  data: T[]
  isLoading?: boolean
  /** Custom empty-state node. Falls back to a generic "no matches". */
  empty?: ReactNode
  /** Optional left-side content next to the search box (e.g. filters). */
  toolbar?: ReactNode

  // ─── Pagination (server-driven cursor) ─────────────────────────────
  /** Current page index, 1-based, for display only. */
  pageIndex: number
  /** Whether a "previous" navigation is possible (i.e. not on first page). */
  canPrev: boolean
  /** Whether a "next" navigation is possible (server returned a nextCursor). */
  canNext: boolean
  onNextPage: () => void
  onPrevPage: () => void
  /** Page size (rows-per-page select). */
  pageSize: number
  onPageSizeChange: (size: number) => void

  // ─── Search (server-driven) ─────────────────────────────────────────
  /** Hide the built-in search box if the route doesn't support `q`. */
  showSearch?: boolean
  /** Current search term — controlled input so route can debounce. */
  searchValue?: string
  onSearchChange?: (value: string) => void

  /** Custom rowId for stable selection. */
  getRowId?: (row: T, index: number) => string
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

export function DataTable<T>({
  columns,
  data,
  isLoading,
  empty,
  toolbar,
  pageIndex,
  canPrev,
  canNext,
  onNextPage,
  onPrevPage,
  pageSize,
  onPageSizeChange,
  showSearch = true,
  searchValue,
  onSearchChange,
  getRowId,
}: Props<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = table.getRowModel().rows

  return (
    <div className="space-y-3">
      {(showSearch || toolbar) && (
        <div className="flex items-center gap-2">
          {showSearch && onSearchChange ? (
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={m.data_table_search_placeholder()}
                className="pl-8"
              />
            </div>
          ) : null}
          {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {m.data_table_pagination_summary({
            page: pageIndex,
            count: rows.length,
          })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs">{m.data_table_page_size()}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={!canPrev || isLoading}
          >
            {m.data_table_prev()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!canNext || isLoading}
          >
            {m.data_table_next()}
          </Button>
        </div>
      </div>
    </div>
  )
}

export type DataTableRow<T> = Row<T>
