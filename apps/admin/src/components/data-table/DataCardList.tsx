/**
 * Mobile-friendly card list view for `<DataTable>` rows. Used as a drop-in
 * replacement for `<Table>` on narrow viewports — same `useReactTable`
 * instance, same `columns`, same `data`, just rendered as cards instead
 * of a row-per-row table.
 *
 * Per-row layout:
 *   ┌──────────────────────────────────┐
 *   │ {primary cell}        {actions}  │
 *   │ ─────────────────────────────    │
 *   │ {label}    {value}               │
 *   │ {label}    {value}               │
 *   └──────────────────────────────────┘
 *
 * Column → slot routing (via `column.meta`):
 *   - `meta.primary: true`     → header (defaults to first non-actions column)
 *   - `meta.isActions: true`   → top-right slot
 *   - `meta.hideOnMobile: true`→ skipped entirely
 *   - everything else          → label / value body row
 *
 * No column-meta annotations are required — the defaults work, callers
 * can polish individual tables by tagging columns. See `team/index.tsx`
 * and `friend-gift/index.tsx` for examples.
 */
import { flexRender, type Row, type Table } from "@tanstack/react-table"
import { Fragment, type ReactNode } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty"
import { Skeleton } from "#/components/ui/skeleton"
import * as m from "#/paraglide/messages.js"

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: Table<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Row<any>[]
  isLoading?: boolean
  empty?: ReactNode
  /** Number of skeleton cards to render while loading. */
  skeletonCount?: number
}

export function DataCardList({
  table,
  rows,
  isLoading,
  empty,
  skeletonCount = 4,
}: Props) {
  if (isLoading) {
    return (
      <div className="divide-y">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="space-y-2 p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="p-3">
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
      </div>
    )
  }

  // Map column.id → header so the body rows can re-use it as a label.
  // We render the header via flexRender so functional headers (e.g.
  // `header: () => m.foo()`) work exactly as in the table.
  const headerByColumnId = new Map(
    table
      .getFlatHeaders()
      .map((h) => [h.column.id, h] as const),
  )

  return (
    <div className="divide-y">
      {rows.map((row) => (
        <DataCardRow
          key={row.id}
          row={row}
          headerByColumnId={headerByColumnId}
        />
      ))}
    </div>
  )
}

function DataCardRow({
  row,
  headerByColumnId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: Row<any>
  headerByColumnId: Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ReturnType<Table<any>["getFlatHeaders"]>[number]
  >
}) {
  const cells = row.getVisibleCells()

  const primaryCell = cells.find((c) => c.column.columnDef.meta?.primary)
  const actionsCell = cells.find((c) => c.column.columnDef.meta?.isActions)

  // Fallback: if no primary marked, use the first non-actions visible cell.
  const headerCell =
    primaryCell ??
    cells.find((c) => c.column.columnDef.meta?.isActions !== true) ??
    cells[0]

  const bodyCells = cells.filter((c) => {
    if (c.column.id === headerCell?.column.id) return false
    if (actionsCell && c.column.id === actionsCell.column.id) return false
    if (c.column.columnDef.meta?.hideOnMobile) return false
    return true
  })

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm">
          {headerCell
            ? flexRender(
                headerCell.column.columnDef.cell,
                headerCell.getContext(),
              )
            : null}
        </div>
        {actionsCell ? (
          <div className="shrink-0">
            {flexRender(
              actionsCell.column.columnDef.cell,
              actionsCell.getContext(),
            )}
          </div>
        ) : null}
      </div>
      {bodyCells.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {bodyCells.map((cell) => {
            const header = headerByColumnId.get(cell.column.id)
            return (
              <Fragment key={cell.id}>
                <dt className="truncate text-muted-foreground">
                  {header && !header.isPlaceholder
                    ? flexRender(
                        cell.column.columnDef.header,
                        header.getContext(),
                      )
                    : null}
                </dt>
                <dd className="min-w-0 break-words text-right">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </dd>
              </Fragment>
            )
          })}
        </dl>
      ) : null}
    </div>
  )
}

