/**
 * 单条审计日志的详情 Sheet —— 元数据卡片 + before/after JSON 双栏。
 *
 * v1 不做 deep-diff 高亮（react-json-view 之类要拖一个新依赖进来）；
 * 用简单 `<pre>` 把 JSON 格式化打出来，配色靠 prose-friendly Tailwind。
 * 即使 before/after 都为 null（middleware 元数据级行的常态）也不报错，
 * 直接显示"无 diff"占位。
 */
import { useMemo } from "react"

import { Badge } from "#/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { useAuditLog } from "#/hooks/use-audit-logs"

interface Props {
  id: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="break-words">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  )
}

function JsonBlock({ value }: { value: Record<string, unknown> | null }) {
  const pretty = useMemo(() => {
    if (!value) return null
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }, [value])
  if (!pretty) {
    return (
      <div className="rounded border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
        no payload
      </div>
    )
  }
  return (
    <pre className="max-h-[40vh] overflow-auto rounded border bg-muted/50 p-3 text-xs leading-relaxed">
      {pretty}
    </pre>
  )
}

export function AuditLogDetailSheet({ id, open, onOpenChange }: Props) {
  const { data: row, isPending, error } = useAuditLog(id ?? undefined)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Audit log entry</SheetTitle>
          <SheetDescription>
            Full record including request context and before/after diff
            (when the service layer supplied one).
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-6">
          {isPending ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Failed to load: {error.message}
            </div>
          ) : !row ? null : (
            <>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Operation
                </h3>
                <MetaRow label="When" value={new Date(row.ts).toLocaleString()} />
                <MetaRow
                  label="Action"
                  value={
                    <Badge
                      variant={
                        row.action === "delete"
                          ? "destructive"
                          : row.action === "create"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {row.action}
                    </Badge>
                  }
                />
                <MetaRow
                  label="Method"
                  value={<code className="text-xs">{row.method}</code>}
                />
                <MetaRow
                  label="Path"
                  value={
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                      {row.path}
                    </code>
                  }
                />
                <MetaRow
                  label="Status"
                  value={
                    <Badge
                      variant={
                        row.status >= 500
                          ? "destructive"
                          : row.status >= 400
                            ? "outline"
                            : "secondary"
                      }
                      className="tabular-nums"
                    >
                      {row.status}
                    </Badge>
                  }
                />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actor
                </h3>
                <MetaRow label="Type" value={row.actorType} />
                <MetaRow
                  label="ID"
                  value={
                    row.actorId ? (
                      <code className="text-xs">{row.actorId}</code>
                    ) : null
                  }
                />
                <MetaRow label="Label" value={row.actorLabel} />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Target
                </h3>
                <MetaRow
                  label="Type"
                  value={
                    <code className="text-xs">{row.resourceType}</code>
                  }
                />
                <MetaRow
                  label="ID"
                  value={
                    row.resourceId ? (
                      <code className="text-xs">{row.resourceId}</code>
                    ) : null
                  }
                />
                <MetaRow label="Label" value={row.resourceLabel} />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Request context
                </h3>
                <MetaRow label="Trace" value={row.traceId} />
                <MetaRow label="IP" value={row.ip} />
                <MetaRow
                  label="User-Agent"
                  value={
                    row.userAgent ? (
                      <span className="text-xs">{row.userAgent}</span>
                    ) : null
                  }
                />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Before
                </h3>
                <JsonBlock value={row.before} />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  After
                </h3>
                <JsonBlock value={row.after} />
              </section>

              {row.metadata ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Metadata
                  </h3>
                  <JsonBlock value={row.metadata} />
                </section>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
