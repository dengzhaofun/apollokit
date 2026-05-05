/**
 * 活动 360° 数据中心面板 —— 嵌在活动详情 analytics tab 里。
 *
 * 五个纵向分区（Card + 折叠头）按业务问题切，不按 nodeType:
 *
 *   §1 Acquisition   参与（KPI Row + 每日新增曲线）
 *   §2 Engagement    留存与活跃（项目级 DAU 趋势 + 节点活跃度提示）
 *   §3 Output        产出与转化（积分总量 + 直方图 + 完成度分布）
 *   §4 Economy       奖励与成本（reward_key 来源分布）
 *   §5 Operational   节点配置健康（每节点开关 / refResource active）
 *
 * 节点视角只在 §2 / §5 出现，作为下钻入口；KPI / 趋势按"业务问题"组织。
 *
 * 数据源:
 *   - PG: useActivityAnalyticsOverview (一次往返 §1 §3 §4)
 *   - PG: useActivityNodesAnalytics (§5)
 *   - Tinybird: useTenantDauTimeseries (§2 项目级参考；v2 升活动维度)
 */

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { StatCard, StatGrid } from "#/components/patterns"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"
import { Badge } from "#/components/ui/badge"
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
import {
  useActivityAnalyticsOverview,
  useActivityNodesAnalytics,
  type ActivityAnalyticsOverview,
} from "#/hooks/use-activity"
import { useTenantDauTimeseries } from "#/lib/tinybird"
import * as m from "#/paraglide/messages.js"

type WindowOption = "24h" | "7d" | "30d" | "lifetime"

const WINDOW_LABELS: Record<WindowOption, () => string> = {
  "24h": () => m.activity_360_window_24h(),
  "7d": () => m.activity_360_window_7d(),
  "30d": () => m.activity_360_window_30d(),
  lifetime: () => m.activity_360_window_lifetime(),
}

const WINDOW_DAYS: Record<WindowOption, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  lifetime: null,
}

function useTimeRange(option: WindowOption) {
  return useMemo(() => {
    const days = WINDOW_DAYS[option]
    if (days == null) return { from: undefined, to: undefined }
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [option])
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return `${(n * 100).toFixed(1)}%`
}

export function ActivityAnalyticsPanel({
  activityKey,
}: {
  activityKey: string
}) {
  const [windowOption, setWindowOption] = useState<WindowOption>("lifetime")
  const range = useTimeRange(windowOption)

  const overview = useActivityAnalyticsOverview({
    key: activityKey,
    from: range.from,
    to: range.to,
  })
  const nodes = useActivityNodesAnalytics({ key: activityKey })

  // §2 Engagement 用项目级 DAU 作为 v1 参考（不限定 event）。
  // v2 加 activity-scoped 维度时可换成 useActivityScopedTimeseries。
  const dauRange = useMemo(() => {
    if (range.from && range.to) return range
    // lifetime → 30d 兜底（events_hourly_agg 物化视图存在的行情）
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 86_400_000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [range])
  const dau = useTenantDauTimeseries({
    from: dauRange.from!,
    to: dauRange.to!,
    bucketSeconds: 86_400,
  })

  if (overview.isPending) {
    return (
      <div className="rounded-xl border bg-card p-6 text-muted-foreground shadow-sm">
        {m.common_loading()}
      </div>
    )
  }
  if (overview.error || !overview.data) {
    return (
      <div className="rounded-xl border bg-card p-6 text-destructive shadow-sm">
        {m.common_failed_to_load({
          resource: m.activity_tab_analytics(),
          error: overview.error?.message ?? "",
        })}
      </div>
    )
  }

  const data = overview.data
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          {m.activity_360_window_label()}
        </span>
        <Select
          value={windowOption}
          onValueChange={(v) => setWindowOption((v ?? "lifetime") as WindowOption)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(WINDOW_LABELS) as WindowOption[]).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {WINDOW_LABELS[opt]()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AcquisitionSection data={data} />
      <EngagementSection
        dauData={dau.data?.data ?? null}
        nodes={nodes.data?.items ?? []}
      />
      <OutputSection data={data} />
      <EconomySection data={data} />
      <OperationalSection
        nodes={nodes.data?.items ?? []}
        loading={nodes.isPending}
      />
    </div>
  )
}

// ─── §1 Acquisition ─────────────────────────────────────────────────

function AcquisitionSection({ data }: { data: ActivityAnalyticsOverview }) {
  const a = data.acquisition
  const joinedSeriesConfig: ChartConfig = {
    count: {
      label: m.analytics_chart_label_new_participants(),
      color: "#8b5cf6",
    },
  }
  return (
    <SectionCard title={m.activity_360_section_acquisition()}>
      <StatGrid columns={4}>
        <StatCard
          label={m.activity_360_kpi_total_participants()}
          value={a.totalParticipants.toLocaleString()}
        />
        <StatCard
          label={m.activity_360_kpi_current_active()}
          value={a.currentActive.toLocaleString()}
        />
        <StatCard
          label={m.activity_360_kpi_completion_rate()}
          value={pct(a.completionRate)}
        />
        <StatCard
          label={m.activity_360_kpi_drop_rate()}
          value={pct(a.dropRate)}
        />
      </StatGrid>
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-medium">
          {m.activity_360_chart_joined_per_day()}
        </h4>
        {a.joinedSeries.length === 0 ? (
          <EmptyHint />
        ) : (
          <ChartContainer
            config={joinedSeriesConfig}
            className="aspect-auto h-[220px] w-full"
          >
            <LineChart data={a.joinedSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </SectionCard>
  )
}

// ─── §2 Engagement ──────────────────────────────────────────────────

function EngagementSection({
  dauData,
  nodes,
}: {
  dauData: Array<{ bucket: string; dau: number }> | null
  nodes: Array<{
    nodeType: string
    alias: string | null
    completionCount: number | null
    enabled: boolean
    resourceActive: boolean
  }>
}) {
  const dauConfig: ChartConfig = {
    dau: { label: m.analytics_chart_label_dau(), color: "#3b82f6" },
  }
  return (
    <SectionCard title={m.activity_360_section_engagement()}>
      <p className="mb-3 text-xs text-muted-foreground">
        {m.activity_360_engagement_hint_project_dau()}
      </p>
      {!dauData || dauData.length === 0 ? (
        <EmptyHint />
      ) : (
        <ChartContainer
          config={dauConfig}
          className="aspect-auto h-[220px] w-full"
        >
          <LineChart
            data={dauData.map((r) => ({
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
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      )}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-medium">
          {m.activity_360_engagement_node_completion()}
        </h4>
        {nodes.length === 0 ? (
          <EmptyHint />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">{m.activity_360_table_node()}</TableHead>
                <TableHead>{m.activity_360_table_node_type()}</TableHead>
                <TableHead className="text-right">
                  {m.activity_360_table_node_completion()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((n, i) => (
                <TableRow key={`${n.nodeType}-${n.alias ?? i}`}>
                  <TableCell className="font-mono text-xs">
                    {n.alias ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{n.nodeType}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {n.completionCount == null
                      ? "—"
                      : n.completionCount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {m.activity_360_engagement_hint_v1_scope()}
      </p>
    </SectionCard>
  )
}

// ─── §3 Output ──────────────────────────────────────────────────────

function OutputSection({ data }: { data: ActivityAnalyticsOverview }) {
  const o = data.output
  const pointsBucketsConfig: ChartConfig = {
    count: { label: m.analytics_chart_label_members(), color: "#10b981" },
  }
  const totalDistCount = o.completionDist.reduce((s, r) => s + r.count, 0) || 1
  return (
    <SectionCard title={m.activity_360_section_output()}>
      <StatGrid columns={4}>
        <StatCard
          label={m.activity_360_kpi_total_points()}
          value={o.totalPoints.toLocaleString()}
        />
        <StatCard
          label={m.activity_analytics_avg_points()}
          value={Math.round(o.avgPoints).toLocaleString()}
        />
        <StatCard
          label={m.activity_analytics_p50_points()}
          value={o.p50Points.toLocaleString()}
        />
        <StatCard
          label={m.activity_analytics_max_points()}
          value={o.maxPoints.toLocaleString()}
        />
      </StatGrid>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium">
            {m.activity_analytics_points_distribution()}
          </h4>
          {o.pointsBuckets.length === 0 ? (
            <EmptyHint />
          ) : (
            <ChartContainer
              config={pointsBucketsConfig}
              className="aspect-auto h-[220px] w-full"
            >
              <BarChart data={o.pointsBuckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#10b981" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">
            {m.activity_360_chart_completion_dist()}
          </h4>
          {o.completionDist.length === 0 ? (
            <EmptyHint />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.activity_360_table_status()}</TableHead>
                  <TableHead className="text-right">
                    {m.activity_360_table_count()}
                  </TableHead>
                  <TableHead className="text-right">
                    {m.activity_360_table_share()}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.completionDist.map((r) => (
                  <TableRow key={r.status}>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {pct(r.count / totalDistCount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

// ─── §4 Economy ─────────────────────────────────────────────────────

function EconomySection({ data }: { data: ActivityAnalyticsOverview }) {
  const e = data.economy
  const totalCount = e.byRewardKey.reduce((s, r) => s + r.count, 0) || 1
  return (
    <SectionCard title={m.activity_360_section_economy()}>
      <StatGrid columns={2}>
        <StatCard
          label={m.activity_360_kpi_total_rewards()}
          value={e.totalRewardsGranted.toLocaleString()}
        />
        <StatCard
          label={m.activity_360_kpi_reward_sources()}
          value={e.byRewardKey.length.toLocaleString()}
        />
      </StatGrid>
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-medium">
          {m.activity_360_chart_rewards_by_key()}
        </h4>
        {e.byRewardKey.length === 0 ? (
          <EmptyHint />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.activity_360_table_reward_source()}</TableHead>
                <TableHead className="text-right">
                  {m.activity_360_table_count()}
                </TableHead>
                <TableHead className="text-right">
                  {m.activity_360_table_share()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.byRewardKey.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-mono text-xs">{r.key}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {pct(r.count / totalCount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </SectionCard>
  )
}

// ─── §5 Operational ─────────────────────────────────────────────────

function OperationalSection({
  nodes,
  loading,
}: {
  nodes: Array<{
    nodeId: string
    alias: string | null
    nodeType: string
    refId: string | null
    enabled: boolean
    resourceActive: boolean
    effectiveEnabled: boolean
    completionCount: number | null
    errorRate: number | null
  }>
  loading: boolean
}) {
  return (
    <SectionCard title={m.activity_360_section_operational()}>
      {loading ? (
        <div className="text-muted-foreground">{m.common_loading()}</div>
      ) : nodes.length === 0 ? (
        <EmptyHint />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.activity_360_table_node()}</TableHead>
              <TableHead>{m.activity_360_table_node_type()}</TableHead>
              <TableHead className="text-center">
                {m.activity_360_table_enabled()}
              </TableHead>
              <TableHead className="text-center">
                {m.activity_360_table_resource_active()}
              </TableHead>
              <TableHead className="text-center">
                {m.activity_360_table_effective()}
              </TableHead>
              <TableHead className="text-right">
                {m.activity_360_table_node_completion()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((n) => (
              <TableRow key={n.nodeId}>
                <TableCell className="font-mono text-xs">
                  {n.alias ?? n.nodeId.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{n.nodeType}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <BoolDot ok={n.enabled} />
                </TableCell>
                <TableCell className="text-center">
                  <BoolDot ok={n.resourceActive} />
                </TableCell>
                <TableCell className="text-center">
                  <BoolDot ok={n.effectiveEnabled} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  {n.completionCount == null
                    ? "—"
                    : n.completionCount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
      {m.activity_analytics_no_data()}
    </div>
  )
}

function BoolDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        ok
          ? "inline-block size-2.5 rounded-full bg-emerald-500"
          : "inline-block size-2.5 rounded-full bg-muted-foreground/40"
      }
      aria-label={ok ? "ok" : "off"}
    />
  )
}

export default ActivityAnalyticsPanel
