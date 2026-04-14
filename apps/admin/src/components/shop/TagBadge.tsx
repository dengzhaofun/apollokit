import type { ShopTag } from "#/lib/types/shop"

interface TagBadgeProps {
  tag: Pick<ShopTag, "name" | "color">
}

export function TagBadge({ tag }: TagBadgeProps) {
  const color = tag.color ?? "#64748b"
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {tag.name}
    </span>
  )
}
