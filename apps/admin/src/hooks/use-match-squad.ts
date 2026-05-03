import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateMatchSquadConfigInput,
  Team,
  MatchSquadConfig,
  UpdateMatchSquadConfigInput,
} from "#/lib/types/match-squad"

const CONFIGS_KEY = ["team-configs"] as const
const TEAMS_KEY = ["teams"] as const

export const TEAM_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated team configs — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMatchSquadConfigs(route: any) {
  return useListSearch<MatchSquadConfig>({
    route,
    queryKey: CONFIGS_KEY,
    filterDefs: TEAM_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<MatchSquadConfig>>(
        `/api/v1/match-squad/configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllMatchSquadConfigs() {
  return useQuery({
    queryKey: [...CONFIGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<MatchSquadConfig>>(`/api/v1/match-squad/configs?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useMatchSquadConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () => api.get<MatchSquadConfig>(`/api/v1/match-squad/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateMatchSquadConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMatchSquadConfigInput) =>
      api.post<MatchSquadConfig>("/api/v1/match-squad/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateMatchSquadConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMatchSquadConfigInput }) =>
      api.patch<MatchSquadConfig>(`/api/v1/match-squad/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteMatchSquadConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/match-squad/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export const TEAM_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
      { value: "in_game", label: "In game" },
      { value: "dissolved", label: "Dissolved" },
    ],
  },
]

/**
 * Paginated teams — URL-driven for status/q/cursor.
 *
 * `configKey` is passed via `extraQuery` (route-level scope, not a
 * URL filter) so per-config team lists keep their own URL state without
 * needing the parent to encode the configKey itself.
 */
export function useTeams(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extraQuery: { configKey?: string } = {},
) {
  const { configKey } = extraQuery
  return useListSearch<Team>({
    route,
    queryKey: [...TEAMS_KEY, { configKey: configKey ?? null }],
    filterDefs: TEAM_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Team>>(
        `/api/v1/match-squad/squads?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          configKey,
        })}`,
      ),
  })
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: [...TEAMS_KEY, id],
    queryFn: () => api.get<Team>(`/api/v1/match-squad/squads/${id}`),
    enabled: !!id,
  })
}
