import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CmsEntry,
  CmsType,
  CmsTypeStatus,
  CreateCmsEntryInput,
  CreateCmsTypeInput,
  ListEntriesFilter,
  UpdateCmsEntryInput,
  UpdateCmsTypeInput,
} from "#/lib/types/cms"

const TYPES_KEY = ["cms-types"] as const
const entriesKey = (typeAlias: string) => ["cms-entries", typeAlias] as const

// ─── Types ───────────────────────────────────────────────────────

/** Paginated CMS types — for the admin types table. */
export function useCmsTypes(
  opts: { status?: CmsTypeStatus; initialPageSize?: number } = {},
) {
  const { status, initialPageSize = 50 } = opts
  return useCursorList<CmsType>({
    queryKey: [...TYPES_KEY, { status: status ?? null }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CmsType>>(
        `/api/cms/types?${buildQs({ cursor, limit, q, status })}`,
      ),
    initialPageSize,
  })
}

/** Non-paginated convenience for selectors (200 cap). */
export function useAllCmsTypes(opts: { status?: CmsTypeStatus } = {}) {
  const { status } = opts
  return useQuery({
    queryKey: [...TYPES_KEY, "all", { status: status ?? null }],
    queryFn: () =>
      api
        .get<Page<CmsType>>(`/api/cms/types?${buildQs({ limit: 200, status })}`)
        .then((p) => p.items),
  })
}

export function useCmsType(typeKey: string | undefined) {
  return useQuery({
    queryKey: [...TYPES_KEY, "single", typeKey ?? ""],
    queryFn: () => api.get<CmsType>(`/api/cms/types/${typeKey}`),
    enabled: !!typeKey,
  })
}

export function useCreateCmsType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCmsTypeInput) =>
      api.post<CmsType>("/api/cms/types", input),
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
      api.patch<CmsType>(`/api/cms/types/${typeKey}`, input),
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
    mutationFn: (typeKey: string) => api.delete(`/api/cms/types/${typeKey}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TYPES_KEY }),
  })
}

// ─── Entries ─────────────────────────────────────────────────────

/** Paginated CMS entries under a type — for the admin entries table. */
export function useCmsEntries(
  typeAlias: string | undefined,
  filter: Omit<ListEntriesFilter, "limit" | "offset" | "q"> & {
    initialPageSize?: number
  } = {},
) {
  const { status, groupKey, tag, initialPageSize = 50 } = filter
  return useCursorList<CmsEntry>({
    queryKey: [
      ...entriesKey(typeAlias ?? ""),
      { status: status ?? null, groupKey: groupKey ?? null, tag: tag ?? null },
    ],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CmsEntry>>(
        `/api/cms/types/${typeAlias}/entries?${buildQs({
          cursor,
          limit,
          q,
          status,
          groupKey,
          tag,
        })}`,
      ),
    initialPageSize,
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
      api.get<CmsEntry>(`/api/cms/types/${typeAlias}/entries/${entryKey}`),
    enabled: !!typeAlias && !!entryKey,
  })
}

export function useCreateCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCmsEntryInput) =>
      api.post<CmsEntry>(`/api/cms/types/${typeAlias}/entries`, input),
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
        `/api/cms/types/${typeAlias}/entries/${entryKey}`,
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
      api.delete(`/api/cms/types/${typeAlias}/entries/${entryKey}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}

export function usePublishCmsEntry(typeAlias: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryKey: string) =>
      api.post<CmsEntry>(
        `/api/cms/types/${typeAlias}/entries/${entryKey}/publish`,
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
        `/api/cms/types/${typeAlias}/entries/${entryKey}/unpublish`,
        undefined,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: entriesKey(typeAlias) }),
  })
}
