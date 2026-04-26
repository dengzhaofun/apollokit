import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
import { Button } from "#/components/ui/button"
import {
  FormStateBridge,
  type FormBridgeState,
} from "#/components/ui/form-state-bridge"
import { Input } from "#/components/ui/input"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type { CreateCategoryInput } from "#/lib/types/item"

interface CategoryFormProps {
  defaultValues?: Partial<CreateCategoryInput>
  onSubmit: (values: CreateCategoryInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  /** Apply to the <form> element so external buttons can use `form="..."`. */
  id?: string
  /** Hide the inline submit button — useful when an external footer hosts it. */
  hideSubmitButton?: boolean
  /** Receive form state for driving an external submit button or dirty-close gate. */
  onStateChange?: (state: FormBridgeState) => void
}

export function CategoryForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: CategoryFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      icon: defaultValues?.icon ?? "",
      sortOrder: defaultValues?.sortOrder ?? 0,
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreateCategoryInput = {
        name: value.name,
        alias: value.alias || null,
        icon: value.icon || null,
        sortOrder: value.sortOrder,
        isActive: value.isActive,
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
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Currency"
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
              placeholder="e.g. currency (lowercase, digits, hyphens, underscores)"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="icon">
        {(field) => (
          <div className="space-y-2">
            <Label>{m.common_icon()}</Label>
            <MediaPickerDialog
              value={field.state.value || null}
              onChange={(url) => field.handleChange(url)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="sortOrder">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.common_sort_order()}</Label>
            <Input
              id={field.name}
              type="number"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(Number(e.target.value))}
            />
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
              {isPending ? "Saving..." : (submitLabel ?? m.common_create())}
            </Button>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}

