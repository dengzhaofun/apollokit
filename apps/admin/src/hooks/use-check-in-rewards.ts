import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import type {
  CheckInReward,
  CreateRewardInput,
  UpdateRewardInput,
} from "#/lib/types/check-in-reward"

export function useCheckInRewards(configKey: string) {
  return useQuery({
    queryKey: ["check-in-rewards", configKey],
    queryFn: () =>
      api.get<{ items: CheckInReward[] }>(
        `/api/check-in/configs/${configKey}/rewards`,
      ),
    select: (data) => data.items,
    enabled: !!configKey,
  })
}

export function useCreateCheckInReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      configKey,
      ...input
    }: CreateRewardInput & { configKey: string }) =>
      api.post<CheckInReward>(
        `/api/check-in/configs/${configKey}/rewards`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["check-in-rewards"] }),
  })
}

export function useUpdateCheckInReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      rewardId,
      ...input
    }: UpdateRewardInput & { rewardId: string }) =>
      api.patch<CheckInReward>(`/api/check-in/rewards/${rewardId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["check-in-rewards"] }),
  })
}

export function useDeleteCheckInReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rewardId: string) =>
      api.delete(`/api/check-in/rewards/${rewardId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["check-in-rewards"] }),
  })
}
