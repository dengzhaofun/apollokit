import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AnyRoute } from "@tanstack/react-router"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CreateMailInput,
  MailMessage,
  MailMessageWithStats,
} from "#/lib/types/mail"
import * as m from "#/paraglide/messages.js"

const MESSAGES_KEY = ["mail-messages"] as const

export const MAIL_MESSAGE_FILTER_DEFS: FilterDef[] = [
  {
    id: "targetType",
    label: m.mail_filter_target_type(),
    type: "select",
    options: [
      { value: "broadcast", label: m.mail_filter_target_type_broadcast() },
      { value: "multicast", label: m.mail_filter_target_type_multicast() },
    ],
  },
]

/** Paginated mail messages — URL-driven. */
 
export function useMailMessages(route: AnyRoute) {
  return useListSearch<MailMessage>({
    route,
    queryKey: MESSAGES_KEY,
    filterDefs: MAIL_MESSAGE_FILTER_DEFS,
    searchPlaceholder: m.mail_message_search_placeholder(),
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<MailMessage>>(
        `/api/v1/mail/messages?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useMailMessage(id: string) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, id],
    queryFn: () => api.get<MailMessageWithStats>(`/api/v1/mail/messages/${id}`),
    enabled: !!id,
  })
}

export function useCreateMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMailInput) =>
      api.post<MailMessage>("/api/v1/mail/messages", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export function useRevokeMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/api/v1/mail/messages/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export function useDeleteMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/mail/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}
