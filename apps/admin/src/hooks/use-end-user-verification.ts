import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import { qs as buildQs, useListSearch, type Page } from "#/hooks/use-list-search"
import type { EndUserVerification } from "#/lib/types/end-user"
import * as m from "#/paraglide/messages.js"

const KEY = ["end-user-verification"] as const

export function useEndUserVerifications(route: AnyRoute) {
  return useListSearch<EndUserVerification>({
    route,
    queryKey: [...KEY, "list"],
    filterDefs: [],
    searchPlaceholder: m.end_user_verification_search_placeholder(),
    fetchPage: ({ cursor, limit }) =>
      api.get<Page<EndUserVerification>>(
        `/api/v1/end-user/verifications?${buildQs({ cursor, limit })}`,
      ),
  })
}
