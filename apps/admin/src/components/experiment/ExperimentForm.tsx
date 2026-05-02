/**
 * Basic-info form for creating / editing an experiment.
 *
 * Fields are intentionally minimal — `name`, `description`,
 * `controlVariantKey`, plus `key` (locked after create). Variants and
 * traffic allocation are configured in the detail page after create,
 * which keeps the create flow under 4 fields and unblocks the user
 * faster.
 *
 * Form state: plain useState — far simpler than TanStack Form for a
 * 4-field shape, and we don't need the AI assist drawer integration.
 * We notify the parent via `onStateChange` so the FormDrawer footer
 * can disable Save when nothing changed or when invalid.
 */

import { useEffect, useState } from "react"

import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import type {
  CreateExperimentInput,
  Experiment,
} from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

export type ExperimentFormValues = {
  key: string
  name: string
  description: string
  controlVariantKey: string
}

const KEY_REGEX = /^[a-z][a-z0-9_]*$/

export interface ExperimentFormBridgeState {
  canSubmit: boolean
  isDirty: boolean
}

interface Props {
  /** When set, the form is in "edit" mode — `key` is locked. */
  existing?: Experiment
  isPending?: boolean
  onSubmit: (values: CreateExperimentInput) => void | Promise<void>
  onStateChange?: (state: ExperimentFormBridgeState) => void
  formId?: string
}

export function ExperimentForm({
  existing,
  isPending,
  onSubmit,
  onStateChange,
  formId,
}: Props) {
  const [values, setValues] = useState<ExperimentFormValues>(() =>
    initialFromExperiment(existing),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof ExperimentFormValues, string>>>({})

  const isEdit = !!existing
  const initial = initialFromExperiment(existing)
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial)

  // Live key-format validation (on the immutable create path only).
  useEffect(() => {
    if (isEdit) return
    const next: typeof errors = {}
    if (!values.key) {
      next.key = m.common_required()
    } else if (!KEY_REGEX.test(values.key)) {
      next.key = m.experiment_field_key_helper()
    }
    if (!values.name) next.name = m.common_required()
    if (!values.controlVariantKey) {
      next.controlVariantKey = m.common_required()
    } else if (!KEY_REGEX.test(values.controlVariantKey)) {
      next.controlVariantKey = m.experiment_field_key_helper()
    }
    setErrors(next)
  }, [values, isEdit])

  const canSubmit =
    Object.keys(errors).length === 0 &&
    (isEdit ? isDirty : !!values.key && !!values.name)

  useEffect(() => {
    onStateChange?.({ canSubmit, isDirty })
  }, [canSubmit, isDirty, onStateChange])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!canSubmit) return
    void onSubmit({
      key: values.key,
      name: values.name,
      description: values.description || null,
      controlVariantKey: values.controlVariantKey || "control",
    })
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="exp-key">
          {m.experiment_field_key()} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="exp-key"
          value={values.key}
          onChange={(e) =>
            setValues((v) => ({ ...v, key: e.target.value.trim() }))
          }
          placeholder={m.experiment_field_key_placeholder()}
          disabled={isEdit || isPending}
          autoComplete="off"
        />
        <FieldHint>{m.experiment_field_key_helper()}</FieldHint>
        {errors.key && (
          <p className="text-xs text-destructive">{errors.key}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="exp-name">
          {m.experiment_field_name()}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="exp-name"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          disabled={isPending}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="exp-description">
          {m.experiment_field_description()}
        </Label>
        <Textarea
          id="exp-description"
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={3}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="exp-control">
          {m.experiment_field_control_variant()}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="exp-control"
          value={values.controlVariantKey}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              controlVariantKey: e.target.value.trim(),
            }))
          }
          placeholder="control"
          disabled={isPending}
          autoComplete="off"
        />
        <FieldHint>
          {m.experiment_field_control_variant_helper()}
        </FieldHint>
        {errors.controlVariantKey && (
          <p className="text-xs text-destructive">
            {errors.controlVariantKey}
          </p>
        )}
      </div>
    </form>
  )
}

function initialFromExperiment(
  existing: Experiment | undefined,
): ExperimentFormValues {
  return {
    key: existing?.key ?? "",
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    controlVariantKey: existing?.controlVariantKey ?? "control",
  }
}
