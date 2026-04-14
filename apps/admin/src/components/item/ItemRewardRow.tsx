import { useItemDefinitions } from "#/hooks/use-item"

interface Props {
  definitionId: string
  quantity: number
  /** sm: size-4 icon, tighter gap (for inline / tables). md: size-6 icon (for detail cards). */
  size?: "sm" | "md"
  className?: string
}

/**
 * Renders a single reward entry as: [icon] Name × quantity.
 * Falls back to a muted square + truncated id when the definition can't be resolved
 * (e.g. the item was deleted). Uses `useItemDefinitions` which is react-query-cached.
 */
export function ItemRewardRow({
  definitionId,
  quantity,
  size = "md",
  className,
}: Props) {
  const { data: definitions } = useItemDefinitions()
  const def = (definitions ?? []).find((d) => d.id === definitionId)

  const iconClass =
    size === "sm" ? "size-4 shrink-0" : "size-6 shrink-0"
  const gapClass = size === "sm" ? "gap-1.5" : "gap-2"

  return (
    <span className={`inline-flex items-center ${gapClass} ${className ?? ""}`}>
      {def?.icon ? (
        <img src={def.icon} alt="" className={`${iconClass} rounded object-cover`} />
      ) : (
        <span className={`${iconClass} rounded bg-muted`} aria-hidden />
      )}
      {def ? (
        <span className="font-medium">{def.name}</span>
      ) : (
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          {definitionId.slice(0, 8)}…
        </code>
      )}
      <span className="text-muted-foreground">× {quantity}</span>
    </span>
  )
}
