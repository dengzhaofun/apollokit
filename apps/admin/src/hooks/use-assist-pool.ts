import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  AssistPoolConfig,
  AssistPoolInstance,
  AssistPoolStatus,
  CreateAssistPoolConfigInput,
  UpdateAssistPoolConfigInput,
} from "#/lib/types/assist-pool"

const CONFIGS_KEY = ["assist-pool-configs"] as const
const INSTANCES_KEY = ["assist-pool-instances"] as const

export const ASSIST_POOL_CONFIG_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated assist-pool configs — URL-driven. Default scope: permanent
 * / non-activity-bound only.
 */
export function useAssistPoolConfigs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any,
  extraQuery: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<AssistPoolConfig>({
    route,
    queryKey: [
      ...CONFIGS_KEY,
      { activityId: effectiveActivityId, includeActivity: !!includeActivity },
    ],
    filterDefs: ASSIST_POOL_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<AssistPoolConfig>>(
        `/api/assist-pool/configs?${buildQs({
          cursor,
          limit,
          q,
          adv,
          ...filters,
          activityId: effectiveActivityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
  })
}

export function useAssistPoolConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () =>
      api.get<AssistPoolConfig>(`/api/assist-pool/configs/${key}`),
    enabled: !!key,
  })
}

export function useCreateAssistPoolConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAssistPoolConfigInput) =>
      api.post<AssistPoolConfig>("/api/assist-pool/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateAssistPoolConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateAssistPoolConfigInput & { id: string }) =>
      api.patch<AssistPoolConfig>(`/api/assist-pool/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useDeleteAssistPoolConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/assist-pool/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useAssistPoolInstances(filter: {
  configKey?: string
  initiatorEndUserId?: string
  status?: AssistPoolStatus
  limit?: number
}) {
  const params = new URLSearchParams()
  if (filter.configKey) params.set("configKey", filter.configKey)
  if (filter.initiatorEndUserId)
    params.set("initiatorEndUserId", filter.initiatorEndUserId)
  if (filter.status) params.set("status", filter.status)
  if (filter.limit) params.set("limit", String(filter.limit))
  const qs = params.toString()
  return useQuery({
    queryKey: [
      ...INSTANCES_KEY,
      filter.configKey ?? null,
      filter.initiatorEndUserId ?? null,
      filter.status ?? null,
      filter.limit ?? null,
    ],
    queryFn: () =>
      api.get<{ items: AssistPoolInstance[] }>(
        `/api/assist-pool/instances${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
  })
}

export function useForceExpireInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (instanceId: string) =>
      api.post<AssistPoolInstance>(
        `/api/assist-pool/instances/${instanceId}/force-expire`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTANCES_KEY }),
  })
}
