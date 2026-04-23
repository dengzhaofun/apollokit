import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "#/lib/types/webhooks"

const ENDPOINTS_KEY = ["webhooks", "endpoints"] as const
const deliveriesKey = (endpointId: string) =>
  ["webhooks", "deliveries", endpointId] as const

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: ENDPOINTS_KEY,
    queryFn: () =>
      api.get<{ items: WebhookEndpoint[] }>("/api/webhooks/endpoints"),
    select: (d) => d.items,
  })
}

export function useCreateWebhookEndpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWebhookEndpointInput) =>
      api.post<WebhookEndpointWithSecret>("/api/webhooks/endpoints", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENDPOINTS_KEY }),
  })
}

export function useUpdateWebhookEndpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: UpdateWebhookEndpointInput & { id: string }) =>
      api.patch<WebhookEndpoint>(`/api/webhooks/endpoints/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENDPOINTS_KEY }),
  })
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<WebhookEndpointWithSecret>(
        `/api/webhooks/endpoints/${id}/rotate-secret`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENDPOINTS_KEY }),
  })
}

export function useDeleteWebhookEndpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/webhooks/endpoints/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENDPOINTS_KEY }),
  })
}

export function useWebhookDeliveries(
  endpointId: string,
  filter: { status?: WebhookDeliveryStatus; limit?: number } = {},
  opts: { enabled?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (filter.status) params.set("status", filter.status)
  if (filter.limit) params.set("limit", String(filter.limit))
  const query = params.toString() ? `?${params.toString()}` : ""
  return useQuery({
    queryKey: [...deliveriesKey(endpointId), filter.status ?? "all", filter.limit ?? 50],
    queryFn: () =>
      api.get<{ items: WebhookDelivery[] }>(
        `/api/webhooks/endpoints/${endpointId}/deliveries${query}`,
      ),
    select: (d) => d.items,
    enabled: !!endpointId && opts.enabled !== false,
  })
}

export function useReplayWebhookDelivery(endpointId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deliveryId: string) =>
      api.post<WebhookDelivery>(
        `/api/webhooks/deliveries/${deliveryId}/replay`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: deliveriesKey(endpointId) }),
  })
}
