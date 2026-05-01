import { useState } from "react"

import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Switch } from "#/components/ui/switch"
import { Label } from "#/components/ui/label"
import type { CreateOptionInput } from "#/lib/types/exchange"
import type { RewardEntry } from "#/lib/types/rewards"

interface OptionFormProps {
  defaultValues?: Partial<CreateOptionInput>
  onSubmit: (values: CreateOptionInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function OptionForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = m.common_create(),
}: OptionFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "")
  const [description, setDescription] = useState(defaultValues?.description ?? "")
  const [costItems, setCostItems] = useState<RewardEntry[]>(
    defaultValues?.costItems?.length
      ? defaultValues.costItems.map((e) => ({ ...e }))
      : [],
  )
  const [rewardItems, setRewardItems] = useState<RewardEntry[]>(
    defaultValues?.rewardItems?.length
      ? defaultValues.rewardItems.map((e) => ({ ...e }))
      : [],
  )
  const [userLimit, setUserLimit] = useState<number | null>(
    defaultValues?.userLimit ?? null,
  )
  const [globalLimit, setGlobalLimit] = useState<number | null>(
    defaultValues?.globalLimit ?? null,
  )
  const [isActive, setIsActive] = useState(defaultValues?.isActive ?? true)
  const [nameError, setNameError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    setNameError("")

    const validCosts = costItems.filter((e) => e.id && e.count > 0)
    const validRewards = rewardItems.filter((e) => e.id && e.count > 0)

    const input: CreateOptionInput = {
      name: name.trim(),
      description: description || null,
      costItems: validCosts,
      rewardItems: validRewards,
      userLimit,
      globalLimit,
      isActive,
    }
    onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="opt-name">{m.common_name()} *</Label>
        <Input
          id="opt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 100 Gold -> 1 Potion"
        />
        {nameError && (
          <p className="text-sm text-destructive">{nameError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="opt-desc">{m.common_description()}</Label>
        <Textarea
          id="opt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          rows={2}
        />
      </div>

      <RewardEntryEditor
        label={`${m.exchange_cost_items()} *`}
        entries={costItems}
        onChange={setCostItems}
      />

      <RewardEntryEditor
        label={`${m.exchange_reward_items()} *`}
        entries={rewardItems}
        onChange={setRewardItems}
        // Entity rewards are not spendable as costs, but valid as rewards.
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="opt-userLimit" className="inline-flex items-center gap-1.5">
            {m.exchange_user_limit()}
            <FieldHint>Max times per user. Empty = unlimited.</FieldHint>
          </Label>
          <Input
            id="opt-userLimit"
            type="number"
            min={1}
            value={userLimit ?? ""}
            onChange={(e) =>
              setUserLimit(e.target.value ? Number(e.target.value) : null)
            }
            placeholder={m.common_unlimited()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="opt-globalLimit" className="inline-flex items-center gap-1.5">
            {m.exchange_global_limit()}
            <FieldHint>Total exchanges allowed. Empty = unlimited.</FieldHint>
          </Label>
          <Input
            id="opt-globalLimit"
            type="number"
            min={1}
            value={globalLimit ?? ""}
            onChange={(e) =>
              setGlobalLimit(e.target.value ? Number(e.target.value) : null)
            }
            placeholder={m.common_unlimited()}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="opt-isActive"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="opt-isActive">{m.common_active()}</Label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
