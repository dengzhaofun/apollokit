import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useMemo } from "react"

import {
  RowMoveActions,
  SortableTableProvider,
  SortableTableRow,
} from "#/components/common/SortableTable"
import { Badge } from "#/components/ui/badge"
import { RedDot, type RedDotDisplayType } from "#/components/ui/red-dot"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useIsMobile } from "#/hooks/use-mobile"
import { useMoveBadgeNode } from "#/hooks/use-move"
import type { BadgeNode } from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

type Props = {
  data: BadgeNode[]
}

type TreeRow = BadgeNode & {
  depth: number
  /** Same-parent neighbours used for ▲▼ — undefined when at the boundary. */
  siblingPrevId: string | undefined
  siblingNextId: string | undefined
  isFirstSibling: boolean
  isLastSibling: boolean
}

/**
 * Flatten the node list into a depth-tagged, parent-first sequence so
 * the <Table> reads top-down like a filesystem tree. Roots are sorted
 * by sortOrder+key; children recursively likewise. Sibling-level
 * neighbours are recorded on each row for the ▲▼ move buttons (move
 * across parents requires a UI we don't render — those rows just have
 * no prev/next).
 */
function flattenTree(nodes: BadgeNode[]): TreeRow[] {
  const byParent = new Map<string | null, BadgeNode[]>()
  for (const n of nodes) {
    const key = n.parentKey ?? null
    const list = byParent.get(key) ?? []
    list.push(n)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) =>
        a.sortOrder.localeCompare(b.sortOrder) || a.key.localeCompare(b.key),
    )
  }

  const out: TreeRow[] = []
  function walk(parent: string | null, depth: number) {
    const children = byParent.get(parent) ?? []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      out.push({
        ...child,
        depth,
        siblingPrevId: children[i - 1]?.id,
        siblingNextId: children[i + 1]?.id,
        isFirstSibling: i === 0,
        isLastSibling: i === children.length - 1,
      })
      walk(child.key, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function BadgeNodeTable({ data }: Props) {
  const moveMutation = useMoveBadgeNode()
  const rows = useMemo(() => flattenTree(data), [data])
  const isMobile = useIsMobile()

  // Mobile: tree DnD doesn't translate to a phone (drag handles + cross-row
  // hit testing are too small), so render a card list with depth-indented
  // entries instead. Keep the ▲▼ / 置顶 / 置后 reorder buttons (which work
  // fine via tap) so users can still rearrange siblings without DnD —
  // `RowMoveActions` reads the move handler from `SortableTableProvider`'s
  // context, so we still wrap in the provider (its `useSortable` is opt-in
  // per row via `SortableTableRow`, which we don't render on mobile).
  if (isMobile) {
    if (rows.length === 0) {
      return (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          {m.badge_empty()}
        </div>
      )
    }
    return (
      <SortableTableProvider
        items={rows}
        onMove={(id, body) => moveMutation.mutate({ id, body })}
        disabled={moveMutation.isPending}
      >
        <div className="divide-y">
          {rows.map((row) => (
            <BadgeNodeCard key={row.id} row={row} />
          ))}
        </div>
      </SortableTableProvider>
    )
  }

  return (
    <SortableTableProvider
      // Note: tree DnD is sibling-only here. Dragging across parents
      // would change the badge's parentKey — that's an `updateNode`
      // operation, not `moveNode`. The provider sees the flat list and
      // will commit any drop, but cross-parent drops will reorder the
      // sortOrder space in a way that visually settles back into the
      // original tree structure on next render.
      items={rows}
      onMove={(id, body) => moveMutation.mutate({ id, body })}
      disabled={moveMutation.isPending}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{m.badge_col_key()}</TableHead>
            <TableHead>{m.badge_col_display_type()}</TableHead>
            <TableHead>{m.badge_col_signal_binding()}</TableHead>
            <TableHead>{m.badge_col_dismiss_mode()}</TableHead>
            <TableHead>{m.badge_col_aggregation()}</TableHead>
            <TableHead>{m.badge_col_status()}</TableHead>
            <TableHead className="w-40 text-right">
              {m.data_table_reorder_actions()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center">
                {m.badge_empty()}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <SortableTableRow key={row.id} id={row.id}>
                <TableCell>
                  <div
                    className="flex items-center gap-1.5"
                    style={{ paddingLeft: `${row.depth * 20}px` }}
                  >
                    {row.depth > 0 ? (
                      <ChevronRight className="size-3 text-muted-foreground" />
                    ) : null}
                    <Link
                      to="/badge/$nodeId"
                      params={{ nodeId: row.id }}
                      className="font-mono text-sm hover:underline"
                    >
                      {row.key}
                    </Link>
                    <RedDot
                      displayType={row.displayType as RedDotDisplayType}
                      count={1}
                      forceVisible
                      className="ml-1"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.displayType}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {row.signalMatchMode === "exact" && row.signalKey ? (
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {row.signalKey}
                    </code>
                  ) : row.signalMatchMode === "prefix" &&
                    row.signalKeyPrefix ? (
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {row.signalKeyPrefix}*
                    </code>
                  ) : (
                    <span className="text-muted-foreground">
                      {m.badge_match_none_hint()}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.dismissMode}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.aggregation}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.isActive ? "default" : "outline"}>
                    {row.isActive ? m.common_active() : m.common_inactive()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <RowMoveActions
                      id={row.id}
                      // ▲▼ stay sibling-bounded so the user can't
                      // accidentally rearrange across the tree.
                      prevId={row.siblingPrevId}
                      nextId={row.siblingNextId}
                      isFirst={row.isFirstSibling}
                      isLast={row.isLastSibling}
                    />
                  </div>
                </TableCell>
              </SortableTableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SortableTableProvider>
  )
}

function BadgeNodeCard({ row }: { row: TreeRow }) {
  return (
    <div
      className="space-y-2 p-3"
      style={{ paddingLeft: `${0.75 + row.depth * 1.25}rem` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {row.depth > 0 ? (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
          <Link
            to="/badge/$nodeId"
            params={{ nodeId: row.id }}
            className="truncate font-mono text-sm hover:underline"
          >
            {row.key}
          </Link>
          <RedDot
            displayType={row.displayType as RedDotDisplayType}
            count={1}
            forceVisible
            className="ml-1 shrink-0"
          />
        </div>
        <Badge
          variant={row.isActive ? "default" : "outline"}
          className="shrink-0"
        >
          {row.isActive ? m.common_active() : m.common_inactive()}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{row.displayType}</Badge>
        <Badge variant="secondary">{row.dismissMode}</Badge>
        <Badge variant="outline">{row.aggregation}</Badge>
      </div>
      <div className="text-xs">
        {row.signalMatchMode === "exact" && row.signalKey ? (
          <code className="rounded bg-muted px-1.5 py-0.5">
            {row.signalKey}
          </code>
        ) : row.signalMatchMode === "prefix" && row.signalKeyPrefix ? (
          <code className="rounded bg-muted px-1.5 py-0.5">
            {row.signalKeyPrefix}*
          </code>
        ) : (
          <span className="text-muted-foreground">
            {m.badge_match_none_hint()}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <RowMoveActions
          id={row.id}
          prevId={row.siblingPrevId}
          nextId={row.siblingNextId}
          isFirst={row.isFirstSibling}
          isLast={row.isLastSibling}
        />
      </div>
    </div>
  )
}
