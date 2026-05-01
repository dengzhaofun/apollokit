/**
 * Generic shadcn + tanstack-table list component — server-paginated.
 *
 * Every list page in admin uses cursor pagination against the backend's
 * `?cursor&limit&q&...filters&adv` contract (see
 * `apps/server/src/lib/pagination.ts` + `list-filter.ts`). The table
 * itself does NO client-side filtering or sorting — the server is the
 * source of truth for both. This is what makes the dashboard scale: a
 * 100k-row table never lands in the browser.
 *
 * The caller's job is small:
 *   - pass current page rows + `nextCursor` + pagination callbacks
 *   - pass `filterDefs` describing which filter facets the toolbar
 *     should render, and the current values + setters
 *   - optionally enable Advanced mode for nested AND/OR queries
 *
 * The `useListSearch` hook in `#/hooks/use-list-search` produces the
 * exact prop bag this component expects via `list.tableProps` plus
 * `list.filters / setFilter / mode / setMode / advanced / setAdvanced`.
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
  type RowData,
} from "@tanstack/react-table"
import { Search } from "lucide-react"
import { type ReactNode } from "react"

import {
  type MoveBody,
  RowMoveActions,
  SortableTableProvider,
  SortableTableRow,
} from "#/components/common/SortableTable"
import { useIsMobile } from "#/hooks/use-mobile"

import { DataCardList } from "./DataCardList"

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

import { DataTableAdvancedFilter } from "./DataTableAdvancedFilter"
import { DataTableFilterToolbar } from "./DataTableFilterToolbar"

import type { FilterDef, FilterValue } from "#/hooks/use-list-search"
import type { RuleGroupType } from "#/components/ui/query-builder"

// Extend tanstack-table's ColumnMeta with mobile-card-list slots so
// callers can tag columns via `meta: { primary: true }` etc. with full
// type-checking. See `DataCardList.tsx` for runtime semantics.
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Render this column as the card header on mobile (defaults to first non-actions column). */
    primary?: boolean
    /** Render this column in the card's top-right action slot on mobile. */
    isActions?: boolean
    /** Hide this column from the mobile card view entirely. */
    hideOnMobile?: boolean
  }
}

interface Props<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  /** Rows for the current page only — never the full dataset. */
  data: T[]
  isLoading?: boolean
  /** Custom empty-state node. Falls back to a generic "no matches". */
  empty?: ReactNode
  /** Optional left-side content next to the search box (e.g. extra buttons). */
  toolbar?: ReactNode

  /**
   * Mobile (`< 768px`) rendering mode. Defaults to `"scroll"` — the
   * regular `<Table>` is rendered inside a horizontal-scroll container.
   * `"cards"` switches to a card list (`<DataCardList>`) on mobile only;
   * desktop / tablet still get the table. Tag columns via `meta.primary`
   * / `meta.isActions` / `meta.hideOnMobile` to fine-tune card layout —
   * sensible defaults work without any annotation. Sortable mode keeps
   * the table on mobile too (DnD doesn't make sense on a phone).
   */
  mobileLayout?: "scroll" | "cards"

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

  // ─── Filters (faceted + advanced) ───────────────────────────────────
  /** Declarative filter spec — drives the toolbar's facets and the
   *  advanced QueryBuilder's field list. */
  filters?: FilterDef[]
  /** Current filter values, keyed by filter id. */
  filterValues?: Record<string, FilterValue["value"]>
  /** Set a single filter id to a new value (undefined to clear). */
  onFilterChange?: (id: string, value: FilterValue["value"]) => void
  /** Reset all filters at once. */
  onResetFilters?: () => void
  /** True when at least one filter has a non-empty value. */
  hasActiveFilters?: boolean
  /** Number of currently-active filters (badge display). */
  activeFilterCount?: number

  /** Toolbar mode toggle. Pass undefined to hide the toggle entirely. */
  mode?: "basic" | "advanced"
  onModeChange?: (mode: "basic" | "advanced") => void
  /** Advanced AST (react-querybuilder format) — controlled. */
  advancedQuery?: RuleGroupType | undefined
  onAdvancedQueryChange?: (next: RuleGroupType) => void

  /** Custom rowId for stable selection. */
  getRowId?: (row: T, index: number) => string

  /**
   * Opt-in fractional-key sorting. When set, each row gets:
   *   - a leading drag handle column (▣)
   *   - a trailing actions column with 置顶 / ▲ / ▼ / 置后 buttons
   *
   * Drag-drop and the 4 buttons all call `onMove(id, body)` which
   * should fire the corresponding `useMoveX` mutation. Filters /
   * search / advanced query disable the sort UI (re-ordering inside
   * a filtered subset doesn't make geographic sense — restore the
   * unfiltered view to reorder).
   */
  sortable?: {
    onMove: (id: string, body: MoveBody) => void
    /** Disable while a mutation is in flight. */
    disabled?: boolean
  }
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

export function DataTable<T>({
  columns,
  data,
  isLoading,
  empty,
  toolbar,
  mobileLayout = "scroll",
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
  filters,
  filterValues,
  onFilterChange,
  onResetFilters,
  hasActiveFilters,
  activeFilterCount,
  mode,
  onModeChange,
  advancedQuery,
  onAdvancedQueryChange,
  getRowId,
  sortable,
}: Props<T>) {
  const isMobile = useIsMobile()
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

  // Filter toolbar is rendered when there are filters OR the caller
  // wired up a mode toggle. Otherwise we skip the row entirely.
  const hasFilters = !!(filters && filters.length > 0)
  const hasModeToggle = !!(mode && onModeChange)
  const showFilterRow = hasFilters || hasModeToggle
  const isAdvanced = mode === "advanced"

  // Sort UI only makes sense without active filters / search / advanced
  // mode — re-ordering inside a filtered subset is ambiguous. The
  // sortable prop is opt-in; we further auto-disable it whenever the
  // caller has narrowed the row set.
  const sortableActive =
    !!sortable &&
    !hasActiveFilters &&
    !isAdvanced &&
    !(searchValue && searchValue.trim() !== "")
  const totalColSpan = columns.length + (sortableActive ? 2 : 0)

  // Mobile cards: opt-in via `mobileLayout="cards"`, only when not
  // sortable (DnD doesn't translate to a phone) and only at < md.
  const useCardLayout =
    mobileLayout === "cards" && isMobile && !sortableActive

  return (
    <div className="space-y-3">
      {(showSearch || toolbar) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {showSearch && onSearchChange ? (
            <div className="relative w-full md:flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={m.data_table_search_placeholder()}
                className="pl-8"
              />
            </div>
          ) : null}
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      )}

      {showFilterRow ? (
        <DataTableFilterToolbar
          filterDefs={filters ?? []}
          filterValues={filterValues ?? {}}
          onFilterChange={onFilterChange ?? (() => {})}
          onResetFilters={onResetFilters ?? (() => {})}
          hasActiveFilters={!!hasActiveFilters}
          activeFilterCount={activeFilterCount ?? 0}
          mode={mode ?? "basic"}
          onModeChange={onModeChange ?? (() => {})}
          showAdvancedToggle={hasModeToggle}
        />
      ) : null}

      {isAdvanced && hasFilters && onAdvancedQueryChange && onModeChange ? (
        <DataTableAdvancedFilter
          filterDefs={filters!}
          query={advancedQuery}
          onChange={onAdvancedQueryChange}
          onClear={() => onModeChange("basic")}
        />
      ) : null}

      <div
        className={
          sortableActive || useCardLayout
            ? "rounded-xl border bg-card shadow-sm"
            : "overflow-x-auto rounded-xl border bg-card shadow-sm"
        }
      >
        {useCardLayout ? (
          <DataCardList
            table={table}
            rows={rows}
            isLoading={isLoading}
            empty={empty}
          />
        ) : (
          <DataTableInner
            table={table}
            rows={rows}
            isLoading={isLoading}
            columns={columns}
            empty={empty}
            totalColSpan={totalColSpan}
            sortableActive={sortableActive}
            sortable={sortable}
          />
        )}
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

// ─── Inner — branches on sortable to wrap in DnD context ─────────────

function DataTableInner<T>({
  table,
  rows,
  isLoading,
  columns,
  empty,
  totalColSpan,
  sortableActive,
  sortable,
}: {
  table: ReturnType<typeof useReactTable<T>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
  isLoading: boolean | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  empty: ReactNode
  totalColSpan: number
  sortableActive: boolean
  sortable: Props<T>["sortable"]
}) {
  const headerGroups = table.getHeaderGroups()

  const headerCells = (
    <>
      {sortableActive ? <TableHead className="w-8" /> : null}
      {headerGroups.map((hg) =>
        hg.headers.map((h) => (
          <TableHead key={h.id}>
            {h.isPlaceholder
              ? null
              : flexRender(h.column.columnDef.header, h.getContext())}
          </TableHead>
        )),
      )}
      {sortableActive ? (
        <TableHead className="w-40 text-right">
          {m.data_table_reorder_actions()}
        </TableHead>
      ) : null}
    </>
  )

  const bodyContent = isLoading ? (
    Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        {sortableActive ? (
          <TableCell>
            <Skeleton className="h-4 w-4" />
          </TableCell>
        ) : null}
        {columns.map((_c, ci) => (
          <TableCell key={ci}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ))}
        {sortableActive ? (
          <TableCell>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ) : null}
      </TableRow>
    ))
  ) : rows.length === 0 ? (
    <TableRow>
      <TableCell colSpan={totalColSpan} className="h-32 p-0">
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
  ) : sortableActive ? (
    rows.map((row, idx) => (
      <SortableTableRow key={row.id} id={row.id}>
        {row.getVisibleCells().map((cell: { id: string; column: { columnDef: { cell: unknown } }; getContext: () => unknown }) => (
          <TableCell key={cell.id}>
            {flexRender(
              cell.column.columnDef.cell as never,
              cell.getContext() as never,
            )}
          </TableCell>
        ))}
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-0.5">
            <RowMoveActions
              id={row.id}
              prevId={rows[idx - 1]?.id}
              nextId={rows[idx + 1]?.id}
              isFirst={idx === 0}
              isLast={idx === rows.length - 1}
            />
          </div>
        </TableCell>
      </SortableTableRow>
    ))
  ) : (
    rows.map((row) => (
      <TableRow key={row.id}>
        {row.getVisibleCells().map((cell: { id: string; column: { columnDef: { cell: unknown } }; getContext: () => unknown }) => (
          <TableCell key={cell.id}>
            {flexRender(
              cell.column.columnDef.cell as never,
              cell.getContext() as never,
            )}
          </TableCell>
        ))}
      </TableRow>
    ))
  )

  const tableNode = (
    <Table>
      <TableHeader>
        <TableRow>{headerCells}</TableRow>
      </TableHeader>
      <TableBody>{bodyContent}</TableBody>
    </Table>
  )

  if (sortableActive && sortable) {
    return (
      <SortableTableProvider
        items={rows.map((r) => ({ id: r.id }))}
        onMove={sortable.onMove}
        disabled={sortable.disabled}
      >
        {tableNode}
      </SortableTableProvider>
    )
  }

  return tableNode
}
