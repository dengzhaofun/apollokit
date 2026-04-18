import { useRewardCatalog } from "#/hooks/use-reward-catalog"
import type { RewardEntry, RewardType } from "#/lib/types/rewards"

interface Props {
  /**
   * Polymorphic entry preferred. The old `definitionId` + `quantity`
   * shape is still accepted for legacy callers (they are treated as
   * `type: "item"`) — the ternary below keeps call sites compiling
   * until they migrate.
   */
  entry?: RewardEntry
  definitionId?: string
  quantity?: number
  /** sm: size-4 icon, tighter gap (for inline / tables). md: size-6 icon (for detail cards). */
  size?: "sm" | "md"
  className?: string
}

/**
 * Renders a single reward entry as: [icon] Name × count. Resolves the
 * display name against `useRewardCatalog()` so all three target types
 * (item / currency / entity) render uniformly. Falls back to a muted
 * square + truncated id when the target can't be resolved (e.g. deleted).
 */
export function ItemRewardRow({
  entry,
  definitionId,
  quantity,
  size = "md",
  className,
}: Props) {
  const { byType } = useRewardCatalog()

  const type: RewardType = entry?.type ?? "item"
  const id = entry?.id ?? definitionId ?? ""
  const count = entry?.count ?? quantity ?? 0

  const opt = byType[type].find((o) => o.id === id)

  const iconClass =
    size === "sm" ? "size-4 shrink-0" : "size-6 shrink-0"
  const gapClass = size === "sm" ? "gap-1.5" : "gap-2"

  return (
    <span className={`inline-flex items-center ${gapClass} ${className ?? ""}`}>
      {opt?.icon ? (
        <img
          src={opt.icon}
          alt=""
          className={`${iconClass} rounded object-cover`}
        />
      ) : (
        <span className={`${iconClass} rounded bg-muted`} aria-hidden />
      )}
      {opt ? (
        <span className="font-medium">{opt.name}</span>
      ) : (
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          {id.slice(0, 8)}…
        </code>
      )}
      <span className="text-muted-foreground">× {count}</span>
    </span>
  )
}
