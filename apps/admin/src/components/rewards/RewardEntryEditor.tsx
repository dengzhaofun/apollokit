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
import * as m from "#/paraglide/messages.js"
import { useRewardCatalog } from "#/hooks/use-reward-catalog"
import type { RewardEntry, RewardType } from "#/lib/types/rewards"

interface RewardEntryEditorProps {
  label: string
  entries: RewardEntry[]
  onChange: (entries: RewardEntry[]) => void
  /** Restrict which types the user can pick. Defaults to all three. */
  allowedTypes?: RewardType[]
  hint?: string
  /** When true, the "add row" button and row actions are disabled. */
  disabled?: boolean
}

const DEFAULT_TYPES: RewardType[] = ["item", "currency", "entity"]

function typeLabel(t: RewardType): string {
  switch (t) {
    case "item":
      return m.reward_type_item()
    case "currency":
      return m.reward_type_currency()
    case "entity":
      return m.reward_type_entity()
  }
}

/**
 * Polymorphic reward/cost editor shared across every module that edits
 * `RewardEntry[]` jsonb columns (shop cost/reward, exchange cost/reward,
 * check-in reward, task reward, cdkey reward, mail reward, lottery
 * reward, collection milestone reward, level clear reward, leaderboard
 * tier reward, activity global/participant rewards).
 *
 * Layout: `[type ▾] [id/name ▾] [count #] [🗑]`. The type dropdown gates
 * the id dropdown — changing type clears the id because options change.
 */
export function RewardEntryEditor({
  label,
  entries,
  onChange,
  allowedTypes = DEFAULT_TYPES,
  hint,
  disabled,
}: RewardEntryEditorProps) {
  const { byType, isPending } = useRewardCatalog()

  function update(i: number, patch: Partial<RewardEntry>) {
    const next = [...entries]
    next[i] = { ...next[i]!, ...patch } as RewardEntry
    onChange(next)
  }

  function remove(i: number) {
    onChange(entries.filter((_, j) => j !== i))
  }

  function addRow() {
    const defaultType = allowedTypes[0] ?? "item"
    onChange([...entries, { type: defaultType, id: "", count: 1 }])
  }

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {m.reward_entry_empty_hint()}
        </p>
      ) : (
        entries.map((entry, i) => {
          const options = byType[entry.type] ?? []
          return (
            <div key={i} className="flex items-end gap-2">
              <div className="w-28">
                <Select
                  value={entry.type}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const next = v as RewardType
                    // Changing type clears id because option list changes.
                    update(i, { type: next, id: "" })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {typeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Select
                  value={entry.id}
                  disabled={disabled || isPending}
                  onValueChange={(v) => update(i, { id: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        isPending
                          ? m.common_loading()
                          : m.reward_entry_pick_target()
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                        {opt.alias ? (
                          <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                            {opt.alias}
                          </code>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  min={1}
                  value={entry.count}
                  disabled={disabled}
                  onChange={(e) =>
                    update(i, { count: Number(e.target.value) || 1 })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={addRow}
      >
        <Plus className="size-4" />
        {m.reward_entry_add()}
      </Button>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
