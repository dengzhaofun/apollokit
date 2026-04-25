import { createFileRoute } from "@tanstack/react-router"
import { ScrollText, Search } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useTenantEventCounts,
  useTenantTrace,
  type TenantTraceRow,
} from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/analytics/logs/")({
  component: LogsPage,
})

/**
 * 日志查询页 —— 一期 MVP:
 *   - 左:最近 30 天事件类型分布(tenant_event_counts 聚合)
 *   - 右侧 Sheet:按 trace_id 查询完整事件流(tenant_trace)
 *
 * 二期会补:
 *   - 请求日志流水表(需要新 pipe tenant_recent_requests)
 *   - 事件流水表(需要新 pipe tenant_recent_events)
 *   - 细粒度过滤(路径、状态码、actor、事件名、outcome)
 */
function LogsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<ScrollText className="size-5" />}
        title={m.analytics_logs_title()}
        description={m.analytics_logs_subtitle()}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,380px)]">
          <ClientOnly
            fallback={<SkeletonBlock label={m.common_loading()} tall />}
          >
            <EventCountsPanel />
          </ClientOnly>
          <ClientOnly fallback={<SkeletonBlock label={m.common_loading()} />}>
            <TraceSearchPanel />
          </ClientOnly>
        </div>
      </PageBody>
    </PageShell>
  )
}

// ============================================================================
// Event counts panel —— 最近 30 天事件类型分布
// ============================================================================

function useAnalyticsWindow(days: number) {
  return useMemo(() => {
    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to)
    from.setDate(from.getDate() - days)
    return { from: from.toISOString(), to: to.toISOString(), days }
  }, [days])
}

function EventCountsPanel() {
  const w = useAnalyticsWindow(30)
  const { data, isLoading, isError, error } = useTenantEventCounts({
    from: w.from,
    to: w.to,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.analytics_logs_events_title()}</CardTitle>
        <CardDescription>
          {m.analytics_logs_events_subtitle()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {error?.message ?? m.analytics_logs_fetch_failed()}
          </div>
        ) : isLoading || !data ? (
          <SkeletonBlock label={m.common_loading()} />
        ) : data.data.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            <p className="font-medium">{m.analytics_logs_events_empty()}</p>
            <p className="mt-1 text-xs">
              {m.analytics_logs_events_empty_hint()}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.analytics_logs_col_event()}</TableHead>
                  <TableHead className="text-right">
                    {m.analytics_logs_col_count()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.analytics_logs_col_total_amount()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => (
                  <TableRow key={row.event}>
                    <TableCell className="font-mono text-sm">
                      {row.event}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(row.c).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Number(row.total_amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Trace search panel —— 右侧搜索框 + 点击展开 Sheet 显示 trace 完整流
// ============================================================================

function TraceSearchPanel() {
  const [input, setInput] = useState("")
  const [submittedTraceId, setSubmittedTraceId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setSubmittedTraceId(trimmed)
    setSheetOpen(true)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{m.analytics_logs_trace_title()}</CardTitle>
          <CardDescription>
            {m.analytics_logs_trace_subtitle()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={m.analytics_logs_trace_placeholder()}
              className="font-mono text-xs"
            />
            <Button type="submit" size="sm" disabled={!input.trim()}>
              <Search className="size-4" />
              <span className="sr-only">
                {m.analytics_logs_trace_submit()}
              </span>
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            {m.analytics_logs_trace_hint()}
          </p>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{m.analytics_logs_trace_sheet_title()}</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {submittedTraceId}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {submittedTraceId ? (
              <TraceBody traceId={submittedTraceId} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function TraceBody({ traceId }: { traceId: string }) {
  const { data, isLoading, isError, error } = useTenantTrace({ traceId })

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {error?.message ?? m.analytics_logs_fetch_failed()}
      </div>
    )
  }
  if (isLoading || !data) {
    return <SkeletonBlock label={m.common_loading()} />
  }
  if (data.data.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        <p className="font-medium">
          {m.analytics_logs_trace_empty_title()}
        </p>
        <p className="mt-1 text-xs">
          {m.analytics_logs_trace_empty_subtitle()}
        </p>
      </div>
    )
  }

  return (
    <ol className="space-y-3">
      {data.data.map((row, idx) => (
        <TraceEventItem key={`${row.timestamp}-${idx}`} row={row} />
      ))}
    </ol>
  )
}

function TraceEventItem({ row }: { row: TenantTraceRow }) {
  let parsedData: unknown = null
  try {
    parsedData = row.event_data ? JSON.parse(row.event_data) : null
  } catch {
    parsedData = row.event_data
  }

  const outcomeColor =
    row.outcome === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : row.outcome === "error"
        ? "text-destructive"
        : "text-muted-foreground"

  return (
    <li className="rounded-md border p-3 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <code className="text-sm font-mono">{row.event}</code>
        <time className="font-mono text-muted-foreground">
          {new Date(row.timestamp).toLocaleTimeString()}
        </time>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-muted-foreground">
        <dt>source</dt>
        <dd className="font-mono">{row.source}</dd>
        <dt>outcome</dt>
        <dd className={`font-mono ${outcomeColor}`}>{row.outcome}</dd>
        {row.amount ? (
          <>
            <dt>amount</dt>
            <dd className="font-mono tabular-nums">{row.amount}</dd>
          </>
        ) : null}
        {row.end_user_id ? (
          <>
            <dt>end_user_id</dt>
            <dd className="font-mono">{row.end_user_id}</dd>
          </>
        ) : null}
      </dl>
      {parsedData && typeof parsedData === "object" ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      ) : null}
    </li>
  )
}

// ============================================================================
// Shared helpers
// ============================================================================

function SkeletonBlock({
  label,
  tall,
}: {
  label: string
  tall?: boolean
}) {
  return (
    <div
      className={
        tall
          ? "flex h-80 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
          : "flex h-40 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
      }
    >
      {label}
    </div>
  )
}

function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return <>{mounted ? children : fallback}</>
}
