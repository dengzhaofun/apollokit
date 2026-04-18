import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { ActivityPicker } from "#/components/activity/ActivityPicker"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import type { CreateCurrencyInput } from "#/lib/types/currency"

interface DefinitionFormProps {
  defaultValues?: Partial<CreateCurrencyInput>
  onSubmit: (values: CreateCurrencyInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function DefinitionForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: DefinitionFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      sortOrder: defaultValues?.sortOrder ?? 0,
      isActive: defaultValues?.isActive ?? true,
      activityId: defaultValues?.activityId ?? (null as string | null),
    },
    onSubmit: async ({ value }) => {
      const input: CreateCurrencyInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        icon: value.icon || null,
        sortOrder: value.sortOrder,
        isActive: value.isActive,
        activityId: value.activityId,
      }
      await onSubmit(input)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            !value
              ? "Name is required"
              : value.length > 200
                ? "Max 200 characters"
                : undefined,
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
              placeholder="e.g. 钻石 / Gem"
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive">
                {field.state.meta.errors[0]}
              </p>
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
              placeholder="e.g. gem"
            />
            <p className="text-xs text-muted-foreground">
              {m.currency_alias_hint()}
            </p>
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
              placeholder="Optional description..."
              rows={3}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="icon">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Icon URL</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}
      </form.Field>

      <form.Field name="sortOrder">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.currency_sort_order()}</Label>
            <Input
              id={field.name}
              type="number"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {m.currency_sort_hint()}
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="activityId">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_link_activity()}</Label>
            <ActivityPicker
              value={field.state.value}
              onChange={(v) => field.handleChange(v)}
            />
            <p className="text-xs text-muted-foreground">
              {m.common_link_activity_hint()}
            </p>
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

      <form.Subscribe selector={(s) => s.canSubmit}>
        {(canSubmit) => (
          <Button type="submit" disabled={!canSubmit || isPending}>
            {isPending ? "Saving..." : (submitLabel ?? m.common_create())}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
