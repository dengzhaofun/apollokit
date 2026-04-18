import { useState } from "react"

import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import type { CreateRewardInput } from "#/lib/types/check-in-reward"
import type { RewardEntry } from "#/lib/types/rewards"

interface RewardFormProps {
  defaultValues?: Partial<CreateRewardInput>
  onSubmit: (values: CreateRewardInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function RewardForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = m.common_create(),
}: RewardFormProps) {
  const [dayNumber, setDayNumber] = useState(defaultValues?.dayNumber ?? 1)
  const [entries, setEntries] = useState<RewardEntry[]>(
    defaultValues?.rewardItems?.length
      ? defaultValues.rewardItems.map((e) => ({ ...e }))
      : [],
  )
  const [dayError, setDayError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (dayNumber < 1) {
      setDayError("Day number must be at least 1")
      return
    }
    setDayError("")

    const valid = entries.filter((e) => e.id && e.count > 0)
    if (valid.length === 0) return

    onSubmit({
      dayNumber,
      rewardItems: valid,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reward-day">Day Number *</Label>
        <Input
          id="reward-day"
          type="number"
          min={1}
          value={dayNumber}
          onChange={(e) => setDayNumber(Number(e.target.value))}
        />
        {dayError && <p className="text-sm text-destructive">{dayError}</p>}
        <p className="text-xs text-muted-foreground">
          Which consecutive check-in day triggers this reward.
        </p>
      </div>

      <RewardEntryEditor
        label="Reward Items *"
        entries={entries}
        onChange={setEntries}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
