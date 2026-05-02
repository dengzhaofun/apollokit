import { cn } from "#/lib/utils"
import * as m from "#/paraglide/messages.js"
import type { ExperimentTrafficSlice } from "#/lib/types/experiment"

/**
 * Stacked horizontal bar showing the current sum of traffic_allocation
 * percentages. Renders one colored segment per slice and a "missing"
 * dashed segment for the gap to 100%. The error label below the bar
 * tells the user what's wrong in plain language.
 */
export function TrafficSumBar({
  allocation,
  className,
}: {
  allocation: ExperimentTrafficSlice[]
  className?: string
}) {
  const sum = allocation.reduce((acc, s) => acc + (s.percent || 0), 0)
  const ok = Math.abs(sum - 100) < 0.001
  const diff = Math.max(0, 100 - sum)

  // Stable per-variant color via hue based on string hash.
  const colorFor = (key: string) => {
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 65%, 55%)`
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full border bg-muted">
        {allocation.map((s, i) => {
          const w = Math.max(0, Math.min(100, s.percent))
          if (w === 0) return null
          return (
            <div
              key={`${s.variant_key}-${i}`}
              style={{ width: `${w}%`, background: colorFor(s.variant_key) }}
              title={`${s.variant_key} · ${s.percent}%`}
            />
          )
        })}
        {diff > 0 && (
          <div
            className="border-l border-dashed border-border"
            style={{
              width: `${diff}%`,
              background:
                "repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.04) 4px 8px)",
            }}
            title={`Missing ${diff.toFixed(1)}%`}
          />
        )}
      </div>
      <div
        className={cn(
          "flex items-center justify-between text-xs",
          ok ? "text-muted-foreground" : "text-destructive",
        )}
      >
        <span>
          {m.experiment_traffic_sum()}: {sum.toFixed(1)}%
        </span>
        {!ok && (
          <span>
            {m.experiment_traffic_must_sum_100({ diff: diff.toFixed(1) })}
          </span>
        )}
      </div>
    </div>
  )
}
