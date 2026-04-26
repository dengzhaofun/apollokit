import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CreateMailInput,
  MailMessage,
  MailMessageWithStats,
} from "#/lib/types/mail"

const MESSAGES_KEY = ["mail-messages"] as const

/** Paginated mail messages — for the admin MessageTable. */
export function useMailMessages(initialPageSize = 50) {
  return useCursorList<MailMessage>({
    queryKey: MESSAGES_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<MailMessage>>(
        `/api/mail/messages?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
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
