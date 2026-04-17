import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateLeaderboardInput,
  LeaderboardConfig,
  LeaderboardSnapshot,
  LeaderboardTop,
  UpdateLeaderboardInput,
} from "#/lib/types/leaderboard"

const CONFIGS_KEY = ["leaderboard-configs"] as const

export function useLeaderboardConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: () =>
      api.get<{ items: LeaderboardConfig[] }>("/api/leaderboard/configs"),
    select: (data) => data.items,
  })
}

export function useLeaderboardConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () =>
      api.get<LeaderboardConfig>(`/api/leaderboard/configs/${key}`),
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
        `/api/leaderboard/configs/${key}/top${query ? `?${query}` : ""}`,
      ),
    enabled: !!key,
  })
}

export function useLeaderboardSnapshots(key: string) {
  return useQuery({
    queryKey: ["leaderboard-snapshots", key],
    queryFn: () =>
      api.get<{ items: LeaderboardSnapshot[] }>(
        `/api/leaderboard/configs/${key}/snapshots`,
      ),
    select: (data) => data.items,
    enabled: !!key,
  })
}

export function useCreateLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLeaderboardInput) =>
      api.post<LeaderboardConfig>("/api/leaderboard/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateLeaderboardInput & { id: string }) =>
      api.patch<LeaderboardConfig>(`/api/leaderboard/configs/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteLeaderboardConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/leaderboard/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useRunLeaderboardSettle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ settled: number; errors: number }>("/api/leaderboard/settle/run"),
    onSuccess: () => qc.invalidateQueries(),
  })
}
