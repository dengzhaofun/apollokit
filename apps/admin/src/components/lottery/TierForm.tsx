import { useForm } from "@tanstack/react-form"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type { CreateTierInput } from "#/lib/types/lottery"

interface TierFormProps {
  defaultValues?: Partial<CreateTierInput>
  onSubmit: (values: CreateTierInput) => void | Promise<void>
  onCancel?: () => void
  isPending?: boolean
  submitLabel?: string
}

export function TierForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = "Create",
}: TierFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      baseWeight: defaultValues?.baseWeight ?? 100,
      color: defaultValues?.color ?? "",
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreateTierInput = {
        name: value.name,
        alias: value.alias || null,
        baseWeight: value.baseWeight,
        color: value.color || null,
        isActive: value.isActive,
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
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) =>
              !value ? "Name is required" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name *</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="e.g. SSR"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="baseWeight"
          validators={{
            onChange: ({ value }) =>
              value <= 0 ? "Weight must be positive" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Base Weight *</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                placeholder="e.g. 6"
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
              <Label htmlFor={field.name}>Alias</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="e.g. ssr"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="color">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Color</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="e.g. #FFD700"
              />
            </div>
          )}
        </form.Field>

      </div>

      <form.Field name="isActive">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={field.name}>Active</Label>
          </div>
        )}
      </form.Field>

      <div className="flex items-center gap-2">
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" size="sm" disabled={!canSubmit || isPending}>
              {isPending ? "Saving..." : submitLabel}
            </Button>
          )}
        </form.Subscribe>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
