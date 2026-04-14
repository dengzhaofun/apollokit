import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
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
import { useItemCategories } from "#/hooks/use-item"
import { useLotteryPools } from "#/hooks/use-lottery"
import type { CreateDefinitionInput } from "#/lib/types/item"

interface DefinitionFormProps {
  defaultValues?: Partial<CreateDefinitionInput>
  onSubmit: (values: CreateDefinitionInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function DefinitionForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: DefinitionFormProps) {
  const { data: categories } = useItemCategories()
  const { data: pools } = useLotteryPools()

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
              placeholder="e.g. gold"
            />
            <p className="text-xs text-muted-foreground">
              Optional URL-friendly key. Lowercase letters, digits, hyphens, underscores.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="categoryId">
        {(field) => (
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v === "__none__" ? "" : v)}
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

      <form.Field name="stackable">
        {(field) => (
          <div className="flex items-center gap-3">
            <Switch
              id={field.name}
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={field.name}>{m.item_stackable()}</Label>
            <p className="text-xs text-muted-foreground">
              Stackable items can share inventory rows. Non-stackable items get one row per instance.
            </p>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.stackable}>
        {(stackable) =>
          stackable ? (
            <form.Field name="stackLimit">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Stack Limit</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Max quantity per stack. Empty = unlimited (currency behavior).
                  </p>
                </div>
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="holdLimit">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{m.item_hold_limit()}</Label>
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
              Max total quantity a user can hold. 1 = unique item. Empty = unlimited.
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="lotteryPoolId">
        {(field) => (
          <div className="space-y-2">
            <Label>Lottery Pool</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v === "__none__" ? "" : v)}
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
            <p className="text-xs text-muted-foreground">
              Link to a lottery pool to make this item openable (e.g. treasure chest).
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
