import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useMemo } from "react"

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
import type { BadgeNode } from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

type Props = {
  data: BadgeNode[]
}

type TreeRow = BadgeNode & { depth: number }

/**
 * Flatten the node list into a depth-tagged, parent-first sequence so
 * the <Table> reads top-down like a filesystem tree. Roots are sorted
 * by sortOrder+key; children recursively likewise.
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
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
  }

  const out: TreeRow[] = []
  function walk(parent: string | null, depth: number) {
    const children = byParent.get(parent) ?? []
    for (const child of children) {
      out.push({ ...child, depth })
      walk(child.key, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function BadgeNodeTable({ data }: Props) {
  const rows = useMemo(() => flattenTree(data), [data])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.badge_col_key()}</TableHead>
          <TableHead>{m.badge_col_display_type()}</TableHead>
          <TableHead>{m.badge_col_signal_binding()}</TableHead>
          <TableHead>{m.badge_col_dismiss_mode()}</TableHead>
          <TableHead>{m.badge_col_aggregation()}</TableHead>
          <TableHead>{m.badge_col_status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              {m.badge_empty()}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
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
                ) : row.signalMatchMode === "prefix" && row.signalKeyPrefix ? (
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
                <Badge variant={row.isEnabled ? "default" : "outline"}>
                  {row.isEnabled ? m.common_active() : m.common_inactive()}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
