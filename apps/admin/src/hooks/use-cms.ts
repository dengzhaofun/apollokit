import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CmsEntry,
  CmsType,
  CmsTypeStatus,
  CreateCmsEntryInput,
  CreateCmsTypeInput,
  UpdateCmsEntryInput,
  UpdateCmsTypeInput,
} from "#/lib/types/cms"

const TYPES_KEY = ["cms-types"] as const
const entriesKey = (typeAlias: string) => ["cms-entries", typeAlias] as const

// ─── Types ───────────────────────────────────────────────────────

export const CMS_TYPE_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "archived", label: "Archived" },
    ],
  },
]

/** Paginated CMS types — URL-driven. */
 
export function useCmsTypes(route: AnyRoute) {
  return useListSearch<CmsType>({
    route,
    queryKey: TYPES_KEY,
    filterDefs: CMS_TYPE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CmsType>>(
        `/api/v1/cms/types?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllCmsTypes(opts: { status?: CmsTypeStatus } = {}) {
  const { status } = opts
  return useQuery({
    queryKey: [...TYPES_KEY, "all", { status: status ?? null }],
    queryFn: () =>
      api
        .get<Page<CmsType>>(`/api/v1/cms/types?${buildQs({ limit: 200, status })}`)
        .then((p) => p.items),
  })
}

export function useCmsType(typeKey: string | undefined) {
  return useQuery({
    queryKey: [...TYPES_KEY, "single", typeKey ?? ""],
    queryFn: () => api.get<CmsType>(`/api/v1/cms/types/${typeKey}`),
    enabled: !!typeKey,
  })
}

export function useCreateCmsType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCmsTypeInput) =>
      api.post<CmsType>("/api/v1/cms/types", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

export function useUpdateCmsType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      typeKey,
      ...input
    }: UpdateCmsTypeInput & { typeKey: string }) =>
      api.patch<CmsType>(`/api/v1/cms/types/${typeKey}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TYPES_KEY })
      qc.invalidateQueries({
        queryKey: [...TYPES_KEY, "single", vars.typeKey],
      })
    },
  })
}

export function useDeleteCmsType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (typeKey: string) => api.delete(`/api/v1/cms/types/${typeKey}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

// ─── Entries ─────────────────────────────────────────────────────

export const CMS_ENTRY_FILTER_DEFS: FilterDef[] = [
  {
    id: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
      { value: "archived", label: "Archived" },
    ],
  },
  // groupKey + tag are technically filterable on the server but the
  // current entry list page renders bespoke selectors for them outside
  // the table — they are passed via the `extraQuery` arg below rather
  // than the URL contract. Add them here once the page is ported to
  // the standard filter toolbar.
]

/**
 * Paginated CMS entries under a type — URL-driven.
 *
 * `extraQuery` overrides URL-set filter values; current entry list page
 * uses it to pass status/groupKey/tag from its own selectors.
 */
export function useCmsEntries(
  typeAlias: string | undefined,
  route: AnyRoute,
  extraQuery: { status?: string; groupKey?: string; tag?: string } = {},
) {
  const { status, groupKey, tag } = extraQuery
  return useListSearch<CmsEntry>({
    route,
    queryKey: [
      ...entriesKey(typeAlias ?? ""),
      { status: status ?? null, groupKey: groupKey ?? null, tag: tag ?? null },
    ],
    filterDefs: CMS_ENTRY_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CmsEntry>>(
        `/api/v1/cms/types/${typeAlias}/entries?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          status: status ?? (filters.status as string | undefined),
          groupKey,
          tag,
        })}`,
      ),
    enabled: !!typeAlias,
  })
}

export function useCmsEntry(
  typeAlias: string | undefined,
  entryKey: string | undefined,
) {
  return useQuery({
    queryKey: [...entriesKey(typeAlias ?? ""), "single", entryKey ?? ""],
    queryFn: () =>
      api.get<CmsEntry>(`/api/v1/cms/types/${typeAlias}/entries/${entryKey}`),
    enabled: !!typeAlias && !!entryKey,
  })
}

export function useCreateCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCmsEntryInput) =>
      api.post<CmsEntry>(`/api/v1/cms/types/${typeAlias}/entries`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}

export function useUpdateCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      entryKey,
      ...input
    }: UpdateCmsEntryInput & { entryKey: string }) =>
      api.patch<CmsEntry>(
        `/api/v1/cms/types/${typeAlias}/entries/${entryKey}`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}

export function useDeleteCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryKey: string) =>
      api.delete(`/api/v1/cms/types/${typeAlias}/entries/${entryKey}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}

export function usePublishCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryKey: string) =>
      api.post<CmsEntry>(
        `/api/v1/cms/types/${typeAlias}/entries/${entryKey}/publish`,
        undefined,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}

export function useUnpublishCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryKey: string) =>
      api.post<CmsEntry>(
        `/api/v1/cms/types/${typeAlias}/entries/${entryKey}/unpublish`,
        undefined,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}
