import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

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
import { useItemDefinitions } from "#/hooks/use-item"
import type { CreateOptionInput } from "#/lib/types/exchange"
import type { ItemEntry } from "#/lib/types/item"

interface EntryRow {
  definitionId: string
  quantity: number
}

function ItemEntryEditor({
  label,
  entries,
  onChange,
  definitions,
}: {
  label: string
  entries: EntryRow[]
  onChange: (entries: EntryRow[]) => void
  definitions: { id: string; name: string }[]
}) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              value={entry.definitionId}
              onValueChange={(v) => {
                const next = [...entries]
                next[i] = { ...entry, definitionId: v }
                onChange(next)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select item..." />
              </SelectTrigger>
              <SelectContent>
                {definitions.map((def) => (
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
                onChange(next)
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
              onChange(next.length > 0 ? next : [{ definitionId: "", quantity: 1 }])
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
        onClick={() => onChange([...entries, { definitionId: "", quantity: 1 }])}
      >
        <Plus className="size-4" />
        Add
      </Button>
    </div>
  )
}

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
  submitLabel = "Create",
}: OptionFormProps) {
  const { data: definitions } = useItemDefinitions()
  const defs = (definitions ?? []).map((d) => ({ id: d.id, name: d.name }))

  const [name, setName] = useState(defaultValues?.name ?? "")
  const [description, setDescription] = useState(defaultValues?.description ?? "")
  const [costItems, setCostItems] = useState<EntryRow[]>(
    defaultValues?.costItems?.length
      ? defaultValues.costItems.map((e) => ({ ...e }))
      : [{ definitionId: "", quantity: 1 }],
  )
  const [rewardItems, setRewardItems] = useState<EntryRow[]>(
    defaultValues?.rewardItems?.length
      ? defaultValues.rewardItems.map((e) => ({ ...e }))
      : [{ definitionId: "", quantity: 1 }],
  )
  const [userLimit, setUserLimit] = useState<number | null>(
    defaultValues?.userLimit ?? null,
  )
  const [globalLimit, setGlobalLimit] = useState<number | null>(
    defaultValues?.globalLimit ?? null,
  )
  const [sortOrder, setSortOrder] = useState(defaultValues?.sortOrder ?? 0)
  const [isActive, setIsActive] = useState(defaultValues?.isActive ?? true)
  const [nameError, setNameError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    setNameError("")

    const validCosts = costItems.filter((e) => e.definitionId && e.quantity > 0)
    const validRewards = rewardItems.filter((e) => e.definitionId && e.quantity > 0)

    const input: CreateOptionInput = {
      name: name.trim(),
      description: description || null,
      costItems: validCosts as ItemEntry[],
      rewardItems: validRewards as ItemEntry[],
      userLimit,
      globalLimit,
      sortOrder,
      isActive,
    }
    onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="opt-name">Name *</Label>
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
        <Label htmlFor="opt-desc">Description</Label>
        <Textarea
          id="opt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          rows={2}
        />
      </div>

      <ItemEntryEditor
        label="Cost Items (consumed) *"
        entries={costItems}
        onChange={setCostItems}
        definitions={defs}
      />

      <ItemEntryEditor
        label="Reward Items (granted) *"
        entries={rewardItems}
        onChange={setRewardItems}
        definitions={defs}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="opt-userLimit">User Limit</Label>
          <Input
            id="opt-userLimit"
            type="number"
            min={1}
            value={userLimit ?? ""}
            onChange={(e) =>
              setUserLimit(e.target.value ? Number(e.target.value) : null)
            }
            placeholder="Unlimited"
          />
          <p className="text-xs text-muted-foreground">
            Max times per user. Empty = unlimited.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="opt-globalLimit">Global Limit</Label>
          <Input
            id="opt-globalLimit"
            type="number"
            min={1}
            value={globalLimit ?? ""}
            onChange={(e) =>
              setGlobalLimit(e.target.value ? Number(e.target.value) : null)
            }
            placeholder="Unlimited"
          />
          <p className="text-xs text-muted-foreground">
            Total exchanges allowed. Empty = unlimited.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="opt-sortOrder">Sort Order</Label>
        <Input
          id="opt-sortOrder"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="opt-isActive"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="opt-isActive">Active</Label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  )
}
