import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  Announcement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "#/lib/types/announcement"

const KEY = ["announcements"] as const

/**
 * Filter defs for the announcement list. Mirrors the server's
 * `announcementFilters` declaration.
 */
export const ANNOUNCEMENT_FILTER_DEFS: FilterDef[] = [
  {
    id: "kind",
    label: "Kind",
    type: "select",
    options: [
      { value: "modal", label: "Modal" },
      { value: "feed", label: "Feed" },
      { value: "ticker", label: "Ticker" },
    ],
  },
  {
    id: "isActive",
    label: "Status",
    type: "boolean",
    trueLabel: "Active",
    falseLabel: "Inactive",
  },
  {
    id: "severity",
    label: "Severity",
    type: "select",
    options: [
      { value: "info", label: "Info" },
      { value: "warning", label: "Warning" },
      { value: "urgent", label: "Urgent" },
    ],
  },
]

/** URL-driven announcements list — wired into <DataTable />. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAnnouncements(route: any) {
  return useListSearch<Announcement>({
    route,
    queryKey: KEY,
    filterDefs: ANNOUNCEMENT_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<Announcement>>(
        `/api/v1/announcement?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
        })}`,
      ),
  })
}

export function useAnnouncement(alias: string) {
  return useQuery({
    queryKey: [...KEY, alias],
    queryFn: () =>
      api.get<Announcement>(`/api/v1/announcement/${encodeURIComponent(alias)}`),
    enabled: !!alias,
  })
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      api.post<Announcement>("/api/v1/announcement", input),
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
        `/api/v1/announcement/${encodeURIComponent(alias)}`,
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
      api.delete(`/api/v1/announcement/${encodeURIComponent(alias)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
