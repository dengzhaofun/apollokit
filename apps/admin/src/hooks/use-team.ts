import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateTeamConfigInput,
  Team,
  TeamConfig,
  UpdateTeamConfigInput,
} from "#/lib/types/team"

const CONFIGS_KEY = ["team-configs"] as const
const TEAMS_KEY = ["teams"] as const

/** Paginated team configs — for the admin configs table. */
export function useTeamConfigs(initialPageSize = 50) {
  return useCursorList<TeamConfig>({
    queryKey: CONFIGS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<TeamConfig>>(`/api/team/configs?${buildQs({ cursor, limit, q })}`),
    initialPageSize,
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

/** Paginated teams — supports configKey + status filters. */
export function useTeams(
  opts: { configKey?: string; status?: string; initialPageSize?: number } = {},
) {
  const { configKey, status, initialPageSize = 50 } = opts
  return useCursorList<Team>({
    queryKey: [...TEAMS_KEY, { configKey: configKey ?? null, status: status ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<Team>>(
        `/api/team/teams?${buildQs({ cursor, limit, q, configKey, status })}`,
      ),
    initialPageSize,
  })
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: [...TEAMS_KEY, id],
    queryFn: () => api.get<Team>(`/api/team/teams/${id}`),
    enabled: !!id,
  })
}
