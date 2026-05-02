/**
 * Data tab for an experiment detail page.
 *
 * Direct-reads from Tinybird via the existing
 * `useTenantEventTimeseries` hook (event = "experiment.exposure",
 * filter on `event_data.experiment_id`, groupBy `event_data.variant_key`).
 * Zero new pipes — leverages exactly the JSON-path filter / groupBy
 * branch the self-serve analytics page already uses.
 *
 * For deeper analysis (per-variant funnel comparison, custom
 * conversion-event picker), we surface a deep-link to /analytics/explore
 * with the experiment_id filter pre-filled. v2 will inline a richer
 * funnel widget once the funnel pipe gains JSON-path filtering.
 */

import { Link } from "@tanstack/react-router"
import { ArrowRight, Beaker, Calendar, Users } from "lucide-react"
import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { DecisionPanel } from "#/components/experiment/DecisionPanel"
import { ExperimentStatusBadge } from "#/components/experiment/StatusBadge"
import { StatCard, StatGrid } from "#/components/patterns"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Skeleton } from "#/components/ui/skeleton"
import { useTenantEventTimeseries } from "#/lib/tinybird"
import type { Experiment } from "#/lib/types/experiment"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

const WINDOWS: { value: "24h" | "7d" | "30d"; bucketSeconds: number }[] = [
  { value: "24h", bucketSeconds: 3600 },
  { value: "7d", bucketSeconds: 3600 },
  { value: "30d", bucketSeconds: 86_400 },
]

const VARIANT_HUES = [210, 30, 145, 280, 0, 50, 180, 320]

interface Props {
  experiment: Experiment
}

export function AnalyticsPanel({ experiment }: Props) {
  const [windowKey, setWindowKey] = useState<"24h" | "7d" | "30d">("7d")

  const window = WINDOWS.find((w) => w.value === windowKey)!
  const to = useMemo(() => new Date(), [])
  const from = useMemo(() => {
    const d = new Date(to)
    if (windowKey === "24h") d.setHours(d.getHours() - 24)
    else if (windowKey === "7d") d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 30)
    return d
  }, [to, windowKey])

  const series = useTenantEventTimeseries({
    event: "experiment.exposure",
    from,
    to,
    bucketSeconds: window.bucketSeconds,
    groupBy: "json",
    jsonPathGroup: "variant_key",
    filters: { jsonPath: "experiment_id", jsonValue: experiment.id },
    enabled: experiment.status !== "draft",
  })

  // Pivot rows[{bucket, dim, c, ...}] → recharts shape [{bucket, control: c1, treatment: c2}]
  const rows = useMemo(
    () =>
      (series.data?.data ?? []) as Array<{
        bucket: string
        dim: string
        c: number
        uniq_users: number
      }>,
    [series.data],
  )
  const dims = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.dim || "control")
    return Array.from(set).sort()
  }, [rows])
  const points = useMemo(() => {
    const byBucket = new Map<string, Record<string, number | string>>()
    for (const r of rows) {
      const key = r.bucket
      const dim = r.dim || "control"
      const existing = byBucket.get(key) ?? { bucket: key }
      existing[dim] = Number(r.c)
      byBucket.set(key, existing)
    }
    return Array.from(byBucket.values()).sort((a, b) =>
      String(a.bucket) < String(b.bucket) ? -1 : 1,
    )
  }, [rows])
  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {}
    dims.forEach((d, i) => {
      cfg[cssKey(d)] = {
        label: d,
        color: `hsl(${VARIANT_HUES[i % VARIANT_HUES.length]}, 65%, 55%)`,
      }
    })
    return cfg
  }, [dims])

  const exposedUsers = useMemo(() => {
    const users = new Set<string>()
    let total = 0
    for (const r of rows) total += Number(r.uniq_users)
    return { unique: rows.length === 0 ? 0 : total, set: users }
  }, [rows])

  const runningDays = useMemo(() => {
    if (!experiment.startedAt) return 0
    const start = new Date(experiment.startedAt).getTime()
    const end = experiment.endedAt
      ? new Date(experiment.endedAt).getTime()
      : Date.now()
    return Math.max(0, Math.round((end - start) / 86_400_000))
  }, [experiment.startedAt, experiment.endedAt])

  const exploreHref = buildExploreLink(experiment.id)

  return (
    <div className="space-y-6">
      <StatGrid columns={3}>
        <StatCard
          label={m.experiment_stat_exposed_users()}
          value={
            exposedUsers.unique > 0
              ? exposedUsers.unique.toLocaleString()
              : (experiment.assignedUsers ?? 0).toLocaleString()
          }
          icon={Users}
        />
        <StatCard
          label={m.experiment_stat_variants()}
          value={experiment.variantsCount ?? 0}
          icon={Beaker}
        />
        <StatCard
          label={m.experiment_stat_running_days()}
          value={runningDays}
          icon={Calendar}
          hint={<ExperimentStatusBadge status={experiment.status} />}
        />
      </StatGrid>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              {m.experiment_chart_exposure_title()}
            </h3>
            <p className="text-xs text-muted-foreground">
              {m.experiment_chart_exposure_subtitle()}
            </p>
          </div>
          <Select
            value={windowKey}
            onValueChange={(v) => setWindowKey(v as typeof windowKey)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7d</SelectItem>
              <SelectItem value="30d">30d</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="px-4 py-4">
          {experiment.status === "draft" ? (
            <EmptyHint>{m.experiment_chart_draft_hint()}</EmptyHint>
          ) : series.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : series.isError ? (
            <ErrorHint>
              {series.error?.message ?? m.experiment_failed_generic()}
            </ErrorHint>
          ) : points.length === 0 ? (
            <EmptyHint>{m.experiment_chart_no_exposures_yet()}</EmptyHint>
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-[4/1] min-h-[260px] w-full"
            >
              <LineChart data={points}>
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
                {dims.map((dim) => (
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
        </div>
      </div>

      {/*
        v1.5: replace the v1 deep-link-only fallback with the
        full statistical decision panel. The deep link to /analytics/explore
        is preserved INSIDE the DecisionPanel for power-user
        ad-hoc analysis.
      */}
      <DecisionPanel experiment={experiment} from={from} to={to} />

      {/*
        Power-user escape hatch — kept here in addition to the one
        the DecisionPanel renders, so even when the panel is
        collapsed (no metric chosen yet) the deep link is one click
        away. Hidden when the metric IS configured to avoid
        duplication.
      */}
      {!experiment.primaryMetric && (
        <div className="rounded-md border border-dashed bg-muted/20 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            {m.experiment_chart_funnel_link_hint()}
          </p>
          <Link
            to="/analytics/explore"
            search={exploreHref as Record<string, unknown>}
            className="mt-1 inline-flex items-center gap-1 text-brand hover:underline"
          >
            {m.experiment_chart_explore_link()}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("flex h-60 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground")}>
      {children}
    </div>
  )
}
function ErrorHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {children}
    </div>
  )
}

function cssKey(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_") || "_"
}

function buildExploreLink(experimentId: string): Record<string, string> {
  // Mirrors the explore page's URL contract — see
  // apps/admin/src/routes/_dashboard/analytics/explore/index.tsx.
  return {
    event: "experiment.exposure",
    groupBy: "json",
    jsonPathGroup: "variant_key",
    jsonPath: "experiment_id",
    jsonValue: experimentId,
  }
}
