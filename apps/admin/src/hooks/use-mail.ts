import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

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

const MESSAGES_KEY = ["mail-messages"] as const

export const MAIL_MESSAGE_FILTER_DEFS: FilterDef[] = []

/** Paginated mail messages — URL-driven. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMailMessages(route: any) {
  return useListSearch<MailMessage>({
    route,
    queryKey: MESSAGES_KEY,
    filterDefs: MAIL_MESSAGE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<MailMessage>>(
        `/api/mail/messages?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
  })
}

export function useMailMessage(id: string) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, id],
    queryFn: () => api.get<MailMessageWithStats>(`/api/mail/messages/${id}`),
    enabled: !!id,
  })
}

export function useCreateMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMailInput) =>
      api.post<MailMessage>("/api/mail/messages", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export function useRevokeMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/api/mail/messages/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}

export function useDeleteMailMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/mail/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MESSAGES_KEY }),
  })
}
