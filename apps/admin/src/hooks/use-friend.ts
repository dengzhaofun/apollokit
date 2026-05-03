import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  FriendRelationship,
  FriendSettings,
  UpsertFriendSettingsInput,
} from "#/lib/types/friend"

const SETTINGS_KEY = ["friend-settings"] as const
const RELATIONSHIPS_KEY = ["friend-relationships"] as const

export function useFriendSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<FriendSettings>("/api/v1/friend/settings"),
  })
}

export function useUpsertFriendSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertFriendSettingsInput) =>
      api.put<FriendSettings>("/api/v1/friend/settings", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

export function useFriendRelationships() {
  return useQuery({
    queryKey: RELATIONSHIPS_KEY,
    queryFn: () =>
      api.get<{ items: FriendRelationship[] }>("/api/v1/friend/relationships"),
    select: (data) => data.items,
  })
}

export function useDeleteFriendRelationship() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/friend/relationships/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: RELATIONSHIPS_KEY }),
  })
}
