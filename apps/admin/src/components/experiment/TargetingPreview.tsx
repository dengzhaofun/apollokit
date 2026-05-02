/**
 * Coverage preview for targeting rules.
 *
 * Sends a fixed-attribute sample to the server's previewBucketing
 * endpoint, which evaluates the rule against `sample_size` synthetic
 * users and reports the hit-rate percentage. Lets the operator
 * estimate "how many users will my experiment cover?" before
 * starting it.
 */

import { Loader2, Target } from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { usePreviewBucketing } from "#/hooks/use-experiment"
import { isEmptyRule } from "#/lib/targeting/jsonlogic-builder"
import type {
  Experiment,
  ExperimentTargetingRules,
} from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

interface Props {
  experiment: Experiment
  /**
   * Live targeting rule from the editor (not yet persisted). When
   * unchanged, we still preview against the current saved value.
   */
  draftRules: ExperimentTargetingRules
}

const DEFAULT_SAMPLE_ATTRIBUTES = '{ "country": "JP", "plan": "free" }'

export function TargetingPreview({ experiment, draftRules }: Props) {
  const preview = usePreviewBucketing(experiment.key)
  const [attrText, setAttrText] = useState(DEFAULT_SAMPLE_ATTRIBUTES)
  const [parseError, setParseError] = useState<string | null>(null)

  const ruleEmpty = isEmptyRule(draftRules)

  function handleRun() {
    let parsed: Record<string, unknown> = {}
    if (attrText.trim()) {
      try {
        parsed = JSON.parse(attrText)
        if (typeof parsed !== "object" || parsed === null) {
          setParseError(m.experiment_targeting_preview_attrs_invalid())
          return
        }
      } catch {
        setParseError(m.experiment_targeting_preview_attrs_invalid())
        return
      }
    }
    setParseError(null)
    preview.mutate({
      sample_size: 1000,
      attributes_sample: parsed,
    })
  }

  if (ruleEmpty) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {m.experiment_targeting_preview_empty_hint()}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {m.experiment_targeting_preview_title()}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {m.experiment_targeting_preview_subtitle()}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="attr-sample" className="text-xs">
            {m.experiment_targeting_preview_attrs_label()}
          </Label>
          <Input
            id="attr-sample"
            value={attrText}
            onChange={(e) => {
              setAttrText(e.target.value)
              setParseError(null)
            }}
            className="font-mono text-xs"
          />
          {parseError && (
            <p className="text-xs text-destructive">{parseError}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRun}
          disabled={preview.isPending}
        >
          {preview.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Target className="size-4" />
          )}
          {m.experiment_targeting_preview_run()}
        </Button>
      </div>

      {preview.data && (
        <div className="rounded-md bg-brand-soft/30 px-3 py-2 text-sm">
          {preview.data.targetingHitRate !== null
            ? m.experiment_targeting_preview_result({
                rate: preview.data.targetingHitRate.toFixed(1),
              })
            : m.experiment_targeting_preview_no_rule()}
        </div>
      )}
    </div>
  )
}
