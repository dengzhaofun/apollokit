import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  InviteRelationshipList,
  InviteRelationshipListQuery,
  InviteSettings,
  UpsertInviteSettingsInput,
} from "#/lib/types/invite"

const SETTINGS_KEY = ["invite-settings"] as const
const RELATIONSHIPS_KEY = ["invite-relationships"] as const

export function useInviteSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<InviteSettings | null>("/api/invite/settings"),
  })
}

export function useUpsertInviteSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertInviteSettingsInput) =>
      api.put<InviteSettings>("/api/invite/settings", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}

export function useInviteRelationships(query: InviteRelationshipListQuery = {}) {
  const params = new URLSearchParams()
  if (query.limit != null) params.set("limit", String(query.limit))
  if (query.offset != null) params.set("offset", String(query.offset))
  if (query.inviterEndUserId) params.set("inviterEndUserId", query.inviterEndUserId)
  if (query.qualifiedOnly) params.set("qualifiedOnly", "true")
  const qs = params.toString()
  return useQuery({
    queryKey: [...RELATIONSHIPS_KEY, query] as const,
    queryFn: () =>
      api.get<InviteRelationshipList>(`/api/invite/relationships${qs ? `?${qs}` : ""}`),
  })
}

export function useDeleteInviteRelationship() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/invite/relationships/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RELATIONSHIPS_KEY }),
  })
}
