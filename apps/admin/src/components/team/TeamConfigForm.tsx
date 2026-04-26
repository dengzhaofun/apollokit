import { useForm } from "@tanstack/react-form"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import type { CreateTeamConfigInput } from "#/lib/types/team"

interface TeamConfigFormProps {
  defaultValues?: Partial<CreateTeamConfigInput>
  onSubmit: (values: CreateTeamConfigInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function TeamConfigForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: TeamConfigFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      maxMembers: defaultValues?.maxMembers ?? 4,
      autoDissolveOnLeaderLeave: defaultValues?.autoDissolveOnLeaderLeave ?? false,
      allowQuickMatch: defaultValues?.allowQuickMatch ?? false,
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name,
        alias: value.alias || null,
        maxMembers: value.maxMembers,
        autoDissolveOnLeaderLeave: value.autoDissolveOnLeaderLeave,
        allowQuickMatch: value.allowQuickMatch,
      })
    },
  })

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-4"
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
          onChange: ({ value }) => (!value ? "Name is required" : undefined),
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
              required
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
            />
          </div>
        )}
      </form.Field>

      <form.Field name="maxMembers">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.team_max_members()}</Label>
            <Input
              id={field.name}
              type="number"
              min={1}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(Number(e.target.value))}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="autoDissolveOnLeaderLeave">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            <Label htmlFor={field.name}>{m.team_auto_dissolve()}</Label>
          </div>
        )}
      </form.Field>

      <form.Field name="allowQuickMatch">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            <Label htmlFor={field.name}>{m.team_quick_match()}</Label>
          </div>
        )}
      </form.Field>

      {hideSubmitButton ? null : (
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? m.common_saving() : (submitLabel ?? m.common_create())}
            </Button>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
