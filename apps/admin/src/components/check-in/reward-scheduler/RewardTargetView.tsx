import { Plus } from "lucide-react"

import { Alert, AlertDescription } from "#/components/ui/alert"
import { Badge } from "#/components/ui/badge"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import type { CheckInReward } from "#/lib/types/check-in-reward"

interface Props {
  target: number
  byDay: Map<number, CheckInReward>
  onOpenSlot: (dayNumber: number, existing: CheckInReward | undefined) => void
}

const RECOMMEND_LIMIT = 365

export function RewardTargetView({ target, byDay, onOpenSlot }: Props) {
  const days = Array.from({ length: target }, (_, i) => i + 1)
  const layout: "wrap" | "grid" | "scroll" =
    target <= 14 ? "wrap" : target <= 60 ? "grid" : "scroll"

  return (
    <div className="space-y-3">
      {target > RECOMMEND_LIMIT ? (
        <Alert>
          <AlertDescription>
            {m.checkin_target_over_recommend()}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          layout === "wrap" && "flex flex-wrap gap-3",
          layout === "grid" && "grid grid-cols-7 gap-2",
          layout === "scroll" &&
            "flex gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]",
        )}
      >
        {days.map((dayNumber) => {
          const reward = byDay.get(dayNumber)
          const filled = reward != null
          const visibleEntries = reward?.rewardItems.slice(0, 1) ?? []
          const overflow =
            (reward?.rewardItems.length ?? 0) - visibleEntries.length

          if (layout === "wrap") {
            return (
              <button
                type="button"
                key={dayNumber}
                onClick={() => onOpenSlot(dayNumber, reward)}
                className={cn(
                  "flex min-h-28 w-32 flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                  filled
                    ? "bg-card hover:border-primary"
                    : "border-dashed text-muted-foreground hover:bg-accent",
                )}
              >
                <Badge variant={filled ? "secondary" : "outline"}>
                  {m.checkin_reward_day_n({ n: dayNumber })}
                </Badge>
                <div className="flex-1 space-y-1.5 text-sm">
                  {filled ? (
                    <>
                      {visibleEntries.map((entry, i) => (
                        <ItemRewardRow
                          key={`${entry.type}:${entry.id}:${i}`}
                          entry={entry}
                          size="sm"
                        />
                      ))}
                      {overflow > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          +{overflow}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Plus className="size-4" />
                      {m.checkin_slot_add()}
                    </span>
                  )}
                </div>
              </button>
            )
          }

          // grid / scroll: compact square / mini cell
          return (
            <button
              type="button"
              key={dayNumber}
              onClick={() => onOpenSlot(dayNumber, reward)}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border p-1 text-center transition-colors",
                layout === "grid"
                  ? "aspect-square"
                  : "size-16 shrink-0",
                filled
                  ? "bg-card hover:border-primary"
                  : "border-dashed text-muted-foreground hover:bg-accent",
              )}
              aria-label={m.checkin_reward_day_n({ n: dayNumber })}
            >
              <span className="text-xs font-semibold">{dayNumber}</span>
              {filled ? (
                <span className="text-[10px] text-primary">
                  ×{reward?.rewardItems.length ?? 0}
                </span>
              ) : (
                <Plus className="size-3 opacity-60" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
