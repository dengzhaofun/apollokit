import { createFileRoute } from "@tanstack/react-router"
import {
  ActivityIcon,
  AlertTriangle,
  BarChart3Icon,
  Beaker,
  CalendarRangeIcon,
  CheckCircle2,
  CircleDashed,
  Coins,
  DownloadIcon,
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

import { Button } from "#/components/ui/button"
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
import {
  ErrorState,
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
  StatCard,
  StatGrid,
} from "#/components/patterns"
import { useExperimentStats } from "#/hooks/use-experiment"
import {
  TENANT_PIPES,
  useTenantRequestOverview,
  useTinybirdToken,
} from "#/lib/tinybird"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

/**
 * 临时 i18n 兜底 —— Phase 3 引入了几个 paraglide 没有的新文案。
 * 后续 i18n team 把这些挪进 paraglide messages,这里就能删。
 */
const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/dashboard")({
  component: Dashboard,
})

/*
 * 数据大盘 —— Phase 3.1 重构版。
 *
 * 改动:
 *   - 统一用 PageShell + PageHeader(brand-soft icon 徽章 + 时间范围 + Export)
 *   - KPI 全部用 StatCard,delta / sparkline / loading / error 四态走 pattern
 *   - 模块健康也走 StatCard,告别 dashed border + 单 dash 数字的"未上线感"
 *   - "Dashboard · Probe User" 那个奇怪的"标题拼用户名"模式去掉,标题归标题
 *   - Request trend 已在 Phase 1 修过 ErrorState 包装,沿用
 *
 * 当前接入的真实数据:
 *   - KPI「日均请求」「错误率」 → Tinybird `tenant_request_overview`(30 天聚合)
 *   - 「请求趋势图」 → 同上,按日分桶的 requests/errors
 *
 * 仍占位的(二期接入):
 *   - DAU / WAU / MAU / 活跃占比:需要新 pipe `tenant_active_users_daily`
 *   - 今日新增玩家:需要查 Neon `eu_user.createdAt`
 *   - 今日 GMV:需要查 shop 模块交易表
 *
 * SSR 注意:recharts + Tinybird hook 都走 ClientOnly,SSR 渲染 skeleton。
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
    color: "var(--brand)",
  },
  errors: {
    label: "错误数",
    color: "var(--destructive)",
  },
}

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
  { name: "A/B 实验", metric: "—", metricLabel: "运行中" },
]

function Dashboard() {
  return (
    <PageShell>
      <PageHeader
        icon={<BarChart3Icon className="size-5" />}
        title={m.dashboard_overview_title()}
        description={m.dashboard_overview_subtitle()}
        actions={
          <>
            <Button variant="outline" size="sm">
              <CalendarRangeIcon />
              {t("最近 30 天", "Last 30 days")}
            </Button>
            <Button variant="outline" size="sm">
              <DownloadIcon />
              {t("导出", "Export")}
            </Button>
          </>
        }
      />

      <PageBody>
        {/* KPI 卡片网格 —— 6 张 placeholder + 2 张真实(请求域,ClientOnly) */}
        <PageSection>
          <StatGrid columns={4}>
            <PlaceholderStat label={m.dashboard_kpi_dau()} icon={Users} />
            <PlaceholderStat label={m.dashboard_kpi_wau()} icon={Users} />
            <PlaceholderStat label={m.dashboard_kpi_mau()} icon={Users} />
            <PlaceholderStat label={m.dashboard_kpi_new_users()} icon={UserPlus} />
            <PlaceholderStat
              label={m.dashboard_kpi_active_ratio()}
              icon={TrendingUp}
            />
            <PlaceholderStat label={m.dashboard_kpi_gmv()} icon={Coins} />
            <ClientOnly
              fallback={
                <PlaceholderStat label={m.dashboard_kpi_requests()} icon={Gauge} />
              }
            >
              <RequestsKpiCard label={m.dashboard_kpi_requests()} />
            </ClientOnly>
            <ClientOnly
              fallback={
                <PlaceholderStat
                  label={m.dashboard_kpi_error_rate()}
                  icon={AlertTriangle}
                />
              }
            >
              <ErrorRateKpiCard label={m.dashboard_kpi_error_rate()} />
            </ClientOnly>
          </StatGrid>
        </PageSection>

        {/* 请求趋势图 —— 30 天,日桶,real data */}
        <PageSection>
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
                    aria-label={m.aria_loading_chart()}
                  />
                }
              >
                <RequestsTrendChart />
              </ClientOnly>
            </CardContent>
          </Card>
        </PageSection>

        {/* Tinybird 连接状态 */}
        <TinybirdStatusCard />

        {/* 模块健康 —— A/B 实验卡已接入真实数据;其余仍是 placeholder */}
        <PageSection
          title={m.dashboard_module_health_title()}
          description={m.dashboard_module_health_subtitle()}
        >
          <StatGrid columns={3}>
            {MODULE_HEALTH.map((mod) =>
              mod.name === "A/B 实验" ? (
                <ClientOnly
                  key={mod.name}
                  fallback={
                    <StatCard
                      icon={Beaker}
                      label={mod.name}
                      value="—"
                      error
                    />
                  }
                >
                  <ExperimentHealthCard />
                </ClientOnly>
              ) : (
                <StatCard
                  key={mod.name}
                  icon={getModuleIcon(mod.name)}
                  label={mod.name}
                  value={mod.metric}
                  error
                />
              ),
            )}
          </StatGrid>
          <p className="mt-2 text-xs text-muted-foreground">
            {mod_health_footnote()}
          </p>
        </PageSection>
      </PageBody>
    </PageShell>
  )
}

/**
 * 还没接数据的占位指标 —— 用 StatCard 的 error 态(dashed border + dash 数字)。
 * 比之前手写的 PlaceholderKpiCard 视觉一致。
 *
 * 不在 hint slot 塞长描述("Placeholder — auto-filled..."):
 *   1. hint 是右上角小角标,塞长文会挤到 label 让 uppercase letter 竖排(移动端尤甚)
 *   2. dashed border + "—" value 已经清晰传达"未接入"语义,文字重复无收益
 *   3. 真正想给开发者看的接入状态在下方 TinybirdStatusCard
 */
function PlaceholderStat({
  label,
  icon,
}: {
  label: string
  icon: LucideIcon
}) {
  return <StatCard label={label} value="—" icon={icon} error />
}

function mod_health_footnote() {
  return "* 各模块指标接入中 · 接通后这里会自动填上日均完成率 / GMV / 参与率等数字"
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
      : "—"

  // sparkline 用最近 30 天的 daily requests trace
  const trend = data?.data.map((r) => Number(r.requests || 0)) ?? []

  return (
    <StatCard
      label={label}
      value={avgPerDay}
      icon={Gauge}
      loading={isLoading}
      error={isError}
      trend={trend.length > 1 ? trend : undefined}
      trendColor="var(--brand)"
    />
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
        : "—"

  // sparkline 用 daily error rate (errors/requests)
  const trend =
    data?.data
      .map((r) =>
        Number(r.requests || 0) > 0
          ? (Number(r.errors || 0) / Number(r.requests || 0)) * 100
          : 0
      )
      ?? []

  return (
    <StatCard
      label={label}
      value={pct}
      icon={AlertTriangle}
      loading={isLoading}
      error={isError}
      trend={trend.length > 1 ? trend : undefined}
      trendColor="var(--destructive)"
    />
  )
}

function RequestsTrendChart() {
  const window = useRequestWindow(30)
  const { data, isLoading, isError, error, refetch } = useTenantRequestOverview({
    from: window.from,
    to: window.to,
    bucketSeconds: 86_400,
  })

  if (isError) {
    if (typeof window !== "undefined") {
      console.warn("[dashboard] tenant_request_overview failed:", error)
    }
    return (
      <ErrorState
        title={m.dashboard_tinybird_status_error()}
        description={t(
          "请到 Settings → API Keys 检查 Tinybird 连接,或确认服务端 TINYBIRD_TOKEN 已配置",
          "Check Settings → API Keys for Tinybird connection, or confirm the server-side TINYBIRD_TOKEN is set."
        )}
        onRetry={() => refetch()}
        retryLabel={t("重试", "Retry")}
        error={error instanceof Error ? error : null}
        className="aspect-[4/1] min-h-[240px]"
      />
    )
  }

  if (isLoading || !data) {
    return (
      <div
        className="aspect-[4/1] min-h-[240px] w-full animate-pulse rounded-md bg-muted/40"
        aria-label={m.aria_loading_chart()}
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
// 小组件:module icon + ClientOnly gate + TinybirdStatusCard
// ============================================================================

function getModuleIcon(name: string): LucideIcon {
  if (name.includes("商城")) return ShoppingCart
  if (name.includes("活动")) return PartyPopper
  if (name.includes("签到")) return ActivityIcon
  if (name.includes("Battle-Pass") || name.includes("战令")) return TrendingUp
  return Gauge
}

function ExperimentHealthCard() {
  const { data, isLoading, isError } = useExperimentStats()
  return (
    <StatCard
      icon={Beaker}
      label="A/B 实验"
      value={isLoading || isError ? "—" : String(data?.running ?? 0)}
      hint={t("运行中", "Running")}
      loading={isLoading}
      error={isError}
    />
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
        <Card size="sm">
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
    iconClass = "text-success"
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
    // 不再把原始 error.message 直接 dump,折叠到 details
    detail = message ? (
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          {t("技术细节", "Technical details")}
        </summary>
        <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {message}
        </pre>
      </details>
    ) : null
  }

  return (
    <Card size="sm">
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
