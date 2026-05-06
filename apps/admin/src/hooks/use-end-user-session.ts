import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import { qs as buildQs, useListSearch, type FilterDef, type Page } from "#/hooks/use-list-search"
import type { EndUserSession } from "#/lib/types/end-user"
import * as m from "#/paraglide/messages.js"

const KEY = ["end-user-session"] as const
const END_USERS_KEY = ["end-user"] as const

export const END_USER_SESSION_FILTER_DEFS: FilterDef[] = []

export function useEndUserSessions(route: AnyRoute) {
  return useListSearch<EndUserSession>({
    route,
    queryKey: [...KEY, "list"],
    filterDefs: END_USER_SESSION_FILTER_DEFS,
    searchPlaceholder: m.end_user_session_search_placeholder(),
    fetchPage: ({ cursor, limit }) =>
      api.get<Page<EndUserSession>>(
        `/api/v1/end-user/sessions?${buildQs({ cursor, limit })}`,
      ),
  })
}

export function useUserSessions(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "by-user", userId ?? ""],
    queryFn: () =>
      api.get<EndUserSession[]>(
        `/api/v1/end-user/${encodeURIComponent(userId ?? "")}/sessions`,
      ),
    enabled: !!userId,
  })
}

export function useRevokeEndUserSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, sessionId }: { userId: string; sessionId: string }) =>
      api.delete(
        `/api/v1/end-user/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: [...KEY, "by-user", vars.userId] })
      qc.invalidateQueries({ queryKey: [...END_USERS_KEY, "one", vars.userId] })
    },
  })
}
