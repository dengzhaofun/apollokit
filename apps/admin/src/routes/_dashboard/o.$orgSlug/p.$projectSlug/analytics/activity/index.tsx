import { createFileRoute } from "@tanstack/react-router"
import { useNavigate } from "#/components/router-helpers"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
} from "lucide-react"
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
} from "#/components/patterns"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
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
import { EventNamePicker } from "#/components/analytics/EventNamePicker"
import {
  isValidJsonKey,
  useTenantEventStream,
  useTenantTrace,
  type TenantEventStreamRow,
  type TenantTraceRow,
} from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

const OUTCOME_OPTIONS = ["ok", "error", "denied"] as const

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/analytics/activity/")({
  component: ActivityPage,
})

type WindowOption = "24h" | "7d" | "30d"
const WINDOW_DAYS: Record<WindowOption, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
}

function useWindow(option: WindowOption) {
  return useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - WINDOW_DAYS[option] * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [option])
}

function ActivityPage() {
  return (
    <PageShell>
      <PageHeader
        icon={<Activity className="size-5" />}
        title={m.analytics_activity_title()}
        description={m.analytics_activity_subtitle()}
      />
      <PageBody>
        <ClientOnly fallback={<SkeletonBlock tall />}>
          <ActivityInner />
        </ClientOnly>
      </PageBody>
    </PageShell>
  )
}

interface Filters {
  event: string
  source: string
  outcome: string
  endUserId: string
  jsonPath: string
  jsonValue: string
}

const EMPTY_FILTERS: Filters = {
  event: "",
  source: "",
  outcome: "",
  endUserId: "",
  jsonPath: "",
  jsonValue: "",
}

function ActivityInner() {
  const navigate = useNavigate()
  const [windowOption, setWindowOption] = useState<WindowOption>("24h")
  const w = useWindow(windowOption)

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)

  // 累积已加载页(load more 时往后追加)
  const [pages, setPages] = useState<TenantEventStreamRow[][]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const jsonPathOk =
    draft.jsonPath === "" || isValidJsonKey(draft.jsonPath)
  const jsonReady =
    (draft.jsonPath === "" && draft.jsonValue === "") ||
    (jsonPathOk && draft.jsonValue !== "")

  const { data, isLoading, isError, error, refetch } = useTenantEventStream({
    from: w.from,
    to: w.to,
    filters: applied,
    beforeTs: cursor,
    limit: 100,
  })

  // 数据返回后追加到累积列表
  useEffect(() => {
    if (!data?.data) return
    setPages((prev) => {
      // 第一页 (cursor=undefined) 重置;后续页面追加
      if (cursor === undefined) return [data.data]
      // 同样 cursor 已经存在 -> 不重复追加 (React Query 重新触发)
      const last = prev[prev.length - 1]
      if (
        last &&
        last.length === data.data.length &&
        last[0]?.timestamp === data.data[0]?.timestamp
      ) {
        return prev
      }
      return [...prev, data.data]
    })
  }, [data, cursor])

  // 过滤或时间窗口变化 -> 清空累积、重置游标
  useEffect(() => {
    setPages([])
    setCursor(undefined)
  }, [windowOption, applied])

  const allRows = pages.flat()

  const handleApply = (e: FormEvent) => {
    e.preventDefault()
    if (draft.jsonPath !== "" && !isValidJsonKey(draft.jsonPath)) return
    setApplied(draft)
  }

  const handleClear = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
  }

  const handleLoadMore = () => {
    if (allRows.length === 0) return
    const last = allRows[allRows.length - 1]
    if (!last) return
    setCursor(last.timestamp)
  }

  // 行展开(per-row 状态用 Set 维护)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Trace drawer
  const [traceId, setTraceId] = useState<string | null>(null)

  // "用此字段过滤" / "在 Explore 分组"
  const handleFilterByJson = (path: string, value: string) => {
    setDraft((d) => ({ ...d, jsonPath: path, jsonValue: value }))
    setApplied((d) => ({ ...d, jsonPath: path, jsonValue: value }))
  }
  const handleOpenInExplore = (event: string, path: string) => {
    void navigate({
      to: "/o/$orgSlug/p/$projectSlug/analytics/explore",
      search: { event, groupBy: "json", jsonPathGroup: path } as never,
    })
  }

  return (
    <>
      <PageSection>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              <Filter className="mr-2 inline size-4 align-text-top" />
              {m.analytics_explore_filters_title()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleApply}
              className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_explore_bucket_label()}
                </label>
                <Select
                  value={windowOption}
                  onValueChange={(v) => setWindowOption(v as WindowOption)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7d</SelectItem>
                    <SelectItem value="30d">30d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_activity_filter_event()}
                </label>
                <EventNamePicker
                  listId="activity-event-names"
                  value={draft.event}
                  onChange={(v) => setDraft((d) => ({ ...d, event: v }))}
                  from={w.from}
                  to={w.to}
                  placeholder="task.completed"
                />
              </div>
              <FilterInput
                label={m.analytics_activity_filter_source()}
                value={draft.source}
                onChange={(v) => setDraft((d) => ({ ...d, source: v }))}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_activity_filter_outcome()}
                </label>
                <Select
                  value={draft.outcome === "" ? "__all__" : draft.outcome}
                  onValueChange={(v) => {
                    const next = !v || v === "__all__" ? "" : v
                    setDraft((d) => ({ ...d, outcome: next }))
                  }}
                >
                  <SelectTrigger size="sm" className="font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      {m.analytics_activity_outcome_all()}
                    </SelectItem>
                    {OUTCOME_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o} className="font-mono">
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FilterInput
                label={m.analytics_activity_filter_end_user_id()}
                value={draft.endUserId}
                onChange={(v) => setDraft((d) => ({ ...d, endUserId: v }))}
              />
              <FilterInput
                label={m.analytics_activity_filter_json_path()}
                value={draft.jsonPath}
                onChange={(v) => setDraft((d) => ({ ...d, jsonPath: v }))}
                placeholder="rarity"
                error={
                  draft.jsonPath !== "" && !jsonPathOk
                    ? m.analytics_explore_json_invalid()
                    : undefined
                }
              />
              <FilterInput
                label={m.analytics_activity_filter_json_value()}
                value={draft.jsonValue}
                onChange={(v) => setDraft((d) => ({ ...d, jsonValue: v }))}
                disabled={draft.jsonPath === ""}
              />
              <div className="col-span-full flex items-end gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!jsonReady || !jsonPathOk}
                >
                  {m.common_apply()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                >
                  {m.common_clear()}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPages([])
                    setCursor(undefined)
                    void refetch()
                  }}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageSection>

      <PageSection>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {m.analytics_activity_title()}
            </CardTitle>
            <CardDescription>{m.analytics_activity_subtitle()}</CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error?.message ?? m.analytics_logs_fetch_failed()}
              </div>
            ) : isLoading && allRows.length === 0 ? (
              <SkeletonBlock />
            ) : allRows.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {m.analytics_activity_empty()}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>{m.analytics_activity_col_time()}</TableHead>
                      <TableHead>{m.analytics_activity_col_event()}</TableHead>
                      <TableHead>{m.analytics_activity_col_source()}</TableHead>
                      <TableHead>{m.analytics_activity_col_outcome()}</TableHead>
                      <TableHead className="text-right">
                        {m.analytics_activity_col_amount()}
                      </TableHead>
                      <TableHead>{m.analytics_activity_col_user()}</TableHead>
                      <TableHead>{m.analytics_activity_col_trace()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((row, idx) => {
                      const key = `${row.timestamp}-${idx}`
                      const isOpen = expanded.has(key)
                      return (
                        <RowAndExpansion
                          key={key}
                          row={row}
                          rowKey={key}
                          isOpen={isOpen}
                          onToggle={() => toggleRow(key)}
                          onOpenTrace={() => setTraceId(row.trace_id)}
                          onFilterByJson={handleFilterByJson}
                          onOpenInExplore={handleOpenInExplore}
                        />
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="mt-4 flex justify-center">
              {data?.data && data.data.length === 100 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  <ChevronDown className="size-4" />
                  {m.analytics_activity_load_more()}
                </Button>
              ) : allRows.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {m.analytics_activity_no_more()}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </PageSection>

      <Sheet open={!!traceId} onOpenChange={(o) => !o && setTraceId(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{m.analytics_logs_trace_sheet_title()}</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {traceId}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {traceId ? <TraceBody traceId={traceId} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function RowAndExpansion({
  row,
  rowKey: _rowKey,
  isOpen,
  onToggle,
  onOpenTrace,
  onFilterByJson,
  onOpenInExplore,
}: {
  row: TenantEventStreamRow
  rowKey: string
  isOpen: boolean
  onToggle: () => void
  onOpenTrace: () => void
  onFilterByJson: (path: string, value: string) => void
  onOpenInExplore: (event: string, path: string) => void
}) {
  const outcomeColor =
    row.outcome === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : row.outcome === "error"
        ? "text-destructive"
        : "text-muted-foreground"

  let parsed: unknown = null
  try {
    parsed = row.event_data ? JSON.parse(row.event_data) : null
  } catch {
    parsed = row.event_data
  }

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {isOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-xs">
          {new Date(row.timestamp).toLocaleString()}
        </TableCell>
        <TableCell className="font-mono text-xs">{row.event}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.source}
        </TableCell>
        <TableCell className={`font-mono text-xs ${outcomeColor}`}>
          {row.outcome}
        </TableCell>
        <TableCell className="text-right font-mono text-xs tabular-nums">
          {row.amount ? Number(row.amount).toLocaleString() : "—"}
        </TableCell>
        <TableCell className="max-w-[140px] truncate font-mono text-xs">
          {row.end_user_id || "—"}
        </TableCell>
        <TableCell>
          {row.trace_id ? (
            <button
              type="button"
              className="font-mono text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                onOpenTrace()
              }}
            >
              {row.trace_id.slice(0, 8)}…
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {isOpen && parsed && typeof parsed === "object" ? (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30">
            <JsonExpansion
              event={row.event}
              data={parsed as Record<string, unknown>}
              onFilterByJson={onFilterByJson}
              onOpenInExplore={onOpenInExplore}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function JsonExpansion({
  event,
  data,
  onFilterByJson,
  onOpenInExplore,
}: {
  event: string
  data: Record<string, unknown>
  onFilterByJson: (path: string, value: string) => void
  onOpenInExplore: (event: string, path: string) => void
}) {
  const entries = Object.entries(data)
  return (
    <div className="space-y-2 px-4 py-3">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{"{}"}</p>
      ) : (
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, value]) => {
            const valueStr =
              typeof value === "string"
                ? value
                : JSON.stringify(value)
            const isLeaf =
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            const canFilter = isLeaf && isValidJsonKey(key)
            return (
              <Fragment key={key}>
                <code className="font-mono text-primary">{key}</code>
                <code className="break-all font-mono text-muted-foreground">
                  {valueStr}
                </code>
                {canFilter ? (
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => onFilterByJson(key, String(value))}
                    >
                      <Filter className="size-3" />
                      {m.analytics_activity_use_field_filter()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => onOpenInExplore(event, key)}
                    >
                      <ExternalLink className="size-3" />
                      {m.analytics_activity_open_in_explore()}
                    </Button>
                  </span>
                ) : (
                  <span />
                )}
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
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
  if (isLoading || !data) return <SkeletonBlock />
  if (data.data.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        <p className="font-medium">{m.analytics_logs_trace_empty_title()}</p>
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

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 font-mono text-xs"
      />
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  )
}

function SkeletonBlock({ tall }: { tall?: boolean }) {
  return (
    <div
      className={
        tall
          ? "flex h-80 w-full animate-pulse items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
          : "flex h-40 w-full animate-pulse items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
      }
    >
      …
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
  useEffect(() => setMounted(true), [])
  return <>{mounted ? children : fallback}</>
}
