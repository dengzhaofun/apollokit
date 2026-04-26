import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  NavigationFavorite,
  NavigationFavoriteList,
} from "#/lib/types/navigation"

const FAVORITES_KEY = ["navigation", "favorites"] as const

export function useFavorites() {
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: () =>
      api.get<NavigationFavoriteList>("/api/navigation/favorites"),
    select: (data) => data.items,
    // Favorites change rarely after the initial load — staleTime keeps the
    // sidebar from re-fetching on every route change.
    staleTime: 60_000,
  })
}

/**
 * Toggle a favorite on/off. Optimistic — the sidebar updates immediately
 * so hover-star clicks feel instant; we roll back on error.
 *
 * Caller passes `currentlyFavorited` so the mutation knows which side
 * of the toggle to invoke (POST add vs DELETE remove). The hook
 * resolves it from the cache rather than asking, but explicit is
 * faster when the caller already knows (e.g. the star button reads
 * the same data).
 */
export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      routePath,
      currentlyFavorited,
    }: {
      routePath: string
      currentlyFavorited: boolean
    }) => {
      if (currentlyFavorited) {
        await api.delete(
          `/api/navigation/favorites?routePath=${encodeURIComponent(routePath)}`,
        )
        return { removed: routePath }
      }
      const row = await api.post<NavigationFavorite>(
        "/api/navigation/favorites",
        { routePath },
      )
      return { added: row }
    },
    onMutate: async ({ routePath, currentlyFavorited }) => {
      await qc.cancelQueries({ queryKey: FAVORITES_KEY })
      const prev = qc.getQueryData<NavigationFavoriteList>(FAVORITES_KEY)
      if (prev) {
        const items = currentlyFavorited
          ? prev.items.filter((i) => i.routePath !== routePath)
          : [
              {
                // Optimistic placeholder — real id comes back from server.
                // sortOrder = max+1 so it shows up at the top.
                id: `optimistic-${routePath}`,
                organizationId: "",
                userId: "",
                routePath,
                sortOrder:
                  (prev.items[0]?.sortOrder ?? 0) + 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              ...prev.items,
            ]
        qc.setQueryData<NavigationFavoriteList>(FAVORITES_KEY, { items })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(FAVORITES_KEY, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: FAVORITES_KEY })
    },
  })
}

/** Helper for components that want to ask "is this routePath pinned?". */
export function useIsFavorite(routePath: string): boolean {
  const { data } = useFavorites()
  return !!data?.some((f) => f.routePath === routePath)
}
