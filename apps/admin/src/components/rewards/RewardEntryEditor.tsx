import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { ResourcePickerDialog } from "#/components/rewards/ResourcePickerDialog"
import * as m from "#/paraglide/messages.js"
import { useRewardCatalog } from "#/hooks/use-reward-catalog"
import type { RewardCatalogOption } from "#/hooks/use-reward-catalog"
import type { RewardEntry, RewardType } from "#/lib/types/rewards"

interface RewardEntryEditorProps {
  label: string
  entries: RewardEntry[]
  onChange: (entries: RewardEntry[]) => void
  /** Restrict which types the user can pick. Defaults to all three. */
  allowedTypes?: RewardType[]
  hint?: string
  /** When true, the picker button and row actions are disabled. */
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
 * Selection happens inside `<ResourcePickerDialog />` (multi-select with
 * server-side search + cursor pagination). Each row only edits `count`
 * and exposes a delete button — to swap a resource the user removes the
 * row and re-opens the picker (or toggles the resource in the picker
 * itself, which is the inverse-add gesture).
 */
export function RewardEntryEditor({
  label,
  entries,
  onChange,
  allowedTypes = DEFAULT_TYPES,
  hint,
  disabled,
}: RewardEntryEditorProps) {
  const { byType, resolveLabel, isPending } = useRewardCatalog()
  const [pickerOpen, setPickerOpen] = useState(false)

  function update(i: number, patch: Partial<RewardEntry>) {
    const next = [...entries]
    next[i] = { ...next[i]!, ...patch } as RewardEntry
    onChange(next)
  }

  function remove(i: number) {
    onChange(entries.filter((_, j) => j !== i))
  }

  function lookupOption(
    type: RewardType,
    id: string,
  ): RewardCatalogOption | undefined {
    return byType[type].find((o) => o.id === id)
  }

  return (
    <div className="space-y-3">
      <Label className="inline-flex items-center gap-1.5">
        {label}
        {hint ? <FieldHint>{hint}</FieldHint> : null}
      </Label>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {m.reward_entry_empty_hint()}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, i) => {
            const opt = lookupOption(entry.type, entry.id)
            const displayName = opt?.name ?? resolveLabel(entry.type, entry.id)
            return (
              <li
                key={`${entry.type}:${entry.id}:${i}`}
                className="flex items-center gap-2 rounded-md border bg-card p-2"
              >
                {opt?.icon ? (
                  <img
                    src={opt.icon}
                    alt=""
                    className="size-7 shrink-0 rounded-md object-cover ring-1 ring-border"
                  />
                ) : (
                  <div className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground ring-1 ring-border">
                    {displayName.slice(0, 1).toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {isPending && !opt ? m.common_loading() : displayName}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {typeLabel(entry.type)}
                    </Badge>
                  </div>
                  {opt?.alias ? (
                    <code className="text-xs text-muted-foreground">
                      {opt.alias}
                    </code>
                  ) : null}
                </div>
                <div className="w-24 shrink-0">
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
                  className="size-9 shrink-0"
                  disabled={disabled}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="size-4" />
        {m.reward_entry_add()}
      </Button>

      <ResourcePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentSelection={entries}
        onConfirm={(next) => {
          // Preserve existing counts for rows the user kept; new rows
          // default to count=1 (the picker doesn't edit counts).
          const byKey = new Map(
            entries.map((e) => [`${e.type}:${e.id}`, e.count]),
          )
          onChange(
            next.map((e) => ({
              ...e,
              count: byKey.get(`${e.type}:${e.id}`) ?? e.count,
            })),
          )
        }}
        allowedTypes={allowedTypes}
      />
    </div>
  )
}
