import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import type {
  CheckInConfig,
  CheckInResult,
  CheckInUserState,
  CreateConfigInput,
  UpdateConfigInput,
} from "#/lib/types/check-in"

const CONFIGS_KEY = ["check-in-configs"] as const

export function useCheckInConfigs(
  filter: { activityId?: string; includeActivity?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (filter.activityId) params.set("activityId", filter.activityId)
  if (filter.includeActivity) params.set("includeActivity", "true")
  const qs = params.toString()
  return useQuery({
    queryKey: [...CONFIGS_KEY, filter.activityId ?? null, !!filter.includeActivity],
    queryFn: () =>
      api.get<{ items: CheckInConfig[] }>(
        `/api/check-in/configs${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
  })
}

export function useCheckInConfig(key: string) {
  return useQuery({
    queryKey: [...CONFIGS_KEY, key],
    queryFn: () => api.get<CheckInConfig>(`/api/check-in/configs/${key}`),
    enabled: !!key,
  })
}

export function useCheckInUserStates(configKey: string) {
  return useQuery({
    queryKey: ["check-in-user-states", configKey],
    queryFn: () =>
      api.get<{ items: CheckInUserState[] }>(
        `/api/check-in/configs/${configKey}/users`,
      ),
    select: (data) => data.items,
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
