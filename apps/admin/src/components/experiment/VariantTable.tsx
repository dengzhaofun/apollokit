/**
 * Editable variant table for the experiment detail page.
 *
 * Shows each variant with inline traffic% editing (number input) and
 * a stacked sum bar below. The traffic_allocation lives on the
 * experiment row, NOT per-variant — so we collect the local form
 * state into a single `trafficAllocation` array and let the parent
 * persist via `useUpdateExperiment`.
 *
 * When the experiment is `running`, the entire table is read-only —
 * see `RunningBanner` above for the explanation surface.
 */

import { Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { TrafficSumBar } from "#/components/experiment/TrafficSumBar"
import { VariantEditor } from "#/components/experiment/VariantEditor"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { confirm } from "#/components/patterns"
import {
  useDeleteVariant,
  useUpdateExperiment,
} from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import type {
  Experiment,
  ExperimentTrafficSlice,
  ExperimentVariant,
} from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

interface Props {
  experiment: Experiment
  variants: ExperimentVariant[]
  /** True when status === "running" — disables all destructive UI. */
  locked: boolean
}

export function VariantTable({ experiment, variants, locked }: Props) {
  const update = useUpdateExperiment()
  const del = useDeleteVariant(experiment.key)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExperimentVariant | undefined>()

  // Local copy of allocation, keyed for fast lookup. Local state lets
  // the user tweak each row's % without round-tripping the server until
  // they hit Save.
  const [allocations, setAllocations] = useState<Map<string, number>>(() =>
    buildAllocationMap(variants, experiment.trafficAllocation),
  )

  // Re-sync when variants OR persisted allocation change (e.g. after
  // create/delete or an external edit).
  useEffect(() => {
    setAllocations(buildAllocationMap(variants, experiment.trafficAllocation))
  }, [variants, experiment.trafficAllocation])

  const allocationArray: ExperimentTrafficSlice[] = variants.map((v) => ({
    variant_key: v.variantKey,
    percent: allocations.get(v.variantKey) ?? 0,
  }))
  const persistedArray: ExperimentTrafficSlice[] = experiment.trafficAllocation
  const dirty = JSON.stringify(allocationArray) !== JSON.stringify(persistedArray)

  function setPercent(key: string, value: number) {
    if (locked) return
    const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
    setAllocations((prev) => {
      const next = new Map(prev)
      next.set(key, v)
      return next
    })
  }

  async function handleSaveAllocation() {
    try {
      await update.mutateAsync({
        id: experiment.id,
        trafficAllocation: allocationArray.filter((s) => s.percent > 0),
      })
      toast.success(m.experiment_traffic_saved())
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  async function handleDelete(variant: ExperimentVariant) {
    const ok = await confirm({
      title: m.experiment_variant_delete_confirm_title(),
      description: m.experiment_variant_delete_confirm_body(),
      confirmLabel: m.common_delete(),
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(variant.id)
      toast.success(m.experiment_variant_deleted({ key: variant.variantKey }))
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  function openEdit(variant: ExperimentVariant) {
    setEditTarget(variant)
    setEditorOpen(true)
  }
  function openCreate() {
    setEditTarget(undefined)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {variants.length === 0
            ? m.experiment_variants_empty()
            : m.experiment_variants_count({ count: variants.length })}
        </div>
        <Button size="sm" onClick={openCreate} disabled={locked}>
          <Plus className="size-4" />
          {m.experiment_variant_add()}
        </Button>
      </div>

      {variants.length > 0 && (
        <>
          {/* Compact table-as-stacked-cards layout — works on mobile too. */}
          <ul className="divide-y rounded-md border">
            {variants.map((v) => {
              const isControl =
                v.isControl || v.variantKey === experiment.controlVariantKey
              return (
                <li
                  key={v.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {v.variantKey}
                      </code>
                      <span className="font-medium">{v.name}</span>
                      {isControl && (
                        <Badge variant="outline" className="text-[10px]">
                          {m.experiment_variant_field_is_control()}
                        </Badge>
                      )}
                      {v.configJson != null && (
                        <Badge variant="secondary" className="text-[10px]">
                          {m.experiment_variant_has_config()}
                        </Badge>
                      )}
                    </div>
                    {v.description && (
                      <p className="text-xs text-muted-foreground">
                        {v.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {m.experiment_field_assigned_users()}:{" "}
                      <span className="tabular-nums">
                        {(v.assignedUsers ?? 0).toLocaleString()}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={allocations.get(v.variantKey) ?? 0}
                        onChange={(e) =>
                          setPercent(v.variantKey, Number(e.target.value))
                        }
                        disabled={locked}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(v)}
                      disabled={locked && v.variantKey !== experiment.controlVariantKey}
                      className="size-8"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(v)}
                      disabled={
                        locked || v.variantKey === experiment.controlVariantKey
                      }
                      className="size-8"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          <TrafficSumBar allocation={allocationArray} />

          {dirty && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAllocations(
                    buildAllocationMap(variants, experiment.trafficAllocation),
                  )
                }
              >
                {m.common_reset()}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAllocation}
                disabled={update.isPending || locked}
              >
                {update.isPending
                  ? m.common_saving()
                  : m.experiment_traffic_save()}
              </Button>
            </div>
          )}
        </>
      )}

      <VariantEditor
        experimentKey={experiment.key}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        variant={editTarget}
        editingLocked={locked}
      />
    </div>
  )
}

function buildAllocationMap(
  variants: ExperimentVariant[],
  allocation: ExperimentTrafficSlice[],
): Map<string, number> {
  const m = new Map<string, number>()
  for (const v of variants) m.set(v.variantKey, 0)
  for (const slice of allocation) {
    if (m.has(slice.variant_key)) m.set(slice.variant_key, slice.percent)
  }
  return m
}
