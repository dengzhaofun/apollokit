import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
import type {
  CheckInConfig,
  CheckInResult,
  CheckInUserState,
  CreateConfigInput,
  UpdateConfigInput,
} from "#/lib/types/check-in"

const CONFIGS_KEY = ["check-in-configs"] as const

/** Paginated check-in configs — for the admin ConfigTable. */
export function useCheckInConfigs(
  opts: { activityId?: string; includeActivity?: boolean; initialPageSize?: number } = {},
) {
  const { activityId, includeActivity, initialPageSize = 50 } = opts
  return useCursorList<CheckInConfig>({
    queryKey: [...CONFIGS_KEY, { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CheckInConfig>>(
        `/api/check-in/configs?${buildQs({
          cursor,
          limit,
          q,
          activityId,
          includeActivity: includeActivity ? "true" : undefined,
        })}`,
      ),
    initialPageSize,
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
          `/api/check-in/configs?${buildQs({
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
    queryFn: () => api.get<CheckInConfig>(`/api/check-in/configs/${key}`),
    enabled: !!key,
  })
}

/** Paginated user states under a check-in config — for UserStatesTable. */
export function useCheckInUserStates(configKey: string, initialPageSize = 50) {
  return useCursorList<CheckInUserState>({
    queryKey: ["check-in-user-states", configKey],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<CheckInUserState>>(
        `/api/check-in/configs/${configKey}/users?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
    enabled: !!configKey,
  })
}

export function useCreateCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConfigInput) =>
      api.post<CheckInConfig>("/api/check-in/configs", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function useUpdateCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateConfigInput & { id: string }) =>
      api.patch<CheckInConfig>(`/api/check-in/configs/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}

export function usePerformCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ configKey, endUserId }: { configKey: string; endUserId: string }) =>
      api.post<CheckInResult>(
        `/api/check-in/configs/${configKey}/check-ins`,
        { endUserId },
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ["check-in-user-states", variables.configKey] }),
  })
}

export function useDeleteCheckInConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/check-in/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIGS_KEY }),
  })
}
