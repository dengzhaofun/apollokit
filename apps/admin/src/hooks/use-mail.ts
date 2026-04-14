import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateMailInput,
  MailListResponse,
  MailMessage,
  MailMessageWithStats,
} from "#/lib/types/mail"

const MESSAGES_KEY = ["mail-messages"] as const

export function useMailMessages() {
  return useQuery({
    queryKey: MESSAGES_KEY,
    queryFn: () => api.get<MailListResponse>("/api/mail/messages"),
    select: (data) => data.items,
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
