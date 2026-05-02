/**
 * 自定义事件分析页 —— 选事件 × 时间范围 × 分组维度 × 过滤,出趋势图 + 明细表。
 *
 * 数据全部走 Tinybird:
 *   - 事件名 combobox: useTenantEventNames (DISTINCT event from events)
 *   - 趋势 + 分组聚合: useTenantEventTimeseries (单 pipe + templating)
 *
 * 分组维度限定在顶层固定列(source/outcome/event/end_user_id) + 单层 JSON path,
 * pipe 内是 if/elif 白名单,前端不可绕过。
 */

import { createFileRoute } from "@tanstack/react-router"
import {
  AlertCircle,
  CalendarRange,
  Coins,
  LineChart as LineChartIcon,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { z } from "zod"

import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
  StatCard,
  StatGrid,
} from "#/components/patterns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
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
  useTenantEventTimeseries,
  type EventTimeseriesGroupBy,
  type TenantEventTimeseriesRow,
} from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

const exploreSearchSchema = z
  .object({
    event: z.string().optional(),
    groupBy: z
      .enum(["none", "source", "outcome", "event", "end_user_id", "json"])
      .optional(),
    jsonPathGroup: z.string().optional(),
  })
  .passthrough()

export const Route = createFileRoute("/_dashboard/analytics/explore/")({
  validateSearch: exploreSearchSchema,
  component: ExplorePage,
})

type WindowOption = "24h" | "7d" | "30d" | "90d"
const WINDOW_DAYS: Record<WindowOption, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

function useWindow(option: WindowOption) {
  return useMemo(() => {
    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to.getTime() - WINDOW_DAYS[option] * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [option])
}

type BucketSize = "minute" | "hour" | "day"
const BUCKET_SECONDS: Record<BucketSize, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
}

const TOP_N = 20

function ExplorePage() {
  return (
    <PageShell>
      <PageHeader
        icon={<LineChartIcon className="size-5" />}
        title={m.analytics_explore_title()}
        description={m.analytics_explore_subtitle()}
      />
      <PageBody>
        <ClientOnly fallback={<SkeletonBlock tall />}>
          <ExploreInner />
        </ClientOnly>
      </PageBody>
    </PageShell>
  )
}

function ExploreInner() {
  const initial = Route.useSearch()
  const [windowOption, setWindowOption] = useState<WindowOption>("7d")
  const w = useWindow(windowOption)
  const [bucket, setBucket] = useState<BucketSize>("hour")
  const [event, setEvent] = useState(initial.event ?? "")
  const [groupBy, setGroupBy] = useState<EventTimeseriesGroupBy>(
    initial.groupBy ?? "none",
  )
  const [jsonPathGroup, setJsonPathGroup] = useState(
    initial.jsonPathGroup ?? "",
  )
  const [filters, setFilters] = useState({
    source: "",
    outcome: "",
    endUserId: "",
    jsonPath: "",
    jsonValue: "",
  })

  // 当 windowOption='90d' 且使用了 JSON 字段,提示窗口过长(hook 内部也会自动 disable)
  const usesJson =
    groupBy === "json" || filters.jsonPath !== ""
  const windowTooLong = usesJson && WINDOW_DAYS[windowOption] > 30

  const jsonPathFilterValid =
    filters.jsonPath === "" || isValidJsonKey(filters.jsonPath)

  // 1) 主查询
  const timeseriesQuery = useTenantEventTimeseries({
    event,
    from: w.from,
    to: w.to,
    bucketSeconds: BUCKET_SECONDS[bucket],
    groupBy,
    jsonPathGroup,
    filters,
  })

  // `rows` 用 useMemo 包裹保持引用稳定 —— 否则下游 useMemo 的依赖每次 render 都新建数组
  const rows = useMemo(
    () => timeseriesQuery.data?.data ?? [],
    [timeseriesQuery.data],
  )

  // 衍生 KPI
  const kpis = useMemo(() => {
    let totalEvents = 0
    let totalAmount = 0
    for (const row of rows) {
      totalEvents += Number(row.c || 0)
      totalAmount += Number(row.total_amount || 0)
    }
    // uniq_users 字段 ClickHouse 给出每 bucket 内的唯一,不是全局唯一;
    // 想真正的全局唯一要新增 pipe,这里 KPI 用 max(uniq_users) 当近似
    const peakUsers = rows.reduce(
      (acc, row) => Math.max(acc, Number(row.uniq_users || 0)),
      0,
    )
    return { totalEvents, totalAmount, peakUsers }
  }, [rows])

  // 准备图表数据 —— bucket × dim 透视
  const chartShape = useMemo(() => buildChartData(rows, groupBy), [rows, groupBy])

  return (
    <>
      <PageSection>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {m.analytics_explore_filters_title()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {/* 事件名 */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_explore_event_label()}
                </label>
                <EventNamePicker
                  listId="explore-event-names"
                  value={event}
                  onChange={setEvent}
                  from={w.from}
                  to={w.to}
                />
              </div>
              {/* 时间窗口 */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  <CalendarRange className="mr-1 inline size-3 align-text-top" />
                  {windowOption}
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
                    <SelectItem value="90d">90d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Bucket */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_explore_bucket_label()}
                </label>
                <Select
                  value={bucket}
                  onValueChange={(v) => setBucket(v as BucketSize)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minute">
                      {m.analytics_explore_bucket_minute()}
                    </SelectItem>
                    <SelectItem value="hour">
                      {m.analytics_explore_bucket_hour()}
                    </SelectItem>
                    <SelectItem value="day">
                      {m.analytics_explore_bucket_day()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* GroupBy */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {m.analytics_explore_groupby_label()}
                </label>
                <Select
                  value={groupBy}
                  onValueChange={(v) => setGroupBy(v as EventTimeseriesGroupBy)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {m.analytics_explore_groupby_none()}
                    </SelectItem>
                    <SelectItem value="source">
                      {m.analytics_explore_groupby_source()}
                    </SelectItem>
                    <SelectItem value="outcome">
                      {m.analytics_explore_groupby_outcome()}
                    </SelectItem>
                    <SelectItem value="event">
                      {m.analytics_explore_groupby_event()}
                    </SelectItem>
                    <SelectItem value="end_user_id">
                      {m.analytics_explore_groupby_end_user_id()}
                    </SelectItem>
                    <SelectItem value="json">
                      {m.analytics_explore_groupby_json()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* JSON 字段区(groupBy='json' 或想加 JSON filter 时用) */}
            <div className="grid grid-cols-1 gap-3 rounded-md border border-dashed bg-muted/30 p-3 md:grid-cols-3">
              <div className="md:col-span-3">
                <p className="text-xs font-medium">
                  {m.analytics_explore_json_section_title()}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {m.analytics_explore_json_section_hint()}
                </p>
              </div>
              {groupBy === "json" ? (
                <FilterInput
                  label={m.analytics_explore_json_path_group_label()}
                  value={jsonPathGroup}
                  onChange={setJsonPathGroup}
                  placeholder="rarity"
                  error={
                    jsonPathGroup !== "" && !isValidJsonKey(jsonPathGroup)
                      ? m.analytics_explore_json_invalid()
                      : undefined
                  }
                />
              ) : null}
              <FilterInput
                label={m.analytics_explore_json_path_filter_label()}
                value={filters.jsonPath}
                onChange={(v) => setFilters((f) => ({ ...f, jsonPath: v }))}
                placeholder="rarity"
                error={
                  filters.jsonPath !== "" && !jsonPathFilterValid
                    ? m.analytics_explore_json_invalid()
                    : undefined
                }
              />
              <FilterInput
                label={m.analytics_explore_json_value_filter_label()}
                value={filters.jsonValue}
                onChange={(v) => setFilters((f) => ({ ...f, jsonValue: v }))}
                disabled={filters.jsonPath === ""}
              />
            </div>

            {/* 顶层过滤 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FilterInput
                label={m.analytics_explore_filter_source()}
                value={filters.source}
                onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
              />
              <FilterInput
                label={m.analytics_explore_filter_outcome()}
                value={filters.outcome}
                onChange={(v) => setFilters((f) => ({ ...f, outcome: v }))}
                placeholder="ok | error | denied"
              />
              <FilterInput
                label={m.analytics_explore_filter_end_user_id()}
                value={filters.endUserId}
                onChange={(v) => setFilters((f) => ({ ...f, endUserId: v }))}
              />
            </div>

            {windowTooLong ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {m.analytics_explore_window_too_long()}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </PageSection>

      {/* KPI */}
      {event ? (
        <PageSection>
          <StatGrid columns={3}>
            <StatCard
              icon={TrendingUp}
              label={m.analytics_explore_kpi_total_events()}
              value={
                timeseriesQuery.isLoading
                  ? "…"
                  : kpis.totalEvents.toLocaleString()
              }
              loading={timeseriesQuery.isLoading}
              error={timeseriesQuery.isError}
            />
            <StatCard
              icon={Users}
              label={m.analytics_explore_kpi_uniq_users()}
              value={
                timeseriesQuery.isLoading
                  ? "…"
                  : kpis.peakUsers.toLocaleString()
              }
              loading={timeseriesQuery.isLoading}
              error={timeseriesQuery.isError}
            />
            <StatCard
              icon={Coins}
              label={m.analytics_explore_kpi_total_amount()}
              value={
                timeseriesQuery.isLoading
                  ? "…"
                  : kpis.totalAmount.toLocaleString()
              }
              loading={timeseriesQuery.isLoading}
              error={timeseriesQuery.isError}
            />
          </StatGrid>
        </PageSection>
      ) : null}

      {/* 趋势图 */}
      <PageSection>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {m.analytics_explore_chart_title()}
            </CardTitle>
            {chartShape.truncated ? (
              <CardDescription className="text-[11px] text-muted-foreground">
                {m.analytics_explore_table_top_n_hint({ n: TOP_N })}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {!event ? (
              <div className="flex h-60 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {m.analytics_explore_event_placeholder()}
              </div>
            ) : timeseriesQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {timeseriesQuery.error?.message ??
                  m.analytics_logs_fetch_failed()}
              </div>
            ) : timeseriesQuery.isLoading ? (
              <SkeletonBlock />
            ) : chartShape.points.length === 0 ? (
              <div className="flex h-60 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {m.analytics_explore_chart_empty()}
              </div>
            ) : (
              <ChartContainer
                config={chartShape.config}
                className="aspect-[4/1] min-h-[260px] w-full"
              >
                <LineChart data={chartShape.points}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {chartShape.dims.map((dim) => (
                    <Line
                      key={dim}
                      dataKey={dim}
                      type="monotone"
                      strokeWidth={2}
                      stroke={`var(--color-${cssKey(dim)})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </PageSection>

      {/* 明细表 */}
      {event && rows.length > 0 ? (
        <PageSection>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {m.analytics_explore_chart_title()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>bucket</TableHead>
                      {groupBy !== "none" ? (
                        <TableHead>{groupBy}</TableHead>
                      ) : null}
                      <TableHead className="text-right">count</TableHead>
                      <TableHead className="text-right">amount</TableHead>
                      <TableHead className="text-right">uniq_users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={`${row.bucket}-${row.dim}-${idx}`}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {new Date(row.bucket).toLocaleString()}
                        </TableCell>
                        {groupBy !== "none" ? (
                          <TableCell className="font-mono text-xs">
                            {row.dim || "—"}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {Number(row.c).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {Number(row.total_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {Number(row.uniq_users).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </PageSection>
      ) : null}
    </>
  )
}

// ============================================================================
// Chart shaping —— 把 long-format rows 透视成 wide-format(每个 bucket 一行,
// 每个 dim 一列),并在高基数维度时取 Top N。
// ============================================================================

interface ChartShape {
  points: Array<Record<string, string | number>>
  dims: string[]
  config: ChartConfig
  truncated: boolean
}

const CHART_COLORS = [
  "var(--brand)",
  "var(--destructive)",
  "var(--success)",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#3b82f6",
]

function buildChartData(
  rows: TenantEventTimeseriesRow[],
  groupBy: EventTimeseriesGroupBy,
): ChartShape {
  if (rows.length === 0) {
    return { points: [], dims: [], config: {}, truncated: false }
  }

  // 1) 按 dim 总和 -> Top N
  const dimTotals = new Map<string, number>()
  for (const row of rows) {
    const key = groupBy === "none" ? "events" : row.dim || "—"
    dimTotals.set(key, (dimTotals.get(key) ?? 0) + Number(row.c || 0))
  }
  const sortedDims = [...dimTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
  const truncated = sortedDims.length > TOP_N
  const dims = sortedDims.slice(0, TOP_N)
  const dimSet = new Set(dims)

  // 2) 透视
  const bucketMap = new Map<string, Record<string, string | number>>()
  for (const row of rows) {
    const bucketLabel = formatBucket(row.bucket)
    const key = groupBy === "none" ? "events" : row.dim || "—"
    if (!dimSet.has(key)) continue
    let entry = bucketMap.get(bucketLabel)
    if (!entry) {
      entry = { bucket: bucketLabel }
      bucketMap.set(bucketLabel, entry)
    }
    entry[key] = Number(entry[key] ?? 0) + Number(row.c || 0)
  }
  const points = [...bucketMap.values()]

  // 3) 配色
  const config: ChartConfig = {}
  dims.forEach((dim, i) => {
    config[cssKey(dim)] = {
      label: dim,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  return { points, dims, config, truncated }
}

function formatBucket(bucket: string): string {
  const d = new Date(bucket)
  if (Number.isNaN(d.getTime())) return bucket
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** 把任意字符串转成可作 CSS variable 名的 key —— 喂给 ChartContainer 的 config map。 */
function cssKey(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_") || "_"
}

// ============================================================================
// Subcomponents
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
          : "flex h-60 w-full animate-pulse items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground"
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
