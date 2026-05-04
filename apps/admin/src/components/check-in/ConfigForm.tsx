import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type { ResetMode } from "#/lib/types/check-in"

import type { CheckInFormApi } from "./use-config-form"

const TIMEZONES = Intl.supportedValuesOf("timeZone")

function getResetModeLabels(): Record<ResetMode, string> {
  return {
    none: m.checkin_reset_none(),
    week: m.checkin_reset_weekly(),
    month: m.checkin_reset_monthly(),
  }
}

function getWeekDayLabels(): string[] {
  return [
    m.checkin_sunday(),
    m.checkin_monday(),
    m.checkin_tuesday(),
    m.checkin_wednesday(),
    m.checkin_thursday(),
    m.checkin_friday(),
    m.checkin_saturday(),
  ]
}

interface ConfigFormProps {
  /**
   * The TanStack Form instance, owned by the caller — see
   * `use-config-form.ts` for why it's lifted out of this component.
   */
  form: CheckInFormApi
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function ConfigForm({
  form,
  isPending,
  submitLabel = m.common_create(),
  id,
  hideSubmitButton,
  onStateChange,
}: ConfigFormProps) {
  const RESET_MODE_LABELS = getResetModeLabels()
  const WEEK_DAY_LABELS = getWeekDayLabels()

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

      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value ? "Name is required" : value.length > 200 ? "Max 200 characters" : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.check_in_name_placeholder()}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="alias">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_alias()}</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.check_in_key_placeholder()}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_description()}</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={m.check_in_description_placeholder()}
              rows={3}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="resetMode">
        {(field) => (
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              {m.checkin_reset_mode()} *
              <FieldHint>
                How the check-in cycle resets: never, weekly, or monthly.
              </FieldHint>
            </Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as ResetMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RESET_MODE_LABELS) as ResetMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {RESET_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.resetMode}>
        {(resetMode) =>
          resetMode === "week" ? (
            <form.Field name="weekStartsOn">
              {(field) => (
                <div className="space-y-2">
                  <Label>{m.checkin_week_starts_on()}</Label>
                  <Select
                    value={String(field.state.value)}
                    onValueChange={(v) => field.handleChange(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEK_DAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="target">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
              {m.checkin_target()} ({m.checkin_days()})
              <FieldHint>
                Optional per-cycle goal. Leave empty for no target.
              </FieldHint>
            </Label>
            <Input
              id={field.name}
              type="number"
              min={1}
              value={field.state.value ?? ""}
              onBlur={field.handleBlur}
              onChange={(e) =>
                field.handleChange(e.target.value ? Number(e.target.value) : null)
              }
              placeholder={m.check_in_goal_placeholder()}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="timezone">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.checkin_timezone()}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={field.name}>{m.common_active()}</Label>
          </div>
        )}
      </form.Field>

      {hideSubmitButton ? null : (
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? "Saving..." : submitLabel}
            </Button>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
