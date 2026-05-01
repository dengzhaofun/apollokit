import { Gift, Plus } from "lucide-react"

import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import type { CheckInConfig } from "#/lib/types/check-in"
import type { CheckInReward } from "#/lib/types/check-in-reward"

interface Props {
  config: CheckInConfig
  byDay: Map<number, CheckInReward>
  onOpenSlot: (dayNumber: number, existing: CheckInReward | undefined) => void
}

/** Day-of-month (1..31) in the config's timezone, or 0 if unparseable. */
function todayDayOfMonth(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      day: "numeric",
    })
    return Number(fmt.format(new Date())) || 0
  } catch {
    return new Date().getDate()
  }
}

export function RewardMonthView({ config, byDay, onOpenSlot }: Props) {
  const today = todayDayOfMonth(config.timezone)
  const days = Array.from({ length: 31 }, (_, i) => i + 1)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {m.checkin_month_grid_hint()}
      </p>
      <div className="grid grid-cols-7 gap-2">
        {days.map((dayNumber) => {
          const reward = byDay.get(dayNumber)
          const filled = reward != null
          const isToday = dayNumber === today
          const count = reward?.rewardItems.length ?? 0
          return (
            <button
              type="button"
              key={dayNumber}
              onClick={() => onOpenSlot(dayNumber, reward)}
              className={cn(
                "group flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border p-1 text-center transition-colors",
                filled
                  ? "bg-card hover:border-primary"
                  : "border-dashed text-muted-foreground hover:bg-accent",
                isToday && "ring-2 ring-primary",
              )}
              aria-label={m.checkin_reward_day_n({ n: dayNumber })}
            >
              <span className="text-sm font-semibold">{dayNumber}</span>
              {filled ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
                  <Gift className="size-3" />
                  {count}
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
