import { useQuery } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import { qs as buildQs, useListSearch, type FilterDef, type Page } from "#/hooks/use-list-search"
import type { EndUserAccount } from "#/lib/types/end-user"
import * as m from "#/paraglide/messages.js"

const KEY = ["end-user-account"] as const

export const END_USER_ACCOUNT_FILTER_DEFS: FilterDef[] = [
  {
    id: "providerId",
    label: m.filter_label_provider(),
    type: "select",
    options: [
      { value: "credential", label: m.filter_opt_credential() },
      { value: "google", label: m.filter_opt_google() },
    ],
  },
]

export function useEndUserAccounts(route: AnyRoute) {
  return useListSearch<EndUserAccount>({
    route,
    queryKey: [...KEY, "list"],
    filterDefs: END_USER_ACCOUNT_FILTER_DEFS,
    searchPlaceholder: m.end_user_account_search_placeholder(),
    fetchPage: ({ cursor, limit, filters }) =>
      api.get<Page<EndUserAccount>>(
        `/api/v1/end-user/accounts?${buildQs({ cursor, limit, ...filters })}`,
      ),
  })
}

export function useUserAccounts(userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "by-user", userId ?? ""],
    queryFn: () =>
      api.get<EndUserAccount[]>(
        `/api/v1/end-user/${encodeURIComponent(userId ?? "")}/accounts`,
      ),
    enabled: !!userId,
  })
}
