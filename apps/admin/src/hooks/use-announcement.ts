import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  Announcement,
  AnnouncementListFilter,
  AnnouncementListResponse,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "#/lib/types/announcement"

const KEY = ["announcements"] as const

export function useAnnouncements(filter: AnnouncementListFilter = {}) {
  const params = new URLSearchParams()
  if (filter.kind) params.set("kind", filter.kind)
  if (filter.isActive !== undefined)
    params.set("isActive", filter.isActive ? "true" : "false")
  if (filter.q) params.set("q", filter.q)
  const qs = params.toString()
  return useQuery({
    queryKey: [
      ...KEY,
      filter.kind ?? null,
      filter.isActive ?? null,
      filter.q ?? null,
    ],
    queryFn: () =>
      api.get<AnnouncementListResponse>(
        `/api/announcement${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
  })
}

export function useAnnouncement(alias: string) {
  return useQuery({
    queryKey: [...KEY, alias],
    queryFn: () =>
      api.get<Announcement>(`/api/announcement/${encodeURIComponent(alias)}`),
    enabled: !!alias,
  })
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      api.post<Announcement>("/api/announcement", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      alias,
      input,
    }: {
      alias: string
      input: UpdateAnnouncementInput
    }) =>
      api.patch<Announcement>(
        `/api/announcement/${encodeURIComponent(alias)}`,
        input,
      ),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: [...KEY, vars.alias] })
    },
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (alias: string) =>
      api.delete(`/api/announcement/${encodeURIComponent(alias)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
