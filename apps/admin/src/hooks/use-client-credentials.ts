import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import type {
  ClientCredential,
  ClientCredentialCreated,
  RotateResult,
} from "#/lib/types/api-key"

const CREDENTIALS_KEY = ["client-credentials"] as const

export function useClientCredentials() {
  return useQuery({
    queryKey: CREDENTIALS_KEY,
    queryFn: () =>
      api.get<{ items: ClientCredential[] }>("/api/v1/client-credentials"),
    select: (data) => data.items,
  })
}

export function useCreateClientCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; expiresAt?: string }) =>
      api.post<ClientCredentialCreated>("/api/v1/client-credentials", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  })
}

export function useRevokeClientCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ClientCredential>(`/api/v1/client-credentials/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  })
}

export function useRotateClientCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<RotateResult>(`/api/v1/client-credentials/${id}/rotate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  })
}

export function useDeleteClientCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/client-credentials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  })
}

export function useUpdateDevMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, devMode }: { id: string; devMode: boolean }) =>
      api.patch<ClientCredential>(`/api/v1/client-credentials/${id}/dev-mode`, {
        devMode,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CREDENTIALS_KEY }),
  })
}
