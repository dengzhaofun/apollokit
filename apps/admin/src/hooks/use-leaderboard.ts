import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateLeaderboardInput,
  LeaderboardConfig,
  LeaderboardSnapshot,
  LeaderboardTop,
  UpdateLeaderboardInput,
} from "#/lib/types/leaderboard"

const CONFIGS_KEY = ["leaderboard-configs"] as const

export const LEADERBOARD_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated leaderboard configs — URL-driven. */
 
export function useLeaderboardConfigs(route: AnyRoute) {
  return useListSearch<LeaderboardConfig>({
    route,
    queryKey: CONFIGS_KEY,
    filterDefs: LEADERBOARD_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<LeaderboardConfig>>(
        `/api/v1/leaderboard/configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useLeaderboardConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () =>
      api.get<LeaderboardConfig>(`/api/v1/leaderboard/configs/${key}`),
    enabled: !!key,
  })
}

export function useLeaderboardTop(
  key: string,
  params: { endUserId?: string; cycleKey?: string; limit?: number } = {},
) {
  const searchParams = new URLSearchParams()
  if (params.endUserId) searchParams.set("endUserId", params.endUserId)
  if (params.cycleKey) searchParams.set("cycleKey", params.cycleKey)
  if (params.limit) searchParams.set("limit", String(params.limit))
  const query = searchParams.toString()
  return useQuery({
    queryKey: ["leaderboard-top", key, params],
    queryFn: () =>
      api.get<LeaderboardTop>(
        `/api/v1/leaderboard/configs/${key}/top${query ? `?${query}` : ""}`,
      ),
    enabled: !!key,
  })
}

export function useLeaderboardSnapshots(key: string) {
  return useQuery({
    queryKey: ["leaderboard-snapshots", key],
    queryFn: () =>
      api.get<{ items: LeaderboardSnapshot[] }>(
        `/api/v1/leaderboard/configs/${key}/snapshots`,
      ),
    select: (data) => data.items,
    enabled: !!key,
  })
}

export function useCreateLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLeaderboardInput) =>
      api.post<LeaderboardConfig>("/api/v1/leaderboard/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateLeaderboardInput & { id: string }) =>
      api.patch<LeaderboardConfig>(`/api/v1/leaderboard/configs/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/leaderboard/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useRunLeaderboardSettle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ settled: number; errors: number }>("/api/v1/leaderboard/settle/run"),
    onSuccess: () => qc.invalidateQueries(),
  })
}
