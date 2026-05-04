import { cn } from "#/lib/utils"

export type StatusValue = "active" | "away" | "offline" | "pending"

const STATUS_LABELS: Record<StatusValue, string> = {
  active: "Active",
  away: "Away",
  offline: "Offline",
  pending: "Pending",
}

const STATUS_DOT_CLASS: Record<StatusValue, string> = {
  active: "bg-status-active",
  away: "bg-status-away",
  offline: "bg-status-offline",
  pending: "bg-status-pending",
}

export interface StatusBadgeProps {
  status: StatusValue
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? STATUS_LABELS[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          STATUS_DOT_CLASS[status]
        )}
        aria-hidden
      />
      {displayLabel}
    </span>
  )
}
