import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateTeamConfigInput,
  Team,
  TeamConfig,
  UpdateTeamConfigInput,
} from "#/lib/types/team"

const CONFIGS_KEY = ["team-configs"] as const
const TEAMS_KEY = ["teams"] as const

export const TEAM_CONFIG_FILTER_DEFS: FilterDef[] = []

/** Paginated team configs — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTeamConfigs(route: any) {
  return useListSearch<TeamConfig>({
    route,
    queryKey: CONFIGS_KEY,
    filterDefs: TEAM_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<TeamConfig>>(
        `/api/team/configs?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllTeamConfigs() {
  return useQuery({
    queryKey: [...CONFIGS_KEY, "all"],
    queryFn: () =>
      api
        .get<Page<TeamConfig>>(`/api/team/configs?${buildQs({ limit: 200 })}`)
        .then((p) => p.items),
  })
}

export function useTeamConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () => api.get<TeamConfig>(`/api/team/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateTeamConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTeamConfigInput) =>
      api.post<TeamConfig>("/api/team/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateTeamConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTeamConfigInput }) =>
      api.patch<TeamConfig>(`/api/team/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteTeamConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/team/configs/${id}`),
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
        `/api/team/teams?${buildQs({
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
    queryFn: () => api.get<Team>(`/api/team/teams/${id}`),
    enabled: !!id,
  })
}
