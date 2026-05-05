/**
 * 项目用户分析 —— v1 正式落地（替换之前的 ComingSoon 占位）。
 *
 * 数据组合:
 *   - 当月 MAU + 配额: useAnalyticsUsersOverview (server: PG mau_active_player + billing)
 *   - MAU 12 月历史: useAnalyticsUsersOverview.history (server: PG mau_snapshot)
 *   - DAU 30d 趋势: useTenantDauTimeseries (Tinybird events_hourly_agg HLL uniqMerge)
 *   - 活跃天数桶: useTenantUserActiveDaysDistribution (Tinybird raw events 月内分桶)
 *   - 用户最活跃事件 Top 20: useTenantEventUserDistribution (Tinybird events_hourly_agg)
 *
 * MAU truth 走 PG (invoice grade); DAU / WAU 类近似指标走 Tinybird HLL。
 */

import { createFileRoute } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
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
import { useAnalyticsUsersOverview } from "#/hooks/use-project-analytics"
import {
  useTenantDauTimeseries,
  useTenantEventUserDistribution,
  useTenantUserActiveDaysDistribution,
} from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/analytics/users/",
)({
  component: UserAnalyticsPage,
})

function UserAnalyticsPage() {
  const dauChartConfig: ChartConfig = {
    dau: { label: m.analytics_chart_label_dau(), color: "#8b5cf6" },
  }
  const mauChartConfig: ChartConfig = {
    mau: { label: m.analytics_chart_label_mau(), color: "#8b5cf6" },
  }
  const activeDaysChartConfig: ChartConfig = {
    users: { label: m.analytics_chart_label_users(), color: "#3b82f6" },
  }
  const overview = useAnalyticsUsersOverview({ months: 12 })

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

  const currentYearMonth = overview.data?.current.yearMonth ?? ""
  const activeDays = useTenantUserActiveDaysDistribution({
    yearMonth: currentYearMonth,
    enabled: !!currentYearMonth,
  })

  const topEvents = useTenantEventUserDistribution({
    from: range30d.from,
    to: range30d.to,
    top: 20,
  })

  return (
    <PageShell>
      <PageHeader
        icon={<Users className="size-5" />}
        title={m.analytics_users_title()}
        description={m.analytics_users_subtitle()}
      />
      <PageBody>
        {overview.isPending ? (
          <PageSection>
            <div className="text-muted-foreground">{m.common_loading()}</div>
          </PageSection>
        ) : overview.error || !overview.data ? (
          <PageSection>
            <div className="text-destructive">
              {m.common_failed_to_load({
                resource: m.analytics_users_title(),
                error: overview.error?.message ?? "",
              })}
            </div>
          </PageSection>
        ) : (
          <>
            <PageSection>
              <MauQuotaBar
                yearMonth={overview.data.current.yearMonth}
                mau={overview.data.current.mau}
                quota={overview.data.current.quota}
                planName={overview.data.current.plan?.name ?? null}
              />
            </PageSection>

            <PageSection>
              <StatGrid columns={4}>
                <StatCard
                  label={m.analytics_users_kpi_current_mau()}
                  value={overview.data.current.mau.toLocaleString()}
                />
                <StatCard
                  label={m.analytics_users_kpi_overage()}
                  value={overview.data.current.overage.toLocaleString()}
                />
                <StatCard
                  label={m.analytics_users_kpi_dau_avg()}
                  value={
                    dau.data?.data && dau.data.data.length > 0
                      ? Math.round(
                          dau.data.data.reduce((s, r) => s + r.dau, 0) /
                            dau.data.data.length,
                        ).toLocaleString()
                      : "—"
                  }
                />
                <StatCard
                  label={m.analytics_users_kpi_top_events()}
                  value={(topEvents.data?.data?.length ?? 0).toLocaleString()}
                />
              </StatGrid>
            </PageSection>

            <PageSection>
              <SectionTitle title={m.analytics_users_chart_dau()} />
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
              <SectionTitle title={m.analytics_users_chart_mau_history()} />
              {overview.data.history.length === 0 ? (
                <Empty />
              ) : (
                <ChartContainer
                  config={mauChartConfig}
                  className="aspect-auto h-[240px] w-full"
                >
                  <BarChart data={overview.data.history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="mau" fill="#8b5cf6" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </PageSection>

            <PageSection>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <SectionTitle
                    title={m.analytics_users_chart_active_days()}
                  />
                  {!activeDays.data?.data ||
                  activeDays.data.data.length === 0 ? (
                    <Empty />
                  ) : (
                    <ChartContainer
                      config={activeDaysChartConfig}
                      className="aspect-auto h-[240px] w-full"
                    >
                      <BarChart
                        data={activeDays.data.data
                          .slice()
                          .sort((a, b) => a.sort_key - b.sort_key)}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="users" fill="#3b82f6" radius={4} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>
                <div>
                  <SectionTitle title={m.analytics_users_chart_top_events()} />
                  {!topEvents.data?.data ||
                  topEvents.data.data.length === 0 ? (
                    <Empty />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {m.analytics_users_col_event()}
                          </TableHead>
                          <TableHead className="text-right">
                            {m.analytics_users_col_users()}
                          </TableHead>
                          <TableHead className="text-right">
                            {m.analytics_users_col_count()}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topEvents.data.data.slice(0, 10).map((r) => (
                          <TableRow key={r.event}>
                            <TableCell className="font-mono text-xs">
                              {r.event}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {r.distinct_users.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {r.event_count.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </PageSection>
          </>
        )}
      </PageBody>
    </PageShell>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="mb-3 text-sm font-semibold">{title}</h3>
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-12 text-center text-sm text-muted-foreground">
      {m.activity_analytics_no_data()}
    </div>
  )
}
