import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
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
import { useAllItemCategories } from "#/hooks/use-item"
import { useAllLotteryPools } from "#/hooks/use-lottery"
import type { CreateDefinitionInput } from "#/lib/types/item"

interface DefinitionFormProps {
  defaultValues?: Partial<CreateDefinitionInput>
  onSubmit: (values: CreateDefinitionInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
  id?: string
  hideSubmitButton?: boolean
  onStateChange?: (state: FormBridgeState) => void
}

export function DefinitionForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
  id,
  hideSubmitButton,
  onStateChange,
}: DefinitionFormProps) {
  const { data: categories } = useAllItemCategories()
  const { data: pools } = useAllLotteryPools()

  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      alias: defaultValues?.alias ?? "",
      categoryId: defaultValues?.categoryId ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? "",
      stackable: defaultValues?.stackable ?? true,
      stackLimit: defaultValues?.stackLimit ?? (null as number | null),
      holdLimit: defaultValues?.holdLimit ?? (null as number | null),
      lotteryPoolId: (defaultValues as Record<string, unknown>)?.lotteryPoolId as string ?? "",
      isActive: defaultValues?.isActive ?? true,
      activityId: defaultValues?.activityId ?? (null as string | null),
    },
    onSubmit: async ({ value }) => {
      const input: CreateDefinitionInput = {
        name: value.name,
        alias: value.alias || null,
        categoryId: value.categoryId || null,
        description: value.description || null,
        icon: value.icon || null,
        stackable: value.stackable,
        stackLimit: value.stackable ? value.stackLimit : null,
        holdLimit: value.holdLimit,
        lotteryPoolId: value.lotteryPoolId || null,
        isActive: value.isActive,
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
            <Label htmlFor={field.name}>{m.common_name()} *</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. Gold Coin"
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
              placeholder="e.g. gold (lowercase, digits, hyphens, underscores)"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="categoryId">
        {(field) => (
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(!v || v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Uncategorized</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label>{m.common_icon()}</Label>
            <MediaPickerDialog
              value={field.state.value || null}
              onChange={(url) => field.handleChange(url)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="stackable">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
              {m.item_stackable()}
              <FieldHint>
                Stackable items can share inventory rows. Non-stackable items get one row per instance.
              </FieldHint>
            </Label>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.stackable}>
        {(stackable) =>
          stackable ? (
            <form.Field name="stackLimit">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                    Stack Limit
                    <FieldHint>
                      Max quantity per stack. Empty = unlimited (currency behavior).
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
                    placeholder="Leave empty for unlimited (currency)"
                  />
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="holdLimit">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
              {m.item_hold_limit()}
              <FieldHint>
                Max total quantity a user can hold. 1 = unique item. Empty = unlimited.
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
              placeholder="Leave empty for unlimited"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="lotteryPoolId">
        {(field) => (
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              Lottery Pool
              <FieldHint>
                Link to a lottery pool to make this item openable (e.g. treasure chest).
              </FieldHint>
            </Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(!v || v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {pools?.map((pool) => (
                  <SelectItem key={pool.id} value={pool.id}>
                    {pool.name}
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
              {isPending ? "Saving..." : (submitLabel ?? m.common_create())}
            </Button>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}
