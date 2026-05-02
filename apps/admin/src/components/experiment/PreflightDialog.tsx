/**
 * draft → running confirmation. Runs client-side preflight checks
 * (mirroring the server-side `validateAllocation` rules) and surfaces
 * each one with a green check / red cross + a "next step" hint.
 *
 * The Confirm button is gated on:
 *   1. all checks passing AND
 *   2. the user explicitly checking "I've reviewed the experiment design"
 *
 * The pre-launch friction is intentional — this is the moment the
 * experiment starts assigning real users to variants, and a
 * mis-configured allocation produces non-recoverable data drift.
 */

import { Check, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { TrafficSumBar } from "#/components/experiment/TrafficSumBar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Checkbox } from "#/components/ui/checkbox"
import { useTransitionExperiment } from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import type {
  Experiment,
  ExperimentVariant,
} from "#/lib/types/experiment"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"

interface CheckRow {
  rule: string
  passed: boolean
  hint?: string
}

interface Props {
  experiment: Experiment
  variants: ExperimentVariant[]
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PreflightDialog({
  experiment,
  variants,
  open,
  onClose,
  onSuccess,
}: Props) {
  const transition = useTransitionExperiment()
  const [acknowledged, setAcknowledged] = useState(false)

  // Reset acknowledged state on each open.
  useEffect(() => {
    if (open) setAcknowledged(false)
  }, [open])

  const checks = computeChecks(experiment, variants)
  const allPassed = checks.every((c) => c.passed)
  const canConfirm = allPassed && acknowledged && !transition.isPending

  async function handleConfirm() {
    try {
      await transition.mutateAsync({ id: experiment.id, to: "running" })
      toast.success(m.experiment_started({ name: experiment.name }))
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.experiment_preflight_title({ name: experiment.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.experiment_preflight_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <ul className="space-y-2">
            {checks.map((c) => (
              <li
                key={c.rule}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  c.passed
                    ? "border-success/30 bg-success/5 text-foreground"
                    : "border-destructive/40 bg-destructive/5",
                )}
              >
                {c.passed ? (
                  <Check className="size-4 shrink-0 text-success" />
                ) : (
                  <X className="size-4 shrink-0 text-destructive" />
                )}
                <div>
                  <div>{c.rule}</div>
                  {!c.passed && c.hint && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.hint}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {allPassed && (
            <>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  {m.experiment_preflight_allocation_preview()}
                </div>
                <TrafficSumBar allocation={experiment.trafficAllocation} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(!!v)}
                />
                <span>{m.experiment_preflight_confirm_text()}</span>
              </label>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            {m.common_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!canConfirm}>
            {transition.isPending
              ? m.common_saving()
              : m.experiment_preflight_button()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function computeChecks(
  experiment: Experiment,
  variants: ExperimentVariant[],
): CheckRow[] {
  const variantKeys = new Set(variants.map((v) => v.variantKey))
  const sum = experiment.trafficAllocation.reduce(
    (acc, s) => acc + (s.percent || 0),
    0,
  )
  const allocationKeys = new Set(
    experiment.trafficAllocation.map((s) => s.variant_key),
  )
  const orphanKeys = experiment.trafficAllocation
    .map((s) => s.variant_key)
    .filter((k) => !variantKeys.has(k))

  return [
    {
      rule: m.experiment_preflight_check_variants(),
      passed: variants.length >= 2,
      hint: m.experiment_preflight_check_variants_hint(),
    },
    {
      rule: m.experiment_preflight_check_traffic(),
      passed:
        Math.abs(sum - 100) < 0.001 &&
        experiment.trafficAllocation.length > 0 &&
        orphanKeys.length === 0,
      hint:
        orphanKeys.length > 0
          ? m.experiment_preflight_check_traffic_orphan({
              keys: orphanKeys.join(", "),
            })
          : m.experiment_preflight_check_traffic_hint({
              sum: sum.toFixed(1),
            }),
    },
    {
      rule: m.experiment_preflight_check_control(),
      passed:
        variantKeys.has(experiment.controlVariantKey) &&
        allocationKeys.has(experiment.controlVariantKey),
      hint: m.experiment_preflight_check_control_hint({
        key: experiment.controlVariantKey,
      }),
    },
  ]
}
