import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  AdjustRankPlayerInput,
  CreateRankSeasonInput,
  CreateRankTierConfigInput,
  RankFinalizeResult,
  RankMatchDetail,
  RankMatchListResponse,
  RankPlayerListResponse,
  RankPlayerView,
  RankSeason,
  RankTierConfig,
  RankTierConfigListResponse,
  UpdateRankSeasonInput,
  UpdateRankTierConfigInput,
} from "#/lib/types/rank"

const TIER_CONFIGS_KEY = ["rank", "tier-configs"] as const
const SEASONS_KEY = ["rank", "seasons"] as const
const PLAYERS_KEY = ["rank", "players"] as const
const MATCHES_KEY = ["rank", "matches"] as const

// ─── Tier configs ─────────────────────────────────────────────────

export function useRankTierConfigs() {
  return useQuery({
    queryKey: TIER_CONFIGS_KEY,
    queryFn: () =>
      api.get<RankTierConfigListResponse>("/api/rank/tier-configs"),
    select: (data) => data.items,
  })
}

export function useRankTierConfig(key: string | undefined) {
  return useQuery({
    queryKey: [...TIER_CONFIGS_KEY, key ?? ""],
    queryFn: () =>
      api.get<RankTierConfig>(
        `/api/rank/tier-configs/${encodeURIComponent(key ?? "")}`,
      ),
    enabled: !!key,
  })
}

export function useCreateRankTierConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRankTierConfigInput) =>
      api.post<RankTierConfig>("/api/rank/tier-configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIER_CONFIGS_KEY }),
  })
}

export function useUpdateRankTierConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      input,
    }: {
      key: string
      input: UpdateRankTierConfigInput
    }) =>
      api.patch<RankTierConfig>(
        `/api/rank/tier-configs/${encodeURIComponent(key)}`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: TIER_CONFIGS_KEY })
      qc.invalidateQueries({ queryKey: [...TIER_CONFIGS_KEY, vars.key] })
    },
  })
}

export function useDeleteRankTierConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/rank/tier-configs/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIER_CONFIGS_KEY }),
  })
}

// ─── Seasons ─────────────────────────────────────────────────────

export const RANK_SEASON_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "upcoming", label: "Upcoming" },
      { value: "active", label: "Active" },
      { value: "finished", label: "Finished" },
    ],
  },
  {
    id: "tierConfigId",
    label: "Tier config",
    type: "select",
    options: [],
  },
]

/** Paginated rank seasons — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRankSeasons(route: any) {
  return useListSearch<RankSeason>({
    route,
    queryKey: SEASONS_KEY,
    filterDefs: RANK_SEASON_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<RankSeason>>(
        `/api/rank/seasons?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useRankSeason(id: string | undefined) {
  return useQuery({
    queryKey: [...SEASONS_KEY, id ?? ""],
    queryFn: () => api.get<RankSeason>(`/api/rank/seasons/${id}`),
    enabled: !!id,
  })
}

export function useCreateRankSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRankSeasonInput) =>
      api.post<RankSeason>("/api/rank/seasons", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SEASONS_KEY }),
  })
}

export function useUpdateRankSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRankSeasonInput }) =>
      api.patch<RankSeason>(`/api/rank/seasons/${id}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: SEASONS_KEY })
      qc.invalidateQueries({ queryKey: [...SEASONS_KEY, vars.id] })
    },
  })
}

export function useActivateRankSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<RankSeason>(`/api/rank/seasons/${id}/activate`),
    onSuccess: (_row, id) => {
      qc.invalidateQueries({ queryKey: SEASONS_KEY })
      qc.invalidateQueries({ queryKey: [...SEASONS_KEY, id] })
    },
  })
}

export function useFinalizeRankSeason() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<RankFinalizeResult>(`/api/rank/seasons/${id}/finalize`),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: SEASONS_KEY })
      qc.invalidateQueries({ queryKey: [...SEASONS_KEY, id] })
      qc.invalidateQueries({ queryKey: PLAYERS_KEY })
    },
  })
}

// ─── Player states ──────────────────────────────────────────────

export function useRankSeasonPlayers(
  seasonId: string | undefined,
  filter: { tierId?: string; endUserId?: string; limit?: number } = {},
) {
  const params = new URLSearchParams()
  if (filter.tierId) params.set("tierId", filter.tierId)
  if (filter.endUserId) params.set("endUserId", filter.endUserId)
  if (filter.limit) params.set("limit", String(filter.limit))
  const qs = params.toString()
  return useQuery({
    queryKey: [
      ...PLAYERS_KEY,
      seasonId ?? "",
      filter.tierId ?? null,
      filter.endUserId ?? null,
      filter.limit ?? null,
    ],
    queryFn: () =>
      api.get<RankPlayerListResponse>(
        `/api/rank/seasons/${seasonId}/players${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
    enabled: !!seasonId,
  })
}

export function useAdjustRankPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      seasonId,
      endUserId,
      input,
    }: {
      seasonId: string
      endUserId: string
      input: AdjustRankPlayerInput
    }) =>
      api.patch<RankPlayerView>(
        `/api/rank/seasons/${seasonId}/players/${encodeURIComponent(endUserId)}`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLAYERS_KEY }),
  })
}

// ─── Matches ───────────────────────────────────────────────────

export function useRankSeasonMatches(
  seasonId: string | undefined,
  filter: { limit?: number; cursor?: string } = {},
) {
  const params = new URLSearchParams()
  if (filter.limit) params.set("limit", String(filter.limit))
  if (filter.cursor) params.set("cursor", filter.cursor)
  const qs = params.toString()
  return useQuery({
    queryKey: [
      ...MATCHES_KEY,
      seasonId ?? "",
      filter.limit ?? null,
      filter.cursor ?? null,
    ],
    queryFn: () =>
      api.get<RankMatchListResponse>(
        `/api/rank/seasons/${seasonId}/matches${qs ? `?${qs}` : ""}`,
      ),
    enabled: !!seasonId,
  })
}

export function useRankMatch(id: string | undefined) {
  return useQuery({
    queryKey: [...MATCHES_KEY, "detail", id ?? ""],
    queryFn: () => api.get<RankMatchDetail>(`/api/rank/matches/${id}`),
    enabled: !!id,
  })
}
