import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  Guild,
  GuildSettings,
  UpsertGuildSettingsInput,
} from "#/lib/types/guild"

const SETTINGS_KEY = ["guild-settings"] as const
const GUILDS_KEY = ["guilds"] as const

export function useGuildSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<GuildSettings>("/api/v1/guild/settings"),
  })
}

export function useUpsertGuildSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertGuildSettingsInput) =>
      api.put<GuildSettings>("/api/v1/guild/settings", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

export function useGuilds() {
  return useQuery({
    queryKey: GUILDS_KEY,
    queryFn: () => api.get<{ items: Guild[] }>("/api/v1/guild/guilds"),
    select: (data) => data.items,
  })
}

export function useGuild(id: string) {
  return useQuery({
    queryKey: [...GUILDS_KEY, id],
    queryFn: () => api.get<Guild>(`/api/v1/guild/guilds/${id}`),
    enabled: !!id,
  })
}

export function useDeleteGuild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/guild/guilds/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: GUILDS_KEY }),
  })
}
