import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  EndUser,
  SignOutAllResponse,
  SyncEndUserInput,
  SyncEndUserResponse,
  UpdateEndUserInput,
} from "#/lib/types/end-user"

const END_USERS_KEY = ["end-user"] as const

/**
 * Filter definitions for the end-user list page. Mirrors the server's
 * `endUserFilters` declaration in `apps/server/src/modules/end-user/validators.ts`
 * — keep these two in sync. The toolbar uses these for facet rendering;
 * the QueryBuilder (advanced mode) reads them for field/operator menus.
 *
 * The hook flattens the values into URL params using the same key
 * convention the server expects (`origin`, `disabled`, `createdAtGte`, …),
 * so the only thing list-page state and server contract share is the
 * key naming.
 */
export const END_USER_FILTER_DEFS: FilterDef[] = [
  {
    id: "origin",
    label: "Origin",
    type: "select",
    options: [
      { value: "managed", label: "Managed" },
      { value: "synced", label: "Synced" },
    ],
  },
  {
    id: "disabled",
    label: "Status",
    type: "boolean",
    trueLabel: "Disabled",
    falseLabel: "Active",
  },
  {
    id: "emailVerified",
    label: "Email verified",
    type: "boolean",
  },
  {
    id: "createdAt",
    label: "Created",
    type: "dateRange",
  },
]

/**
 * Paginated end-users — URL-driven (search/filters/cursor/pageSize/mode/adv
 * all live in the route's search params). Drop-in replacement for the
 * legacy `useEndUsers({ origin, disabled })` API.
 *
 * The hook needs the route handle to read/write search params via
 * TanStack Router's typed search-param API; pass `Route` from the
 * file route module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEndUsers(route: any) {
  return useListSearch<EndUser>({
    route,
    queryKey: [...END_USERS_KEY, "list"],
    filterDefs: END_USER_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<EndUser>>(
        `/api/v1/end-user?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
        })}`,
      ),
  })
}

export function useEndUser(id: string | undefined) {
  return useQuery({
    queryKey: [...END_USERS_KEY, "one", id ?? ""],
    queryFn: () =>
      api.get<EndUser>(`/api/v1/end-user/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  })
}

export function useUpdateEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEndUserInput }) =>
      api.patch<EndUser>(`/api/v1/end-user/${encodeURIComponent(id)}`, input),
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
      api.post<EndUser>(`/api/v1/end-user/${encodeURIComponent(id)}/disable`),
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
      api.post<EndUser>(`/api/v1/end-user/${encodeURIComponent(id)}/enable`),
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
        `/api/v1/end-user/${encodeURIComponent(id)}/sign-out-all`,
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
      api.delete(`/api/v1/end-user/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: END_USERS_KEY }),
  })
}

export function useSyncEndUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SyncEndUserInput) =>
      api.post<SyncEndUserResponse>("/api/v1/end-user/sync", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: END_USERS_KEY }),
  })
}
