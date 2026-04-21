import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  EndUser,
  EndUserListResponse,
  ListEndUsersQuery,
  SignOutAllResponse,
  SyncEndUserInput,
  SyncEndUserResponse,
  UpdateEndUserInput,
} from "#/lib/types/end-user"

const END_USERS_KEY = ["end-user"] as const

function buildQuery(filter: ListEndUsersQuery | undefined): string {
  if (!filter) return ""
  const p = new URLSearchParams()
  if (filter.search) p.set("search", filter.search)
  if (filter.origin) p.set("origin", filter.origin)
  if (filter.disabled !== undefined) p.set("disabled", String(filter.disabled))
  if (filter.limit) p.set("limit", String(filter.limit))
  if (filter.offset) p.set("offset", String(filter.offset))
  const qs = p.toString()
  return qs ? `?${qs}` : ""
}

export function useEndUsers(filter: ListEndUsersQuery = {}) {
  const qs = buildQuery(filter)
  return useQuery({
    queryKey: [
      ...END_USERS_KEY,
      "list",
      filter.search ?? null,
      filter.origin ?? null,
      filter.disabled ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: () => api.get<EndUserListResponse>(`/api/end-user${qs}`),
  })
}

export function useEndUser(id: string | undefined) {
  return useQuery({
    queryKey: [...END_USERS_KEY, "one", id ?? ""],
    queryFn: () =>
      api.get<EndUser>(`/api/end-user/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  })
}

export function useUpdateEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEndUserInput }) =>
      api.patch<EndUser>(`/api/end-user/${encodeURIComponent(id)}`, input),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: END_USERS_KEY })
      qc.invalidateQueries({ queryKey: [...END_USERS_KEY, "one", vars.id] })
    },
  })
}

export function useDisableEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<EndUser>(`/api/end-user/${encodeURIComponent(id)}/disable`),
    onSuccess: (_row, id) => {
      qc.invalidateQueries({ queryKey: END_USERS_KEY })
      qc.invalidateQueries({ queryKey: [...END_USERS_KEY, "one", id] })
    },
  })
}

export function useEnableEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<EndUser>(`/api/end-user/${encodeURIComponent(id)}/enable`),
    onSuccess: (_row, id) => {
      qc.invalidateQueries({ queryKey: END_USERS_KEY })
      qc.invalidateQueries({ queryKey: [...END_USERS_KEY, "one", id] })
    },
  })
}

export function useSignOutEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<SignOutAllResponse>(
        `/api/end-user/${encodeURIComponent(id)}/sign-out-all`,
      ),
    onSuccess: (_row, id) => {
      qc.invalidateQueries({ queryKey: END_USERS_KEY })
      qc.invalidateQueries({ queryKey: [...END_USERS_KEY, "one", id] })
    },
  })
}

export function useDeleteEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/end-user/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: END_USERS_KEY }),
  })
}

export function useSyncEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SyncEndUserInput) =>
      api.post<SyncEndUserResponse>("/api/end-user/sync", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: END_USERS_KEY }),
  })
}
