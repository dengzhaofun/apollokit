import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useItemDefinitions } from "#/hooks/use-item"
import type { CreateRewardInput } from "#/lib/types/check-in-reward"
import type { ItemEntry } from "#/lib/types/item"

interface EntryRow {
  definitionId: string
  quantity: number
}

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
  submitLabel = "Create",
}: RewardFormProps) {
  const { data: definitions } = useItemDefinitions()
  const defs = (definitions ?? []).map((d) => ({ id: d.id, name: d.name }))

  const [dayNumber, setDayNumber] = useState(defaultValues?.dayNumber ?? 1)
  const [entries, setEntries] = useState<EntryRow[]>(
    defaultValues?.rewardItems?.length
      ? defaultValues.rewardItems.map((e) => ({ ...e }))
      : [{ definitionId: "", quantity: 1 }],
  )
  const [dayError, setDayError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (dayNumber < 1) {
      setDayError("Day number must be at least 1")
      return
    }
    setDayError("")

    const validEntries = entries.filter((e) => e.definitionId && e.quantity > 0)
    if (validEntries.length === 0) return

    onSubmit({
      dayNumber,
      rewardItems: validEntries as ItemEntry[],
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
        {dayError && (
          <p className="text-sm text-destructive">{dayError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Which consecutive check-in day triggers this reward.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Reward Items *</Label>
        {entries.map((entry, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                value={entry.definitionId}
                onValueChange={(v) => {
                  const next = [...entries]
                  next[i] = { ...entry, definitionId: v }
                  setEntries(next)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent>
                  {defs.map((def) => (
                    <SelectItem key={def.id} value={def.id}>
                      {def.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Input
                type="number"
                min={1}
                value={entry.quantity}
                onChange={(e) => {
                  const next = [...entries]
                  next[i] = { ...entry, quantity: Number(e.target.value) || 1 }
                  setEntries(next)
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={() => {
                const next = entries.filter((_, j) => j !== i)
                setEntries(next.length > 0 ? next : [{ definitionId: "", quantity: 1 }])
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEntries([...entries, { definitionId: "", quantity: 1 }])}
        >
          <Plus className="size-4" />
          Add Item
        </Button>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
