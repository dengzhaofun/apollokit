import { Badge } from "#/components/ui/badge"
import type { ExperimentStatus } from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

const STATUS_LABEL: Record<ExperimentStatus, () => string> = {
  draft: () => m.experiment_status_draft(),
  running: () => m.experiment_status_running(),
  paused: () => m.experiment_status_paused(),
  archived: () => m.experiment_status_archived(),
}

const STATUS_VARIANT: Record<
  ExperimentStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  running: "default",
  paused: "secondary",
  archived: "outline",
}

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className={status === "archived" ? "opacity-60" : undefined}
    >
      {STATUS_LABEL[status]()}
    </Badge>
  )
}
