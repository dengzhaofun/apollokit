import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
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

/** Paginated webhook endpoints — for the admin endpoints table. */
export function useWebhookEndpoints(initialPageSize = 50) {
  return useCursorList<WebhookEndpoint>({
    queryKey: ENDPOINTS_KEY,
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<WebhookEndpoint>>(
        `/api/webhooks/endpoints?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
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

/**
 * Single-page deliveries fetch — drives the modal table.
 *
 * Deliveries inside the endpoint dialog are read-mostly debug data; we render the first
 * page only (limit-capped) instead of cursor-paging the dialog. Bumping limit when users
 * hit the cap is fine for now.
 */
export function useWebhookDeliveries(
  endpointId: string,
  filter: { status?: WebhookDeliveryStatus; limit?: number } = {},
  opts: { enabled?: boolean } = {},
) {
  const limit = filter.limit ?? 100
  return useQuery({
    queryKey: [
      ...deliveriesKey(endpointId),
      filter.status ?? "all",
      limit,
    ],
    queryFn: () =>
      api
        .get<Page<WebhookDelivery>>(
          `/api/webhooks/endpoints/${endpointId}/deliveries?${buildQs({
            status: filter.status,
            limit,
          })}`,
        )
        .then((p) => p.items),
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
