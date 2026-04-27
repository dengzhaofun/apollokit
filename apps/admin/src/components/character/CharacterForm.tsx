import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type { CharacterSide } from "#/lib/types/character"
import * as m from "#/paraglide/messages.js"

import type { CharacterFormApi } from "./use-character-form"

interface CharacterFormProps {
  form: CharacterFormApi
  submitLabel: string
  isPending?: boolean
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

const SIDE_NONE = "__none__"

export function CharacterForm({
  form,
  submitLabel,
  isPending,
  id,
  hideSubmitButton,
  onStateChange,
}: CharacterFormProps) {
  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      {onStateChange ? (
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
          })}
        >
          {(state) => <FormStateBridge state={state} onChange={onStateChange} />}
        </form.Subscribe>
      ) : null}

      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (!value.trim() ? "Name is required" : undefined),
          }}
        >
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="name">{m.character_field_name()}</Label>
              <Input
                id="name"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={m.character_field_name_placeholder()}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="alias">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="alias" className="inline-flex items-center gap-1.5">
                {m.character_field_alias()}
                <FieldHint>{m.character_field_alias_hint()}</FieldHint>
              </Label>
              <Input
                id="alias"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={m.character_field_alias_placeholder()}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor="description">
                {m.character_field_description()}
              </Label>
              <Textarea
                id="description"
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="avatarUrl">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.character_field_avatar()}</Label>
                <MediaPickerDialog
                  value={field.state.value || null}
                  onChange={(url) => field.handleChange(url)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="portraitUrl">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.character_field_portrait()}</Label>
                <MediaPickerDialog
                  value={field.state.value || null}
                  onChange={(url) => field.handleChange(url)}
                />
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="defaultSide">
            {(field) => (
              <div className="space-y-1">
                <Label>{m.character_field_default_side()}</Label>
                <Select
                  value={field.state.value ?? SIDE_NONE}
                  onValueChange={(v) =>
                    field.handleChange(v === SIDE_NONE ? null : (v as CharacterSide))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIDE_NONE}>
                      {m.character_side_none()}
                    </SelectItem>
                    <SelectItem value="left">{m.character_side_left()}</SelectItem>
                    <SelectItem value="right">
                      {m.character_side_right()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="isActive">
            {(field) => (
              <div className="flex items-center justify-between rounded-md border px-3">
                <Label htmlFor="active" className="cursor-pointer">
                  {m.character_field_active()}
                </Label>
                <Switch
                  id="active"
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v === true)}
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      {hideSubmitButton ? null : (
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !canSubmit}>
                {submitLabel}
              </Button>
            </div>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
