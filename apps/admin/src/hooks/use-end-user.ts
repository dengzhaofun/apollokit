import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  EndUser,
  EndUserOrigin,
  SignOutAllResponse,
  SyncEndUserInput,
  SyncEndUserResponse,
  UpdateEndUserInput,
} from "#/lib/types/end-user"

const END_USERS_KEY = ["end-user"] as const

/**
 * Paginated end-users — server-side cursor pagination + search filter.
 * The `q` of useCursorList maps to the legacy `search` query param.
 */
export function useEndUsers(
  opts: {
    initialPageSize?: number
    origin?: EndUserOrigin
    disabled?: boolean
  } = {},
) {
  const { initialPageSize = 50, origin, disabled } = opts
  return useCursorList<EndUser>({
    queryKey: [
      ...END_USERS_KEY,
      "list",
      { origin: origin ?? null, disabled: disabled ?? null },
    ],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<EndUser>>(
        `/api/end-user?${buildQs({
          cursor,
          limit,
          search: q,
          origin,
          disabled: disabled == null ? undefined : String(disabled),
        })}`,
      ),
    initialPageSize,
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
