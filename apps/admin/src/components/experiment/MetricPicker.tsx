/**
 * Primary metric editor — used inline in the decision panel and on
 * the experiment detail config tab.
 *
 * Three fields:
 *   - **event** — autocomplete from the tenant's recent event names
 *     (via `useTenantEventNames`)
 *   - **denominator** — `exposed_users` (default, Bernoulli) or `events`
 *   - **window_days** — 1..30, defaults to current experiment value
 *
 * v1.5 doesn't expose the optional JSON filter in the picker — it's
 * a power-user feature and would clutter the form. Tenant who needs
 * it edits via API; the read path supports it.
 */

import { Save } from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useTenantEventNames } from "#/lib/tinybird"
import type {
  Experiment,
  ExperimentPrimaryMetric,
} from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

interface Props {
  experiment: Experiment
  /** Save handler — called when the operator clicks "Save metric". */
  onSave: (
    metric: ExperimentPrimaryMetric | null,
    windowDays: number,
  ) => void | Promise<void>
  /** Disable controls while a mutation is pending. */
  saving?: boolean
}

export function MetricPicker({ experiment, onSave, saving }: Props) {
  const [event, setEvent] = useState(experiment.primaryMetric?.event ?? "")
  const [denominator, setDenominator] = useState<"exposed_users" | "events">(
    experiment.primaryMetric?.denominator ?? "exposed_users",
  )
  const [windowDays, setWindowDays] = useState<number>(experiment.metricWindowDays)

  // Pull the last 30 days of distinct event names for autocomplete.
  // Cheap pipe — the explore page uses it on every load.
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000)
  const eventNames = useTenantEventNames({ from, to })

  const dirty =
    event !== (experiment.primaryMetric?.event ?? "") ||
    denominator !== (experiment.primaryMetric?.denominator ?? "exposed_users") ||
    windowDays !== experiment.metricWindowDays

  function handleSave() {
    if (!event) {
      onSave(null, windowDays)
      return
    }
    onSave(
      {
        event,
        denominator,
        filter: experiment.primaryMetric?.filter ?? null,
      },
      windowDays,
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_120px_auto]">
        <div className="space-y-1">
          <Label htmlFor="metric-event" className="text-xs">
            {m.experiment_metric_event_label()}
          </Label>
          <Input
            id="metric-event"
            list="metric-event-list"
            value={event}
            onChange={(e) => setEvent(e.target.value.trim())}
            placeholder={m.experiment_metric_event_placeholder()}
            className="h-8 font-mono text-xs"
          />
          <datalist id="metric-event-list">
            {(eventNames.data?.data ?? []).map((opt) => (
              <option key={opt.event} value={opt.event}>
                {`${opt.event}  ·  ${Number(opt.c).toLocaleString()}`}
              </option>
            ))}
          </datalist>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            {m.experiment_metric_denominator_label()}
          </Label>
          <Select
            value={denominator}
            onValueChange={(v) =>
              setDenominator(v as "exposed_users" | "events")
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exposed_users">
                {m.experiment_metric_denominator_users()}
              </SelectItem>
              <SelectItem value="events">
                {m.experiment_metric_denominator_events()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="metric-window" className="text-xs">
            {m.experiment_metric_window_label()}
          </Label>
          <Input
            id="metric-window"
            type="number"
            min={1}
            max={30}
            value={windowDays}
            onChange={(e) =>
              setWindowDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))
            }
            className="h-8"
          />
        </div>

        <div className="flex items-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            <Save className="size-4" />
            {m.common_save()}
          </Button>
        </div>
      </div>

      <FieldHint>
        {denominator === "exposed_users"
          ? m.experiment_metric_denominator_users_hint()
          : m.experiment_metric_denominator_events_hint()}
      </FieldHint>
    </div>
  )
}
