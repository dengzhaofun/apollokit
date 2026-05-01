import { Plus, Trash2 } from "lucide-react"

import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import * as m from "#/paraglide/messages.js"
import type { ActivityMilestoneTier, RewardEntry } from "#/lib/types/activity"

interface Props {
  value: ActivityMilestoneTier[]
  onChange: (next: ActivityMilestoneTier[]) => void
  disabled?: boolean
}

/**
 * Visual editor for activity milestone tiers — replaces the old JSON
 * textarea. Each tier is a row of (alias, points threshold, rewards),
 * with the polymorphic `RewardEntryEditor` providing item / currency /
 * entity selection so operators don't have to type UUIDs by hand.
 *
 * Keeps the wire shape (`{ alias, points, rewards }`) identical to the
 * server validator — see `ActivityMilestoneTier` in
 * `apps/server/src/schema/activity.ts`.
 */
export function ActivityMilestonesEditor({ value, onChange, disabled }: Props) {
  function update(idx: number, patch: Partial<ActivityMilestoneTier>) {
    const next = [...value]
    next[idx] = { ...next[idx]!, ...patch }
    onChange(next)
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function addRow() {
    onChange([
      ...value,
      {
        alias: `m${value.length + 1}`,
        points: 100 * (value.length + 1),
        rewards: [],
      },
    ])
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {m.activity_milestones_empty()}
        </p>
      ) : null}
      {value.map((tier, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
        >
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">
                {m.activity_milestone_field_alias()}
              </Label>
              <Input
                value={tier.alias}
                disabled={disabled}
                placeholder="m1"
                onChange={(e) => update(idx, { alias: e.target.value })}
              />
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <Label className="text-xs">
                {m.activity_milestone_field_points()}
              </Label>
              <Input
                type="number"
                min={0}
                step={10}
                disabled={disabled}
                value={tier.points}
                onChange={(e) =>
                  update(idx, { points: Number(e.target.value) || 0 })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => remove(idx)}
              aria-label="remove tier"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <RewardEntryEditor
            label={m.activity_milestone_field_rewards()}
            entries={tier.rewards}
            disabled={disabled}
            onChange={(next: RewardEntry[]) => update(idx, { rewards: next })}
          />
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addRow}
        >
          <Plus className="size-4" />
          {m.activity_milestone_add()}
        </Button>
      </div>
    </div>
  )
}
