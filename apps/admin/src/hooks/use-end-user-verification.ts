import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import { qs as buildQs, useListSearch, type Page } from "#/hooks/use-list-search"
import type { EndUserVerification } from "#/lib/types/end-user"

const KEY = ["end-user-verification"] as const

export function useEndUserVerifications(route: AnyRoute) {
  return useListSearch<EndUserVerification>({
    route,
    queryKey: [...KEY, "list"],
    filterDefs: [],
    fetchPage: ({ cursor, limit }) =>
      api.get<Page<EndUserVerification>>(
        `/api/v1/end-user/verifications?${buildQs({ cursor, limit })}`,
      ),
  })
}
