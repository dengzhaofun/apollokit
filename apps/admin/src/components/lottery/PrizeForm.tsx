import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type { CreatePrizeInput } from "#/lib/types/lottery"
import type { LotteryTier } from "#/lib/types/lottery"
import type { RewardEntry } from "#/lib/types/rewards"

interface PrizeFormProps {
  tiers?: LotteryTier[]
  defaultValues?: Partial<CreatePrizeInput> & { tierId?: string | null }
  onSubmit: (values: CreatePrizeInput & { tierId?: string }) => void | Promise<void>
  onCancel?: () => void
  isPending?: boolean
  submitLabel?: string
}

export function PrizeForm({
  tiers,
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = "Create",
}: PrizeFormProps) {
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
    defaultValues?.rewardItems?.length
      ? defaultValues.rewardItems.map((e) => ({ ...e }))
      : [],
  )

  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      tierId: defaultValues?.tierId ?? "",
      weight: defaultValues?.weight ?? 100,
      isRateUp: defaultValues?.isRateUp ?? false,
      rateUpWeight: defaultValues?.rateUpWeight ?? 0,
      globalStockLimit: defaultValues?.globalStockLimit ?? (null as number | null),
      isActive: defaultValues?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      const validRewards = rewardItems.filter((e) => e.id && e.count > 0)
      const input: CreatePrizeInput & { tierId?: string } = {
        name: value.name,
        description: value.description || null,
        rewardItems: validRewards,
        weight: value.weight,
        isRateUp: value.isRateUp,
        rateUpWeight: value.rateUpWeight,
        globalStockLimit: value.globalStockLimit,
        isActive: value.isActive,
      }
      if (value.tierId) {
        input.tierId = value.tierId
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
                placeholder={m.lottery_prize_name_placeholder()}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="weight">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Weight *</Label>
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

        {tiers && tiers.length > 0 && (
          <form.Field name="tierId">
            {(field) => (
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(!v || v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={m.lottery_prize_tier_placeholder()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No tier (flat mode)</SelectItem>
                    {tiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        )}

        <form.Field name="globalStockLimit">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Stock Limit</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value ? Number(e.target.value) : null)
                }
                placeholder={m.lottery_prize_cap_placeholder()}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Description</Label>
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={2}
              placeholder={m.lottery_prize_notes_placeholder()}
            />
          </div>
        )}
      </form.Field>

      <RewardEntryEditor
        label="Reward"
        entries={rewardItems}
        onChange={setRewardItems}
        hint="Pick item / currency / entity targets and quantity to reward on win."
      />

      <div className="flex items-center gap-6">
        <form.Field name="isRateUp">
          {(field) => (
            <div className="flex items-center gap-3">
              <Switch
                id={field.name}
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
              />
              <Label htmlFor={field.name}>Rate Up</Label>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.isRateUp}>
          {(isRateUp) =>
            isRateUp ? (
              <form.Field name="rateUpWeight">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.name} className="shrink-0">
                      Extra Weight
                    </Label>
                    <Input
                      id={field.name}
                      type="number"
                      min={0}
                      className="w-24"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                    />
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </div>

      <div className="flex items-center gap-6">
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

      </div>

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
