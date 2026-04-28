import { Badge } from "#/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"
import type { ActivityPhase } from "#/hooks/use-activity"
import * as m from "#/paraglide/messages.js"

/**
 * Visual phase indicator for an activity. Reflects the LIVE phase
 * (computed from times via `deriveState` on the server), not the
 * cron-persisted `status` column.
 *
 * Color signal:
 *   - active   → green (default badge) — players can do everything
 *   - settling → blue/secondary       — claims still allowed, no new participation
 *   - teasing  → yellow/outline       — visible but participation blocked
 *   - ended/archived → gray/outline   — read-only / hidden
 *   - draft/scheduled → outline       — not yet exposed to players
 */
const PHASE_VARIANT: Record<
  ActivityPhase,
  {
    variant: "default" | "secondary" | "outline" | "destructive"
    className?: string
  }
> = {
  draft: { variant: "outline" },
  scheduled: { variant: "outline" },
  teasing: {
    variant: "outline",
    className: "border-yellow-500 text-yellow-700 dark:text-yellow-300",
  },
  active: {
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600",
  },
  settling: { variant: "secondary" },
  ended: { variant: "outline", className: "text-muted-foreground" },
  archived: { variant: "outline", className: "text-muted-foreground" },
}

function phaseLabel(phase: ActivityPhase): string {
  switch (phase) {
    case "draft":
      return m.activity_phase_draft()
    case "scheduled":
      return m.activity_phase_scheduled()
    case "teasing":
      return m.activity_phase_teasing()
    case "active":
      return m.activity_phase_active()
    case "settling":
      return m.activity_phase_settling()
    case "ended":
      return m.activity_phase_ended()
    case "archived":
      return m.activity_phase_archived()
  }
}

function phaseTooltip(phase: ActivityPhase): string {
  switch (phase) {
    case "draft":
      return m.activity_phase_draft_tooltip()
    case "scheduled":
      return m.activity_phase_scheduled_tooltip()
    case "teasing":
      return m.activity_phase_teasing_tooltip()
    case "active":
      return m.activity_phase_active_tooltip()
    case "settling":
      return m.activity_phase_settling_tooltip()
    case "ended":
      return m.activity_phase_ended_tooltip()
    case "archived":
      return m.activity_phase_archived_tooltip()
  }
}

export function ActivityPhaseBadge({
  phase,
  className,
}: {
  phase: ActivityPhase
  className?: string
}) {
  const style = PHASE_VARIANT[phase]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant={style.variant}
            className={[style.className, className].filter(Boolean).join(" ")}
          >
            {phaseLabel(phase)}
          </Badge>
        }
      />
      <TooltipContent>{phaseTooltip(phase)}</TooltipContent>
    </Tooltip>
  )
}
