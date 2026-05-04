import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
import type {
  CheckInConfig,
  CheckInResult,
  CheckInUserState,
  CreateConfigInput,
  UpdateConfigInput,
} from "#/lib/types/check-in"
import type { AnyRoute } from "@tanstack/react-router"

const CONFIGS_KEY = ["check-in-configs"] as const

export const CHECK_IN_CONFIG_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated check-in configs — URL-driven. Default scope: permanent
 * / non-activity-bound only. Activity detail pages pass an explicit
 * `activityId` to scope to that activity.
 */
export function useCheckInConfigs(
  route: AnyRoute,
  extraQuery: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<CheckInConfig>({
    route,
    queryKey: [
      ...CONFIGS_KEY,
      { activityId: effectiveActivityId, includeActivity: !!includeActivity },
    ],
    filterDefs: CHECK_IN_CONFIG_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CheckInConfig>>(
        `/api/v1/check-in/configs?${buildQs({
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

/** Non-paginated convenience for selectors (200 cap). */
export function useAllCheckInConfigs(
  opts: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = opts
  return useQuery({
    queryKey: [...CONFIGS_KEY, "all", { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    queryFn: () =>
      api
        .get<Page<CheckInConfig>>(
          `/api/v1/check-in/configs?${buildQs({
            limit: 200,
            activityId,
            includeActivity: includeActivity ? "true" : undefined,
          })}`,
        )
        .then((p) => p.items),
  })
}

export function useCheckInConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () => api.get<CheckInConfig>(`/api/v1/check-in/configs/${key}`),
    enabled: !!key,
  })
}

export const CHECK_IN_USER_STATE_FILTER_DEFS: FilterDef[] = []

/** Paginated user states under a check-in config — URL-driven. */
 
export function useCheckInUserStates(configKey: string, route: AnyRoute) {
  return useListSearch<CheckInUserState>({
    route,
    queryKey: ["check-in-user-states", configKey],
    filterDefs: CHECK_IN_USER_STATE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<CheckInUserState>>(
        `/api/v1/check-in/configs/${configKey}/users?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
    enabled: !!configKey,
  })
}

export function useCreateCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConfigInput) =>
      api.post<CheckInConfig>("/api/v1/check-in/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateConfigInput & { id: string }) =>
      api.patch<CheckInConfig>(`/api/v1/check-in/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function usePerformCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ configKey, endUserId }: { configKey: string; endUserId: string }) =>
      api.post<CheckInResult>(
        `/api/v1/check-in/configs/${configKey}/check-ins`,
        { endUserId },
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ["check-in-user-states", variables.configKey] }),
  })
}

export function useDeleteCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/check-in/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useResetCheckInUserState(configKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (endUserId: string) =>
      api.delete(
        `/api/v1/check-in/configs/${configKey}/users/${encodeURIComponent(endUserId)}/state`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["check-in-user-states", configKey] }),
  })
}
