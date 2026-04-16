import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateTeamConfigInput,
  Team,
  TeamConfig,
  UpdateTeamConfigInput,
} from "#/lib/types/team"

const CONFIGS_KEY = ["team-configs"] as const
const TEAMS_KEY = ["teams"] as const

export function useTeamConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: () => api.get<{ items: TeamConfig[] }>("/api/team/configs"),
    select: (data) => data.items,
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

export function useTeams() {
  return useQuery({
    queryKey: TEAMS_KEY,
    queryFn: () => api.get<{ items: Team[] }>("/api/team/teams"),
    select: (data) => data.items,
  })
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: [...TEAMS_KEY, id],
    queryFn: () => api.get<Team>(`/api/team/teams/${id}`),
    enabled: !!id,
  })
}
