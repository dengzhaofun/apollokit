import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CatalogEventView,
  CatalogListResponse,
  UpdateEventCatalogInput,
} from "#/lib/types/event-catalog"

const CATALOG_KEY = ["event-catalog"] as const
const entryKey = (name: string) => ["event-catalog", name] as const

export function useEventCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api.get<CatalogListResponse>("/api/event-catalog"),
    select: (data) => data.items,
  })
}

export function useEventCatalogEntry(name: string) {
  return useQuery({
    queryKey: entryKey(name),
    queryFn: () =>
      api.get<CatalogEventView>(
        `/api/event-catalog/${encodeURIComponent(name)}`,
      ),
    enabled: !!name,
  })
}

export function useUpdateEventCatalogEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      input,
    }: {
      name: string
      input: UpdateEventCatalogInput
    }) =>
      api.patch<CatalogEventView>(
        `/api/event-catalog/${encodeURIComponent(name)}`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: CATALOG_KEY })
      qc.invalidateQueries({ queryKey: entryKey(vars.name) })
    },
  })
}
