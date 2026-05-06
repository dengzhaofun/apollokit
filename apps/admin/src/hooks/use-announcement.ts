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
  Announcement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "#/lib/types/announcement"
import * as m from "#/paraglide/messages.js"

const KEY = ["announcements"] as const

/**
 * Filter defs for the announcement list. Mirrors the server's
 * `announcementFilters` declaration.
 */
export const ANNOUNCEMENT_FILTER_DEFS: FilterDef[] = [
  {
    id: "kind",
    label: m.filter_label_kind(),
    type: "select",
    options: [
      { value: "modal", label: m.filter_opt_modal() },
      { value: "feed", label: m.filter_opt_feed() },
      { value: "ticker", label: m.filter_opt_ticker() },
    ],
  },
  {
    id: "isActive",
    label: m.filter_label_status(),
    type: "boolean",
    trueLabel: m.filter_opt_active(),
    falseLabel: m.filter_opt_inactive(),
  },
  {
    id: "severity",
    label: m.filter_label_severity(),
    type: "select",
    options: [
      { value: "info", label: m.filter_opt_info() },
      { value: "warning", label: m.filter_opt_warning() },
      { value: "urgent", label: m.filter_opt_urgent() },
    ],
  },
]

/** URL-driven announcements list — wired into <DataTable />. */
 
export function useAnnouncements(route: AnyRoute) {
  return useListSearch<Announcement>({
    route,
    queryKey: KEY,
    filterDefs: ANNOUNCEMENT_FILTER_DEFS,
    searchPlaceholder: m.announcement_search_placeholder(),
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
