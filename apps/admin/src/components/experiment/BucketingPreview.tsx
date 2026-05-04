/**
 * Developer-facing tool: type an endUserId and see which variant the
 * bucketing function will produce for it. Below the input, a simple
 * stacked bar shows the actual distribution of 1000 sampled users —
 * useful for verifying the configured allocation isn't badly skewed
 * by a hash collision.
 *
 * Hidden when the experiment hasn't been configured yet (no variants
 * or no allocation), since previewing would always return control.
 */

import { Beaker, Loader2 } from "lucide-react"
import { useState } from "react"

import { TrafficSumBar } from "#/components/experiment/TrafficSumBar"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { usePreviewBucketing } from "#/hooks/use-experiment"
import type { Experiment } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

interface Props {
  experiment: Experiment
}

export function BucketingPreview({ experiment }: Props) {
  const preview = usePreviewBucketing(experiment.key)
  const [endUserId, setEndUserId] = useState("")

  const result = preview.data

  const distributionAsAllocation = result?.distribution.map((d) => ({
    variant_key: d.variantKey,
    percent: d.percent,
  })) ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="bucketing-userid" className="text-xs">
            {m.experiment_bucketing_input_placeholder()}
          </Label>
          <Input
            id="bucketing-userid"
            value={endUserId}
            onChange={(e) => setEndUserId(e.target.value.trim())}
            placeholder={m.experiment_bucketing_user_id_placeholder()}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            preview.mutate({
              end_user_id: endUserId || undefined,
              sample_size: 1000,
            })
          }
          disabled={preview.isPending}
        >
          {preview.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Beaker className="size-4" />
          )}
          {m.experiment_bucketing_button()}
        </Button>
      </div>

      {result?.userVariant && endUserId && (
        <div className="rounded-md border bg-brand-soft/30 px-3 py-2 text-sm">
          {m.experiment_bucketing_result({
            userId: endUserId,
            variant: result.userVariant.variantKey,
          })}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {m.experiment_bucketing_distribution_label()}
          </div>
          <TrafficSumBar allocation={distributionAsAllocation} />
        </div>
      )}
    </div>
  )
}
