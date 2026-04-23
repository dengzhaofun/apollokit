import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { RedDot, type RedDotDisplayType } from "#/components/ui/red-dot"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useBadgePreview } from "#/hooks/use-badge"
import { ApiError } from "#/lib/api-client"
import type { BadgeTreeNode } from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

function flattenWithDepth(
  nodes: BadgeTreeNode[],
  depth = 0,
): Array<BadgeTreeNode & { depth: number }> {
  const out: Array<BadgeTreeNode & { depth: number }> = []
  for (const n of nodes) {
    out.push({ ...n, depth })
    if (n.children?.length) out.push(...flattenWithDepth(n.children, depth + 1))
  }
  return out
}

export function BadgeInspector() {
  const [endUserId, setEndUserId] = useState("")
  const [rootKey, setRootKey] = useState("")
  const preview = useBadgePreview()

  async function run() {
    if (!endUserId.trim()) return
    try {
      await preview.mutateAsync({
        endUserId: endUserId.trim(),
        rootKey: rootKey.trim() || null,
        explain: true,
      })
    } catch (err) {
      // errors surface in the result panel below; no toast needed here
      if (!(err instanceof ApiError)) console.error(err)
    }
  }

  const rows = preview.data ? flattenWithDepth(preview.data.nodes) : []

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1">
            <Label htmlFor="endUserId">{m.badge_inspector_end_user()} *</Label>
            <Input
              id="endUserId"
              value={endUserId}
              onChange={(e) => setEndUserId(e.target.value)}
              placeholder="player_42"
            />
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label htmlFor="rootKey">{m.badge_inspector_root_key()}</Label>
            <Input
              id="rootKey"
              value={rootKey}
              onChange={(e) => setRootKey(e.target.value)}
              placeholder="home"
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={run}
              disabled={!endUserId.trim() || preview.isPending}
              className="w-full"
            >
              {preview.isPending
                ? m.common_loading()
                : m.badge_inspector_run()}
            </Button>
          </div>
        </div>
      </section>

      {preview.error ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {preview.error instanceof ApiError
            ? preview.error.message
            : m.badge_inspector_error()}
        </div>
      ) : null}

      {preview.data ? (
        <>
          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                {m.badge_inspector_tree_title()}
              </h2>
              <span className="text-xs text-muted-foreground">
                {m.badge_inspector_server_ts()}:{" "}
                {new Date(preview.data.serverTimestamp).toLocaleString()}
              </span>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.badge_col_key()}</TableHead>
                  <TableHead>{m.badge_col_count()}</TableHead>
                  <TableHead>{m.badge_col_display_type()}</TableHead>
                  <TableHead>{m.badge_inspector_reason()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {m.badge_inspector_no_nodes()}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: `${r.depth * 20}px` }}
                        >
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {r.key}
                          </code>
                          <RedDot
                            displayType={r.displayType as RedDotDisplayType}
                            count={r.count}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{r.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.displayType}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.explain?.reason ?? "—"}
                        {r.explain?.dismissal ? (
                          <div className="mt-1 text-[10px]">
                            dismissed {r.explain.dismissal.dismissedAt}{" "}
                            {r.explain.dismissal.stale
                              ? `(${m.badge_inspector_dismissal_stale()})`
                              : `(${m.badge_inspector_dismissal_active()})`}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">
              {m.badge_inspector_raw_signals()} (
              {preview.data.rawSignals.length})
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>signalKey</TableHead>
                  <TableHead>count</TableHead>
                  <TableHead>version</TableHead>
                  <TableHead>updatedAt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.data.rawSignals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-12 text-center text-muted-foreground"
                    >
                      {m.badge_inspector_no_signals()}
                    </TableCell>
                  </TableRow>
                ) : (
                  preview.data.rawSignals.map((s) => (
                    <TableRow key={s.signalKey}>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {s.signalKey}
                        </code>
                      </TableCell>
                      <TableCell className="tabular-nums">{s.count}</TableCell>
                      <TableCell className="text-xs">
                        {s.version ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.updatedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">
              {m.badge_inspector_raw_dismissals()} (
              {preview.data.rawDismissals.length})
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>nodeKey</TableHead>
                  <TableHead>version</TableHead>
                  <TableHead>periodKey</TableHead>
                  <TableHead>dismissedAt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.data.rawDismissals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-12 text-center text-muted-foreground"
                    >
                      {m.badge_inspector_no_dismissals()}
                    </TableCell>
                  </TableRow>
                ) : (
                  preview.data.rawDismissals.map((d) => (
                    <TableRow key={d.nodeKey}>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {d.nodeKey}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.dismissedVersion ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.periodKey ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.dismissedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </>
      ) : null}
    </div>
  )
}
