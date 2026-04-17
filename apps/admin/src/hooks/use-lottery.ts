import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import type {
  LotteryPool,
  LotteryTier,
  LotteryPrize,
  LotteryPityRule,
  LotteryUserState,
  LotteryPullLog,
  CreatePoolInput,
  UpdatePoolInput,
  CreateTierInput,
  UpdateTierInput,
  CreatePrizeInput,
  UpdatePrizeInput,
  CreatePityRuleInput,
  UpdatePityRuleInput,
  PullInput,
  MultiPullInput,
  PullResult,
} from "#/lib/types/lottery"

const POOLS_KEY = ["lottery-pools"] as const

// ─── Pools ───────────────────────────────────────────────────────

export function useLotteryPools(
  filter: { activityId?: string; includeActivity?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (filter.activityId) params.set("activityId", filter.activityId)
  if (filter.includeActivity) params.set("includeActivity", "true")
  const qs = params.toString()
  return useQuery({
    queryKey: [...POOLS_KEY, filter.activityId ?? null, !!filter.includeActivity],
    queryFn: () =>
      api.get<{ items: LotteryPool[] }>(
        `/api/lottery/pools${qs ? `?${qs}` : ""}`,
      ),
    select: (data) => data.items,
  })
}

export function useLotteryPool(key: string) {
  return useQuery({
    queryKey: [...POOLS_KEY, key],
    queryFn: () => api.get<LotteryPool>(`/api/lottery/pools/${key}`),
    enabled: !!key,
  })
}

export function useCreateLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePoolInput) =>
      api.post<LotteryPool>("/api/lottery/pools", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

export function useUpdateLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePoolInput & { id: string }) =>
      api.patch<LotteryPool>(`/api/lottery/pools/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

export function useDeleteLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/lottery/pools/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

// ─── Tiers ───────────────────────────────────────────────────────

export function useLotteryTiers(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-tiers", poolKey],
    queryFn: () =>
      api.get<{ items: LotteryTier[] }>(
        `/api/lottery/pools/${poolKey}/tiers`,
      ),
    select: (data) => data.items,
    enabled: !!poolKey,
  })
}

export function useCreateLotteryTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      poolKey,
      ...input
    }: CreateTierInput & { poolKey: string }) =>
      api.post<LotteryTier>(
        `/api/lottery/pools/${poolKey}/tiers`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
  })
}

export function useUpdateLotteryTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, ...input }: UpdateTierInput & { tierId: string }) =>
      api.patch<LotteryTier>(`/api/lottery/tiers/${tierId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
  })
}

export function useDeleteLotteryTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tierId: string) =>
      api.delete(`/api/lottery/tiers/${tierId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
  })
}

// ─── Prizes ──────────────────────────────────────────────────────

export function useLotteryPrizes(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-prizes", poolKey],
    queryFn: () =>
      api.get<{ items: LotteryPrize[] }>(
        `/api/lottery/pools/${poolKey}/prizes`,
      ),
    select: (data) => data.items,
    enabled: !!poolKey,
  })
}

export function useCreateLotteryPrize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      poolKey,
      tierId,
      ...input
    }: CreatePrizeInput & { poolKey: string; tierId?: string }) => {
      const path = tierId
        ? `/api/lottery/pools/${poolKey}/tiers/${tierId}/prizes`
        : `/api/lottery/pools/${poolKey}/prizes`
      return api.post<LotteryPrize>(path, input)
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
  })
}

export function useUpdateLotteryPrize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      prizeId,
      ...input
    }: UpdatePrizeInput & { prizeId: string }) =>
      api.patch<LotteryPrize>(`/api/lottery/prizes/${prizeId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
  })
}

export function useDeleteLotteryPrize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prizeId: string) =>
      api.delete(`/api/lottery/prizes/${prizeId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
  })
}

// ─── Pity Rules ──────────────────────────────────────────────────

export function useLotteryPityRules(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-pity-rules", poolKey],
    queryFn: () =>
      api.get<{ items: LotteryPityRule[] }>(
        `/api/lottery/pools/${poolKey}/pity-rules`,
      ),
    select: (data) => data.items,
    enabled: !!poolKey,
  })
}

export function useCreateLotteryPityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      poolKey,
      ...input
    }: CreatePityRuleInput & { poolKey: string }) =>
      api.post<LotteryPityRule>(
        `/api/lottery/pools/${poolKey}/pity-rules`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-pity-rules"] }),
  })
}

export function useUpdateLotteryPityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      ...input
    }: UpdatePityRuleInput & { ruleId: string }) =>
      api.patch<LotteryPityRule>(
        `/api/lottery/pity-rules/${ruleId}`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-pity-rules"] }),
  })
}

export function useDeleteLotteryPityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) =>
      api.delete(`/api/lottery/pity-rules/${ruleId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-pity-rules"] }),
  })
}

// ─── Pull ────────────────────────────────────────────────────────

export function useLotteryPull() {
  return useMutation({
    mutationFn: ({
      poolKey,
      ...input
    }: PullInput & { poolKey: string }) =>
      api.post<PullResult>(`/api/lottery/pools/${poolKey}/pull`, input),
  })
}

export function useLotteryMultiPull() {
  return useMutation({
    mutationFn: ({
      poolKey,
      ...input
    }: MultiPullInput & { poolKey: string }) =>
      api.post<PullResult>(
        `/api/lottery/pools/${poolKey}/multi-pull`,
        input,
      ),
  })
}

// ─── User State / History ────────────────────────────────────────

export function useLotteryUserState(poolKey: string, endUserId: string) {
  return useQuery({
    queryKey: ["lottery-user-state", poolKey, endUserId],
    queryFn: () =>
      api.get<LotteryUserState>(
        `/api/lottery/pools/${poolKey}/users/${endUserId}/state`,
      ),
    enabled: !!poolKey && !!endUserId,
  })
}

export function useLotteryPullHistory(poolKey: string, endUserId: string) {
  return useQuery({
    queryKey: ["lottery-pull-history", poolKey, endUserId],
    queryFn: () =>
      api.get<{ items: LotteryPullLog[] }>(
        `/api/lottery/pools/${poolKey}/users/${endUserId}/history`,
      ),
    select: (data) => data.items,
    enabled: !!poolKey && !!endUserId,
  })
}
