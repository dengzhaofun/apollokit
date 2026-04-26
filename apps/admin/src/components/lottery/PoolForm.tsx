import { useForm } from "@tanstack/react-form"

import { Button } from "#/components/ui/button"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type { CreatePoolInput } from "#/lib/types/lottery"

interface PoolFormProps {
  defaultValues?: Partial<CreatePoolInput>
  onSubmit: (values: CreatePoolInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function LotteryPoolForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = "Create",
  id,
  hideSubmitButton,
  onStateChange,
}: PoolFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      description: defaultValues?.description ?? "",
      isActive: defaultValues?.isActive ?? true,
      globalPullLimit: defaultValues?.globalPullLimit ?? (null as number | null),
      activityId: defaultValues?.activityId ?? (null as string | null),
    },
    onSubmit: async ({ value }) => {
      const input: CreatePoolInput = {
        name: value.name,
        alias: value.alias || null,
        description: value.description || null,
        isActive: value.isActive,
        globalPullLimit: value.globalPullLimit,
        activityId: value.activityId,
      }
      await onSubmit(input)
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
            <Label htmlFor={field.name}>Name *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Lucky Wheel"
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
              placeholder="e.g. lucky-wheel"
            />
            <p className="text-xs text-muted-foreground">
              Optional URL-friendly key. Lowercase letters, digits, hyphens, underscores.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Description</Label>
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

      <form.Field name="globalPullLimit">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Global Pull Limit</Label>
            <Input
              id={field.name}
              type="number"
              min={1}
              value={field.state.value ?? ""}
              onBlur={field.handleBlur}
              onChange={(e) =>
                field.handleChange(e.target.value ? Number(e.target.value) : null)
              }
              placeholder="Leave empty for unlimited"
            />
            <p className="text-xs text-muted-foreground">
              Maximum total pulls across all users. Empty = unlimited.
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
            <Label htmlFor={field.name}>Active</Label>
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
