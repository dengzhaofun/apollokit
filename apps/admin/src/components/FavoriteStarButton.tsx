import { Star } from "lucide-react"

import {
  useFavorites,
  useToggleFavorite,
} from "#/hooks/use-navigation-favorites"
import { cn } from "#/lib/utils"
import * as m from "../paraglide/messages.js"

/**
 * Star toggle button for the navigation favorites system. Used by the
 * sidebar's hover actions and by the CommandPalette rows.
 *
 * Click stops propagation so it never triggers the parent Link's
 * navigation. Sets `data-favorited="true"` when the route is pinned —
 * callers wrapping it in a hover-revealed slot can use
 * `data-[favorited=true]:opacity-100` to keep filled stars visible
 * outside hover.
 */
export function FavoriteStarButton({
  routePath,
  className,
}: {
  routePath: string
  className?: string
}) {
  const { data: favorites } = useFavorites()
  const toggle = useToggleFavorite()
  const isFav = !!favorites?.some((f) => f.routePath === routePath)

  return (
    <button
      type="button"
      data-favorited={isFav || undefined}
      aria-label={isFav ? m.nav_favorite_remove() : m.nav_favorite_add()}
      title={isFav ? m.nav_favorite_remove() : m.nav_favorite_add()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle.mutate({ routePath, currentlyFavorited: isFav })
      }}
      className={cn(
        "flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isFav && "text-primary hover:text-primary",
        className,
      )}
    >
      <Star className={cn("size-3.5", isFav && "fill-primary")} />
    </button>
  )
}
