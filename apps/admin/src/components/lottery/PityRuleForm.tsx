import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type { CreatePityRuleInput } from "#/lib/types/lottery"
import type { LotteryTier } from "#/lib/types/lottery"

interface PityRuleFormProps {
  tiers: LotteryTier[]
  defaultValues?: Partial<CreatePityRuleInput>
  onSubmit: (values: CreatePityRuleInput) => void | Promise<void>
  onCancel?: () => void
  isPending?: boolean
  submitLabel?: string
  disableGuaranteeTier?: boolean
}

export function PityRuleForm({
  tiers,
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = "Create",
  disableGuaranteeTier,
}: PityRuleFormProps) {
  const form = useForm({
    defaultValues: {
      guaranteeTierId: defaultValues?.guaranteeTierId ?? "",
      hardPityThreshold: defaultValues?.hardPityThreshold ?? 90,
      softPityStartAt: defaultValues?.softPityStartAt ?? (null as number | null),
      softPityWeightIncrement: defaultValues?.softPityWeightIncrement ?? (null as number | null),
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const input: CreatePityRuleInput = {
        guaranteeTierId: value.guaranteeTierId,
        hardPityThreshold: value.hardPityThreshold,
        softPityStartAt: value.softPityStartAt,
        softPityWeightIncrement: value.softPityWeightIncrement,
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
          name="guaranteeTierId"
          validators={{
            onChange: ({ value }) =>
              !value ? "Must select a tier" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label>Guarantee Tier *</Label>
              <Select
                value={field.state.value}
                onValueChange={(v) => field.handleChange(v ?? "")}
                disabled={disableGuaranteeTier}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.lottery_pity_tier_placeholder()} />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="hardPityThreshold"
          validators={{
            onChange: ({ value }) =>
              value <= 0 ? "Must be positive" : undefined,
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                Hard Pity Threshold *
                <FieldHint>
                  Guaranteed after this many pulls without the tier.
                </FieldHint>
              </Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                placeholder={m.lottery_pity_hard_cap_placeholder()}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="softPityStartAt">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                Soft Pity Start
                <FieldHint>
                  Start boosting weight after this many pulls.
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
                placeholder={m.lottery_pity_soft_start_placeholder()}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="softPityWeightIncrement">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name} className="inline-flex items-center gap-1.5">
                Weight Increment
                <FieldHint>
                  Extra weight added per pull after soft pity starts.
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
                placeholder={m.lottery_pity_soft_base_placeholder()}
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
