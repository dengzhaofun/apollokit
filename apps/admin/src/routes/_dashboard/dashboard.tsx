import { createFileRoute } from "@tanstack/react-router"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Coins,
  Gauge,
  PartyPopper,
  Radio,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

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
import { authClient } from "#/lib/auth-client"
import {
  TENANT_PIPES,
  useTenantRequestOverview,
  useTinybirdToken,
} from "#/lib/tinybird"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: Dashboard,
})

/*
 * 数据大盘 — 第一个真实数据闭环版本。
 *
 * 当前接入的真实数据:
 *   - KPI「日均请求」「错误率」 → Tinybird `tenant_request_overview`(30 天聚合)
 *   - 「请求趋势图」 → 同上,按日分桶的 requests/errors/p95
 *
 * 仍占位的(二期接入):
 *   - DAU / WAU / MAU / 活跃占比:需要新 pipe `tenant_active_users_daily`
 *     (按 end_user_id 去重,按来源 externalId IS NULL 拆分)
 *   - 今日新增玩家:需要查 Neon `eu_user.createdAt`
 *   - 今日 GMV:需要查 shop 模块交易表
 *   - 模块健康网格:按各模块核心指标接入
 *
 * SSR 注意:recharts 在 SSR 会因 dual-package hazard 报 `Invalid hook call`;
 * 所有含 recharts / Tinybird hook 的节点都走 ClientOnly 包裹,SSR 渲染 skeleton。
 */

/** 稳定化请求时间窗:向上取整到小时,让同一个小时内 React Query key 稳定。 */
function useRequestWindow(days: number) {
  return useMemo(() => {
    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to)
    from.setDate(from.getDate() - days)
    return { from: from.toISOString(), to: to.toISOString(), days }
  }, [days])
}

const REQUEST_CHART_CONFIG: ChartConfig = {
  requests: {
    label: "请求数",
    color: "oklch(0.7 0.18 250)",
  },
  errors: {
    label: "错误数",
    color: "oklch(0.6 0.22 25)",
  },
}

interface KpiSpec {
  key: string
  label: string
  icon: LucideIcon
}

const PLACEHOLDER_KPIS: KpiSpec[] = [
  { key: "dau", label: "", icon: Users },
  { key: "wau", label: "", icon: Users },
  { key: "mau", label: "", icon: Users },
  { key: "newUsers", label: "", icon: UserPlus },
  { key: "activeRatio", label: "", icon: TrendingUp },
  { key: "gmv", label: "", icon: Coins },
]

interface ModuleHealthCard {
  name: string
  metric: string
  metricLabel: string
}

const MODULE_HEALTH: ModuleHealthCard[] = [
  { name: "Battle-Pass 纪行", metric: "—", metricLabel: "本期参与率" },
  { name: "签到", metric: "—", metricLabel: "连签 ≥7 天" },
  { name: "活动容器", metric: "—", metricLabel: "进行中 / 完成率" },
  { name: "商城", metric: "—", metricLabel: "今日 GMV" },
  { name: "任务", metric: "—", metricLabel: "日完成率" },
]

function Dashboard() {
  const { data: session } = authClient.useSession()

  const kpiLabels: Record<string, string> = {
    dau: m.dashboard_kpi_dau(),
    wau: m.dashboard_kpi_wau(),
    mau: m.dashboard_kpi_mau(),
    newUsers: m.dashboard_kpi_new_users(),
    activeRatio: m.dashboard_kpi_active_ratio(),
    requests: m.dashboard_kpi_requests(),
    errorRate: m.dashboard_kpi_error_rate(),
    gmv: m.dashboard_kpi_gmv(),
  }

  return (
    <main className="flex-1 space-y-6 p-6">
      {/* 页面标题 */}
      <section>
        <h2 className="text-2xl font-bold tracking-tight">
          {m.dashboard_overview_title()}
          {session?.user.name ? (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              · {session.user.name}
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          {m.dashboard_overview_subtitle()}
        </p>
      </section>

      {/* KPI 卡片网格 —— 6 张 placeholder + 2 张真实(请求域,ClientOnly) */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDER_KPIS.map((kpi) => (
          <PlaceholderKpiCard
            key={kpi.key}
            label={kpiLabels[kpi.key]}
            icon={kpi.icon}
          />
        ))}
        <ClientOnly
          fallback={
            <PlaceholderKpiCard
              label={kpiLabels.requests}
              icon={Gauge}
              note={m.dashboard_placeholder_connecting()}
            />
          }
        >
          <RequestsKpiCard label={kpiLabels.requests} />
        </ClientOnly>
        <ClientOnly
          fallback={
            <PlaceholderKpiCard
              label={kpiLabels.errorRate}
              icon={AlertTriangle}
              note={m.dashboard_placeholder_connecting()}
            />
          }
        >
          <ErrorRateKpiCard label={kpiLabels.errorRate} />
        </ClientOnly>
      </section>

      {/* 请求趋势图 —— 30 天,日桶,real data */}
      <Card>
        <CardHeader>
          <CardTitle>{m.dashboard_requests_trend_title()}</CardTitle>
          <CardDescription>
            {m.dashboard_requests_trend_subtitle()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientOnly
            fallback={
              <div
                className="aspect-[4/1] w-full min-h-[240px] animate-pulse rounded-md bg-muted/40"
                aria-label="Loading chart"
              />
            }
          >
            <RequestsTrendChart />
          </ClientOnly>
        </CardContent>
      </Card>

      {/* Tinybird 连接状态 */}
      <TinybirdStatusCard />

      {/* 模块健康 —— 仍是 placeholder */}
      <section>
        <div className="mb-3">
          <h3 className="text-lg font-semibold">
            {m.dashboard_module_health_title()}
          </h3>
          <p className="text-sm text-muted-foreground">
            {m.dashboard_module_health_subtitle()}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MODULE_HEALTH.map((mod) => (
            <Card key={mod.name} size="sm" className="border-dashed">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <ModuleIcon name={mod.name} />
                  {mod.name}
                </CardDescription>
                <CardTitle className="text-xl tabular-nums text-muted-foreground">
                  {mod.metric}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  {mod.metricLabel}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}

// ============================================================================
// 真实 KPI 卡 & 图表 —— 都依赖 useTenantRequestOverview,React Query 自动 dedupe
// 同一(from, to, bucketSeconds)key 的请求。
// ============================================================================

function RequestsKpiCard({ label }: { label: string }) {
  const window = useRequestWindow(30)
  const { data, isLoading, isError } = useTenantRequestOverview({
    from: window.from,
    to: window.to,
    bucketSeconds: 86_400,
  })

  const totalRequests =
    data?.data.reduce((sum, row) => sum + Number(row.requests || 0), 0) ?? null
  const avgPerDay =
    totalRequests != null
      ? Math.round(totalRequests / window.days).toLocaleString()
      : isLoading
        ? "…"
        : "—"

  return (
    <Card size="sm" className={cn("border-dashed", isError && "border-destructive/30")}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Gauge className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {avgPerDay}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">
          {isError
            ? m.dashboard_tinybird_status_error()
            : m.dashboard_kpi_requests_window_note()}
        </p>
      </CardContent>
    </Card>
  )
}

function ErrorRateKpiCard({ label }: { label: string }) {
  const window = useRequestWindow(30)
  const { data, isLoading, isError } = useTenantRequestOverview({
    from: window.from,
    to: window.to,
    bucketSeconds: 86_400,
  })

  const totalRequests =
    data?.data.reduce((sum, row) => sum + Number(row.requests || 0), 0) ?? 0
  const totalErrors =
    data?.data.reduce((sum, row) => sum + Number(row.errors || 0), 0) ?? 0
  const pct =
    data && totalRequests > 0
      ? ((totalErrors / totalRequests) * 100).toFixed(2) + "%"
      : data && totalRequests === 0
        ? "0.00%"
        : isLoading
          ? "…"
          : "—"

  const colorClass =
    data && totalRequests > 0 && totalErrors / totalRequests > 0.05
      ? "text-destructive"
      : undefined

  return (
    <Card size="sm" className={cn("border-dashed", isError && "border-destructive/30")}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className={cn("text-2xl font-semibold tabular-nums", colorClass)}>
          {pct}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">
          {isError
            ? m.dashboard_tinybird_status_error()
            : m.dashboard_kpi_error_rate_note()}
        </p>
      </CardContent>
    </Card>
  )
}

function RequestsTrendChart() {
  const window = useRequestWindow(30)
  const { data, isLoading, isError, error } = useTenantRequestOverview({
    from: window.from,
    to: window.to,
    bucketSeconds: 86_400,
  })

  if (isError) {
    return (
      <div className="flex aspect-[4/1] min-h-[240px] w-full items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        {error?.message ?? m.dashboard_tinybird_status_error()}
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div
        className="aspect-[4/1] min-h-[240px] w-full animate-pulse rounded-md bg-muted/40"
        aria-label="Loading chart"
      />
    )
  }

  // 空数据 — Tinybird datasource 还没有任何 http_requests 行时走这里
  if (data.data.length === 0) {
    return (
      <div className="flex aspect-[4/1] min-h-[240px] w-full flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        <p className="font-medium">{m.dashboard_requests_empty_title()}</p>
        <p className="mt-1 text-xs">
          {m.dashboard_requests_empty_subtitle()}
        </p>
      </div>
    )
  }

  // 标准化 bucket 为可读日期;数值强制成 number(Tinybird 返回字符串时兜底)
  const chartData = data.data.map((row) => ({
    bucket: new Date(row.bucket).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    requests: Number(row.requests || 0),
    errors: Number(row.errors || 0),
  }))

  return (
    <ChartContainer
      config={REQUEST_CHART_CONFIG}
      className="aspect-[4/1] w-full min-h-[240px]"
    >
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Line
          dataKey="requests"
          type="monotone"
          stroke="var(--color-requests)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="errors"
          type="monotone"
          stroke="var(--color-errors)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  )
}

// ============================================================================
// 小组件:占位 KPI 卡 + module icon + ClientOnly gate + TinybirdStatusCard
// ============================================================================

function PlaceholderKpiCard({
  label,
  icon: Icon,
  note,
}: {
  label: string
  icon: LucideIcon
  note?: string
}) {
  return (
    <Card size="sm" className="border-dashed">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums text-muted-foreground">
          —
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">
          {note ?? m.dashboard_placeholder_connecting()}
        </p>
      </CardContent>
    </Card>
  )
}

function ModuleIcon({ name }: { name: string }) {
  if (name.includes("商城")) return <ShoppingCart className="size-3.5" />
  if (name.includes("活动")) return <PartyPopper className="size-3.5" />
  if (name.includes("签到")) return <Activity className="size-3.5" />
  return <Gauge className="size-3.5" />
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

/**
 * Tinybird 连接状态卡 —— 验证 token 签发链路是否连通。
 *
 * 三态:loading / ok(含 pipe 白名单 + 过期时间) / error(secrets 未配)。
 * 接上真实 pipe 后,如果此卡 🟢 但上面 KPI 没数据,说明 pipe 没有数据而非
 * 签发失败,语义清晰。
 */
function TinybirdStatusCard() {
  return (
    <ClientOnly
      fallback={
        <Card size="sm" className="border-dashed">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Radio className="size-3.5" />
              {m.dashboard_tinybird_status_title()}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            —
          </CardContent>
        </Card>
      }
    >
      <TinybirdStatusCardInner />
    </ClientOnly>
  )
}

function TinybirdStatusCardInner() {
  const { data, isLoading, isError, error } = useTinybirdToken(TENANT_PIPES)

  let Icon: LucideIcon = CircleDashed
  let iconClass = "text-muted-foreground animate-pulse"
  let statusLabel = m.dashboard_tinybird_status_loading()
  let detail: ReactNode = null

  if (!isLoading && !isError && data) {
    Icon = CheckCircle2
    iconClass = "text-emerald-500"
    statusLabel = m.dashboard_tinybird_status_ok()
    detail = (
      <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="font-medium text-foreground/80">
            {m.dashboard_tinybird_status_pipes()}
          </dt>
          <dd className="font-mono">{data.pipes.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground/80">
            {m.dashboard_tinybird_status_expires()}
          </dt>
          <dd className="font-mono">
            {new Date(data.expiresAt).toLocaleString()}
          </dd>
        </div>
      </dl>
    )
  } else if (isError) {
    Icon = XCircle
    iconClass = "text-destructive"
    statusLabel = m.dashboard_tinybird_status_error()
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : ""
    detail = message ? (
      <p className="mt-2 font-mono text-xs text-muted-foreground">{message}</p>
    ) : null
  }

  return (
    <Card size="sm" className="border-dashed">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Radio className="size-3.5" />
          {m.dashboard_tinybird_status_title()}
        </CardDescription>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Icon className={cn("size-4", iconClass)} />
          {statusLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{detail}</CardContent>
    </Card>
  )
}
