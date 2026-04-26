import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import { qs as buildQs, useCursorList, type Page } from "#/hooks/use-cursor-list"
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

/** Paginated pools — for the admin pool list page. */
export function useLotteryPools(
  opts: { activityId?: string; includeActivity?: boolean; initialPageSize?: number } = {},
) {
  const { activityId, includeActivity, initialPageSize = 50 } = opts
  return useCursorList<LotteryPool>({
    queryKey: [...POOLS_KEY, { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<LotteryPool>>(
        `/api/lottery/pools?${buildQs({
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
export function useAllLotteryPools(
  opts: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = opts
  return useQuery({
    queryKey: [...POOLS_KEY, "all", { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    queryFn: () =>
      api
        .get<Page<LotteryPool>>(
          `/api/lottery/pools?${buildQs({
            limit: 200,
            activityId,
            includeActivity: includeActivity ? "true" : undefined,
          })}`,
        )
        .then((p) => p.items),
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

/** Paginated tiers under one pool — for TierTable. */
export function useLotteryTiers(poolKey: string, initialPageSize = 50) {
  return useCursorList<LotteryTier>({
    queryKey: ["lottery-tiers", poolKey],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<LotteryTier>>(
        `/api/lottery/pools/${poolKey}/tiers?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
    enabled: !!poolKey,
  })
}

/** Non-paginated convenience for selectors. */
export function useAllLotteryTiers(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-tiers", poolKey, "all"],
    queryFn: () =>
      api
        .get<Page<LotteryTier>>(
          `/api/lottery/pools/${poolKey}/tiers?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
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

/** Paginated prizes under one pool — for PrizeTable. */
export function useLotteryPrizes(poolKey: string, initialPageSize = 50) {
  return useCursorList<LotteryPrize>({
    queryKey: ["lottery-prizes", poolKey],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<LotteryPrize>>(
        `/api/lottery/pools/${poolKey}/prizes?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
    enabled: !!poolKey,
  })
}

/** Non-paginated convenience for embedded views. */
export function useAllLotteryPrizes(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-prizes", poolKey, "all"],
    queryFn: () =>
      api
        .get<Page<LotteryPrize>>(
          `/api/lottery/pools/${poolKey}/prizes?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
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

/** Paginated pity rules under one pool — for PityRuleTable. */
export function useLotteryPityRules(poolKey: string, initialPageSize = 50) {
  return useCursorList<LotteryPityRule>({
    queryKey: ["lottery-pity-rules", poolKey],
    fetchPage: ({ cursor, limit, q }) =>
      api.get<Page<LotteryPityRule>>(
        `/api/lottery/pools/${poolKey}/pity-rules?${buildQs({ cursor, limit, q })}`,
      ),
    initialPageSize,
    enabled: !!poolKey,
  })
}

/** Non-paginated convenience for embedded views. */
export function useAllLotteryPityRules(poolKey: string) {
  return useQuery({
    queryKey: ["lottery-pity-rules", poolKey, "all"],
    queryFn: () =>
      api
        .get<Page<LotteryPityRule>>(
          `/api/lottery/pools/${poolKey}/pity-rules?${buildQs({ limit: 200 })}`,
        )
        .then((p) => p.items),
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
