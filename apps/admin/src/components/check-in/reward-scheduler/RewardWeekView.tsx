import { Plus } from "lucide-react"

import { Badge } from "#/components/ui/badge"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import type { CheckInConfig } from "#/lib/types/check-in"
import type { CheckInReward } from "#/lib/types/check-in-reward"

interface Props {
  config: CheckInConfig
  byDay: Map<number, CheckInReward>
  onOpenSlot: (dayNumber: number, existing: CheckInReward | undefined) => void
}

const WEEK_DAY_KEYS = [
  m.checkin_sunday,
  m.checkin_monday,
  m.checkin_tuesday,
  m.checkin_wednesday,
  m.checkin_thursday,
  m.checkin_friday,
  m.checkin_saturday,
] as const

/** dayNumber 1..7 maps onto config.weekStartsOn..(+6) mod 7. */
function weekdayIndex(dayNumber: number, weekStartsOn: number): number {
  return (weekStartsOn + dayNumber - 1) % 7
}

/** Today's weekday in the config's timezone, 0 (Sun)..6 (Sat). */
function todayWeekday(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    })
    const w = fmt.format(new Date())
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w)
  } catch {
    return new Date().getDay()
  }
}

export function RewardWeekView({ config, byDay, onOpenSlot }: Props) {
  const todayIdx = todayWeekday(config.timezone)
  const days = [1, 2, 3, 4, 5, 6, 7]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
      {days.map((dayNumber) => {
        const wd = weekdayIndex(dayNumber, config.weekStartsOn)
        const reward = byDay.get(dayNumber)
        const isToday = wd === todayIdx
        const filled = reward != null
        const visibleEntries = reward?.rewardItems.slice(0, 2) ?? []
        const overflow = (reward?.rewardItems.length ?? 0) - visibleEntries.length

        return (
          <button
            type="button"
            key={dayNumber}
            onClick={() => onOpenSlot(dayNumber, reward)}
            className={cn(
              "group flex min-h-32 flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              filled
                ? "bg-card hover:border-primary"
                : "border-dashed text-muted-foreground hover:bg-accent",
              isToday && "ring-2 ring-primary",
            )}
          >
            <div className="flex items-center justify-between">
              <Badge variant={filled ? "secondary" : "outline"}>
                {WEEK_DAY_KEYS[wd]?.()}
              </Badge>
              {isToday ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                  {m.checkin_slot_today()}
                </span>
              ) : null}
            </div>
            <div className="flex-1 space-y-1.5">
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
                    <p className="text-xs text-muted-foreground">+{overflow}</p>
                  ) : null}
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm">
                  <Plus className="size-4" />
                  {m.checkin_slot_add()}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
