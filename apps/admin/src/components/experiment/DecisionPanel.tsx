/**
 * Decision Panel — replaces the v1 deep-link-only analytics view.
 *
 * Reads `experiment_metric_breakdown` per variant, then runs the
 * client-side stats lib:
 *   - SRM detection over (observed exposures vs expected from
 *     traffic_allocation × total exposed)
 *   - per-variant Wilson CI on conversion rate
 *   - z-test of each non-control variant vs control
 *
 * Color semantics (per plan v1.5 §2.4):
 *   - green: p<0.05 AND positive lift (recommend ship)
 *   - red:   p<0.05 AND negative lift (control beats variant)
 *   - gray:  not significant — sample too small or no real difference
 */

import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { MetricPicker } from "#/components/experiment/MetricPicker"
import { SrmWarning } from "#/components/experiment/SrmWarning"
import { useSetPrimaryMetric } from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import {
  compareProportions,
  detectSRM,
  type ProportionComparison,
} from "#/lib/experiment-stats"
import { useExperimentMetricBreakdown } from "#/lib/tinybird"
import type { Experiment } from "#/lib/types/experiment"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

const MIN_SAMPLE_FOR_PVALUE = 1000

interface Props {
  experiment: Experiment
  /** ISO date strings for the exposure window. */
  from: Date
  to: Date
}

export function DecisionPanel({ experiment, from, to }: Props) {
  const setMetric = useSetPrimaryMetric(experiment.key)

  const metricEvent = experiment.primaryMetric?.event ?? ""
  const breakdown = useExperimentMetricBreakdown({
    experimentId: experiment.id,
    metricEvent,
    from,
    to,
    windowDays: experiment.metricWindowDays,
    enabled: !!metricEvent && experiment.status !== "draft",
  })

  const rows = useMemo(
    () => breakdown.data?.data ?? [],
    [breakdown.data],
  )

  // Pre-aggregate everything we need for the table + SRM.
  const analysis = useMemo(() => analyse(experiment, rows), [experiment, rows])

  async function handleSaveMetric(
    metric: Experiment["primaryMetric"],
    windowDays: number,
  ) {
    try {
      await setMetric.mutateAsync({
        id: experiment.id,
        primaryMetric: metric,
        metricWindowDays: windowDays,
      })
      toast.success(m.experiment_metric_saved())
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">
          {m.experiment_decision_panel_title()}
        </h3>
        <p className="text-xs text-muted-foreground">
          {m.experiment_decision_panel_subtitle()}{" "}
          <Link
            to="/experiment/about-stats"
            className="underline hover:text-foreground"
          >
            {m.experiment_about_stats_link()}
          </Link>
        </p>
      </div>

      <MetricPicker
        experiment={experiment}
        onSave={handleSaveMetric}
        saving={setMetric.isPending}
      />

      {!metricEvent ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {m.experiment_decision_panel_pick_metric_first()}
        </div>
      ) : breakdown.isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : breakdown.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {breakdown.error?.message ?? m.experiment_failed_generic()}
        </div>
      ) : (
        <>
          {analysis.srmFlag && (
            <SrmWarning result={analysis.srm} totalSample={analysis.totalExposed} />
          )}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{m.experiment_decision_col_variant()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_exposed()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_converted()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_rate()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_ci()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_lift()}</th>
                  <th className="px-3 py-2 text-right">{m.experiment_decision_col_p()}</th>
                  <th className="px-3 py-2 text-center">{m.experiment_decision_col_call()}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((r) => (
                  <DecisionRow key={r.variantKey} row={r} />
                ))}
              </tbody>
            </table>
          </div>

          {analysis.totalExposed < MIN_SAMPLE_FOR_PVALUE && (
            <p className="text-xs text-muted-foreground">
              {m.experiment_decision_small_sample_note({
                threshold: MIN_SAMPLE_FOR_PVALUE.toLocaleString(),
              })}
            </p>
          )}
        </>
      )}

      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs">
        <p className="text-muted-foreground">
          {m.experiment_chart_funnel_link_hint()}
        </p>
        <Link
          to="/analytics/explore"
          search={
            {
              event: "experiment.exposure",
              groupBy: "json",
              jsonPathGroup: "variant_key",
              jsonPath: "experiment_id",
              jsonValue: experiment.id,
            } as Record<string, unknown>
          }
          className="mt-1 inline-flex items-center gap-1 text-brand hover:underline"
        >
          {m.experiment_chart_explore_link()}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

interface DisplayRow {
  variantKey: string
  isControl: boolean
  exposed: number
  converted: number
  comparison: ProportionComparison
}

interface Analysis {
  rows: DisplayRow[]
  srm: ReturnType<typeof detectSRM>
  srmFlag: boolean
  totalExposed: number
}

function analyse(
  experiment: Experiment,
  rows: Array<{ variant_key: string; exposed_users: number; converted_users: number }>,
): Analysis {
  const byKey = new Map(rows.map((r) => [r.variant_key, r]))
  const totalExposed = rows.reduce((s, r) => s + Number(r.exposed_users), 0)

  // Expected counts from declared traffic_allocation. If unset, fall
  // back to "evenly split across present variants" (rare path —
  // experiment must have an allocation to be running).
  const expected: Record<string, number> = {}
  if (experiment.trafficAllocation.length > 0) {
    for (const slice of experiment.trafficAllocation) {
      expected[slice.variant_key] = (slice.percent / 100) * totalExposed
    }
  } else {
    const equalShare = rows.length > 0 ? totalExposed / rows.length : 0
    for (const r of rows) expected[r.variant_key] = equalShare
  }

  const observed: Record<string, number> = {}
  for (const r of rows) observed[r.variant_key] = Number(r.exposed_users)

  const srm = detectSRM(observed, expected)

  // Build per-variant comparison rows. Control row goes first.
  const controlKey = experiment.controlVariantKey
  const control = byKey.get(controlKey)
  const controlExposed = Number(control?.exposed_users ?? 0)
  const controlConverted = Number(control?.converted_users ?? 0)

  const display: DisplayRow[] = []
  // Control first
  display.push({
    variantKey: controlKey,
    isControl: true,
    exposed: controlExposed,
    converted: controlConverted,
    comparison: compareProportions(
      controlConverted,
      controlExposed,
      controlConverted,
      controlExposed,
    ),
  })
  for (const r of rows) {
    if (r.variant_key === controlKey) continue
    const exposed = Number(r.exposed_users)
    const converted = Number(r.converted_users)
    display.push({
      variantKey: r.variant_key,
      isControl: false,
      exposed,
      converted,
      comparison: compareProportions(
        controlConverted,
        controlExposed,
        converted,
        exposed,
      ),
    })
  }

  return {
    rows: display,
    srm,
    srmFlag: srm.mismatch,
    totalExposed,
  }
}

function DecisionRow({ row }: { row: DisplayRow }) {
  const c = row.comparison
  const showPValue =
    !row.isControl && c.pValue !== null && row.exposed >= MIN_SAMPLE_FOR_PVALUE

  let callIcon = <Minus className="size-3.5 text-muted-foreground" />
  let callTone = "text-muted-foreground"
  let callLabel = m.experiment_decision_call_neutral()
  if (showPValue && c.significant) {
    if (c.liftPp > 0) {
      callIcon = <ArrowUp className="size-3.5 text-success" />
      callTone = "text-success"
      callLabel = m.experiment_decision_call_winning()
    } else {
      callIcon = <ArrowDown className="size-3.5 text-destructive" />
      callTone = "text-destructive"
      callLabel = m.experiment_decision_call_losing()
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {row.variantKey}
        </code>
        {row.isControl && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            control
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.exposed.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.converted.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {Number.isFinite(c.variantRate)
          ? `${(c.variantRate * 100).toFixed(2)}%`
          : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
        {Number.isFinite(c.variantCi.lower)
          ? `${(c.variantCi.lower * 100).toFixed(1)}%–${(c.variantCi.upper * 100).toFixed(1)}%`
          : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.isControl
          ? "—"
          : `${c.liftPp >= 0 ? "+" : ""}${c.liftPp.toFixed(2)}pp`}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-xs">
        {!row.isControl && showPValue
          ? c.pValue! < 0.001
            ? "p<0.001"
            : `p=${c.pValue!.toFixed(3)}`
          : !row.isControl
            ? m.experiment_decision_small_sample_short()
            : "—"}
      </td>
      <td className={cn("px-3 py-2 text-center", callTone)}>
        <span className="inline-flex items-center gap-1 text-xs">
          {callIcon}
          {!row.isControl && showPValue ? callLabel : ""}
        </span>
      </td>
    </tr>
  )
}
