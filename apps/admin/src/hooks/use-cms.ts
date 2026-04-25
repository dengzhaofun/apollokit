import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
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

export function useCmsTypes(filter: { status?: CmsTypeStatus } = {}) {
  const qs = filter.status ? `?status=${filter.status}` : ""
  return useQuery({
    queryKey: [...TYPES_KEY, filter.status ?? "all"],
    queryFn: () => api.get<{ items: CmsType[] }>(`/api/cms/types${qs}`),
    select: (data) => data.items,
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

export function useCmsEntries(
  typeAlias: string | undefined,
  filter: ListEntriesFilter = {},
) {
  const params = new URLSearchParams()
  if (filter.status) params.set("status", filter.status)
  if (filter.groupKey) params.set("groupKey", filter.groupKey)
  if (filter.tag) params.set("tag", filter.tag)
  if (filter.q) params.set("q", filter.q)
  if (filter.limit) params.set("limit", String(filter.limit))
  if (filter.offset) params.set("offset", String(filter.offset))
  const qs = params.toString()
  return useQuery({
    queryKey: [...entriesKey(typeAlias ?? ""), filter],
    queryFn: () =>
      api.get<{ items: CmsEntry[]; total: number }>(
        `/api/cms/types/${typeAlias}/entries${qs ? `?${qs}` : ""}`,
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
