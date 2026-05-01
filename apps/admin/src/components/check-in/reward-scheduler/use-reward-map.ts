import { useMemo } from "react"

import type { CheckInConfig } from "#/lib/types/check-in"
import type { CheckInReward } from "#/lib/types/check-in-reward"

export interface RewardMap {
  byDay: Map<number, CheckInReward>
  orphans: CheckInReward[]
  /** Inclusive upper bound for valid dayNumbers under this config. `null` = no upper bound. */
  maxDay: number | null
}

export function maxDayForConfig(config: CheckInConfig): number | null {
  if (config.resetMode === "week") return 7
  if (config.resetMode === "month") return 31
  if (config.resetMode === "none" && config.target != null) return config.target
  return null
}

/**
 * Index rewards by dayNumber for O(1) cell lookup, and split out any rows
 * whose dayNumber falls outside the current resetMode/target bound. Those
 * are rendered as "orphans" — typically the result of a mode change after
 * rewards were authored, or hand-edited DB rows.
 *
 * Accepts `undefined` config so the caller can invoke this hook before
 * its `useQuery` resolves without violating the Rules of Hooks.
 */
export function useRewardMap(
  config: CheckInConfig | undefined,
  rewards: CheckInReward[] | undefined,
): RewardMap {
  return useMemo(() => {
    if (!config) {
      return { byDay: new Map(), orphans: [], maxDay: null }
    }
    const max = maxDayForConfig(config)
    const byDay = new Map<number, CheckInReward>()
    const orphans: CheckInReward[] = []
    for (const r of rewards ?? []) {
      if (max != null && r.dayNumber > max) {
        orphans.push(r)
      } else {
        byDay.set(r.dayNumber, r)
      }
    }
    orphans.sort((a, b) => a.dayNumber - b.dayNumber)
    return { byDay, orphans, maxDay: max }
  }, [config, rewards])
}
