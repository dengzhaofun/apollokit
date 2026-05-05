/**
 * 数据中心首页 —— 合并 Hub + 项目 360° 总览。运营进 sidebar 的
 * "Analytics" 就直接看到 KPI Strip + DAU + Top Activities + 加入漏斗。
 *
 * 数据源:
 *   - useAnalyticsProjectOverview: 后端聚合 (MAU + 活跃活动 Top 5 + 加入漏斗)
 *   - useTenantDauTimeseries: Tinybird HLL DAU 30d
 *   - useTenantRequestOverview: Tinybird 请求 / 错误 / P95 30d
 */

import { createFileRoute, Link } from "@tanstack/react-router"
import { LayoutDashboard } from "lucide-react"
import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { MauQuotaBar } from "#/components/analytics/MauQuotaBar"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"
import {
  PageBody,
  PageHeader,
  PageSection,
  PageShell,
  StatCard,
  StatGrid,
} from "#/components/patterns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { useAnalyticsProjectOverview } from "#/hooks/use-project-analytics"
import {
  useTenantDauTimeseries,
  useTenantRequestOverview,
} from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/analytics/",
)({
  component: AnalyticsHubPage,
})

function AnalyticsHubPage() {
  const dauChartConfig: ChartConfig = {
    dau: { label: m.analytics_chart_label_dau(), color: "#8b5cf6" },
  }
  const { orgSlug, projectSlug } = useTenantParams()
  const overview = useAnalyticsProjectOverview()

  const range30d = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [])

  const dau = useTenantDauTimeseries({
    from: range30d.from,
    to: range30d.to,
    bucketSeconds: 86_400,
  })
  const requests = useTenantRequestOverview({
    from: range30d.from,
    to: range30d.to,
    bucketSeconds: 86_400,
  })

  const totalRequests = requests.data?.data?.reduce((s, r) => s + r.requests, 0) ?? 0
  const totalErrors = requests.data?.data?.reduce((s, r) => s + r.errors, 0) ?? 0
  const errorRate = totalRequests ? totalErrors / totalRequests : 0
  const avgDau =
    dau.data?.data && dau.data.data.length > 0
      ? Math.round(
          dau.data.data.reduce((s, r) => s + r.dau, 0) / dau.data.data.length,
        )
      : null

  return (
    <PageShell>
      <PageHeader
        icon={<LayoutDashboard className="size-5" />}
        title={m.analytics_hub_title()}
        description={m.analytics_hub_subtitle()}
      />
      <PageBody>
        {overview.data && (
          <PageSection>
            <MauQuotaBar
              yearMonth={overview.data.currentMau.yearMonth}
              mau={overview.data.currentMau.mau}
              quota={overview.data.currentMau.quota}
            />
          </PageSection>
        )}

        <PageSection>
          <StatGrid columns={4}>
            <StatCard
              label={m.analytics_hub_kpi_active_activities()}
              value={(overview.data?.activeActivities ?? 0).toLocaleString()}
            />
            <StatCard
              label={m.analytics_hub_kpi_dau_avg()}
              value={avgDau == null ? "—" : avgDau.toLocaleString()}
            />
            <StatCard
              label={m.analytics_hub_kpi_requests_30d()}
              value={totalRequests.toLocaleString()}
            />
            <StatCard
              label={m.analytics_hub_kpi_error_rate()}
              value={
                totalRequests === 0 ? "—" : `${(errorRate * 100).toFixed(2)}%`
              }
            />
          </StatGrid>
        </PageSection>

        <PageSection>
          <h3 className="mb-3 text-sm font-semibold">
            {m.analytics_hub_chart_dau()}
          </h3>
          {!dau.data?.data || dau.data.data.length === 0 ? (
            <Empty />
          ) : (
            <ChartContainer
              config={dauChartConfig}
              className="aspect-auto h-[240px] w-full"
            >
              <LineChart
                data={dau.data.data.map((r) => ({
                  ...r,
                  bucket: r.bucket.slice(0, 10),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="dau"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </PageSection>

        <PageSection>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                {m.analytics_hub_top_activities()}
              </h3>
              {!overview.data || overview.data.topActivities.length === 0 ? (
                <Empty />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {m.analytics_activities_col_name()}
                      </TableHead>
                      <TableHead className="text-right">
                        {m.analytics_activities_col_participants()}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.data.topActivities.map((row) => (
                      <TableRow key={row.alias}>
                        <TableCell>
                          <Link
                            to="/o/$orgSlug/p/$projectSlug/activity/$alias"
                            params={{
                              orgSlug,
                              projectSlug,
                              alias: row.alias,
                            }}
                            className="hover:underline"
                          >
                            <div className="font-medium">{row.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.alias}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.participants.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                {m.analytics_hub_membership_funnel()}
              </h3>
              {!overview.data ? (
                <Empty />
              ) : (
                <FunnelBars
                  joined={overview.data.membershipFunnel.joined}
                  completed={overview.data.membershipFunnel.completed}
                  dropped={overview.data.membershipFunnel.dropped}
                />
              )}
            </div>
          </div>
        </PageSection>
      </PageBody>
    </PageShell>
  )
}

function FunnelBars({
  joined,
  completed,
  dropped,
}: {
  joined: number
  completed: number
  dropped: number
}) {
  const max = Math.max(joined, 1)
  const rows: Array<{ label: string; n: number; tone: string }> = [
    {
      label: m.analytics_hub_funnel_joined(),
      n: joined,
      tone: "bg-primary",
    },
    {
      label: m.analytics_hub_funnel_completed(),
      n: completed,
      tone: "bg-emerald-500",
    },
    {
      label: m.analytics_hub_funnel_dropped(),
      n: dropped,
      tone: "bg-destructive",
    },
  ]
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 text-muted-foreground">{r.label}</span>
          <div className="relative h-5 flex-1 rounded bg-muted">
            <div
              className={`absolute inset-y-0 left-0 rounded ${r.tone}`}
              style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono">
            {r.n.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-12 text-center text-sm text-muted-foreground">
      {m.activity_analytics_no_data()}
    </div>
  )
}
