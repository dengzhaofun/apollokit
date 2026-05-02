/**
 * Drawer for creating / editing a single variant.
 *
 * Uses the shared `<JsonEditor>` for `configJson` — that component
 * already handles syntax highlighting, format button, and live JSON
 * validation; we just track the parsed result here for save-time
 * gating.
 */

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import { Button } from "#/components/ui/button"
import { FormDrawer } from "#/components/ui/form-drawer"
import { JsonEditor } from "#/components/patterns"
import {
  useCreateVariant,
  useUpdateVariant,
} from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import type { ExperimentVariant } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

const KEY_REGEX = /^[a-z][a-z0-9_]*$/

interface Props {
  experimentKey: string
  open: boolean
  onClose: () => void
  /** When set: edit mode. */
  variant?: ExperimentVariant
  /** When `editingLocked = true`, all destructive fields are disabled. */
  editingLocked?: boolean
}

export function VariantEditor({
  experimentKey,
  open,
  onClose,
  variant,
  editingLocked,
}: Props) {
  const isEdit = !!variant
  const create = useCreateVariant(experimentKey)
  const update = useUpdateVariant(experimentKey)
  const mutation = isEdit ? update : create

  const initial = useMemo(() => initialFromVariant(variant), [variant])
  const [variantKey, setVariantKey] = useState(initial.variantKey)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [isControl, setIsControl] = useState(initial.isControl)
  const [configText, setConfigText] = useState(initial.configText)
  const [configJsonError, setConfigJsonError] = useState<string | null>(null)

  // Reset state when the drawer is reopened with a different variant.
  useEffect(() => {
    if (!open) return
    setVariantKey(initial.variantKey)
    setName(initial.name)
    setDescription(initial.description)
    setIsControl(initial.isControl)
    setConfigText(initial.configText)
    setConfigJsonError(null)
  }, [open, initial])

  const keyValid = !variantKey || KEY_REGEX.test(variantKey)
  const canSubmit =
    !!variantKey &&
    keyValid &&
    !!name &&
    !configJsonError &&
    !mutation.isPending

  const isDirty =
    variantKey !== initial.variantKey ||
    name !== initial.name ||
    description !== initial.description ||
    isControl !== initial.isControl ||
    configText !== initial.configText

  async function handleSave() {
    if (!canSubmit) return

    let parsedConfig: unknown = null
    if (configText.trim()) {
      try {
        parsedConfig = JSON.parse(configText)
      } catch (e) {
        setConfigJsonError(
          e instanceof Error ? e.message : m.experiment_variant_config_invalid_json(),
        )
        return
      }
    }

    try {
      if (isEdit && variant) {
        await update.mutateAsync({
          id: variant.id,
          variantKey,
          name,
          description: description || null,
          isControl,
          configJson: parsedConfig,
        })
      } else {
        await create.mutateAsync({
          variantKey,
          name,
          description: description || null,
          isControl,
          configJson: parsedConfig,
        })
      }
      toast.success(
        isEdit
          ? m.experiment_variant_updated({ key: variantKey })
          : m.experiment_variant_added({ key: variantKey }),
      )
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
    <FormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={isDirty}
      title={isEdit ? m.experiment_variant_edit() : m.experiment_variant_add()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSubmit || editingLocked}
          >
            {mutation.isPending
              ? m.common_saving()
              : isEdit
                ? m.common_save()
                : m.common_create()}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="variant-key">
            {m.experiment_variant_field_key()}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="variant-key"
            value={variantKey}
            onChange={(e) => setVariantKey(e.target.value.trim())}
            placeholder="treatment"
            disabled={editingLocked}
            autoComplete="off"
          />
          {variantKey && !keyValid && (
            <p className="text-xs text-destructive">
              {m.experiment_field_key_helper()}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="variant-name">
            {m.experiment_variant_field_name()}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="variant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={editingLocked}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="variant-description">
            {m.experiment_field_description()}
          </Label>
          <Textarea
            id="variant-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={editingLocked}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <div>
            <Label htmlFor="variant-is-control" className="text-sm">
              {m.experiment_variant_field_is_control()}
            </Label>
          </div>
          <Switch
            id="variant-is-control"
            checked={isControl}
            onCheckedChange={setIsControl}
            disabled={editingLocked}
          />
        </div>

        <div className="space-y-2">
          <Label>{m.experiment_variant_field_config()}</Label>
          <JsonEditor
            value={configText}
            onChange={(v) => {
              setConfigText(v)
              setConfigJsonError(null)
            }}
            onBlur={({ error }) => setConfigJsonError(error ?? null)}
            placeholder={`{\n  "rewardMultiplier": 2\n}`}
            height={180}
          />
          <FieldHint>
            {m.experiment_variant_field_config_helper()}
          </FieldHint>
          {configJsonError && (
            <p className="text-xs text-destructive">{configJsonError}</p>
          )}
        </div>
      </div>
    </FormDrawer>
  )
}

function initialFromVariant(v: ExperimentVariant | undefined) {
  return {
    variantKey: v?.variantKey ?? "",
    name: v?.name ?? "",
    description: v?.description ?? "",
    isControl: v?.isControl ?? false,
    configText:
      v?.configJson != null ? JSON.stringify(v.configJson, null, 2) : "",
  }
}
