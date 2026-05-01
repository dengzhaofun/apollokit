import { AlertTriangle, Pencil, Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"
import type { CheckInReward } from "#/lib/types/check-in-reward"

interface Props {
  orphans: CheckInReward[]
  onEdit: (reward: CheckInReward) => void
  onDelete: (reward: CheckInReward) => void
}

/**
 * Banner listing rewards whose `dayNumber` falls outside the current
 * config's resetMode/target bounds — typically the result of a mode
 * change after rewards were authored. Each row exposes Edit (opens
 * RewardCellDialog with dayNumber editable) and Delete entries so the
 * user can drain the list back to zero.
 */
export function DirtyRewardsAlert({ orphans, onEdit, onDelete }: Props) {
  if (orphans.length === 0) return null
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle />
      <AlertTitle>
        {m.checkin_dirty_day_warning({ count: orphans.length })}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1">
          {orphans.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded border border-destructive/30 bg-card px-2 py-1"
            >
              <span className="text-sm">
                {m.checkin_reward_day_n({ n: r.dayNumber })}
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.rewardItems.length}{" "}
                  {r.rewardItems.length === 1
                    ? m.checkin_reward_item_singular()
                    : m.checkin_reward_item_plural()}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => onEdit(r)}
                  aria-label={m.common_edit()}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(r)}
                  aria-label={m.common_delete()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
