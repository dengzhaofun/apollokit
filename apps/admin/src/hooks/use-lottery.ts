import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "#/lib/api-client"
import {
  qs as buildQs,
  useListSearch,
  type FilterDef,
  type Page,
} from "#/hooks/use-list-search"
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
import type { AnyRoute } from "@tanstack/react-router"

const POOLS_KEY = ["lottery-pools"] as const

// ─── Pools ───────────────────────────────────────────────────────

export const LOTTERY_POOL_FILTER_DEFS: FilterDef[] = []

/**
 * Paginated pools — URL-driven.
 *
 * Default scope: only permanent / non-activity-bound pools. Activity-
 * scoped pools are managed inside the activity's detail page; pass an
 * explicit `activityId` to scope to that activity.
 */
export function useLotteryPools(
  route: AnyRoute,
  extraQuery: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = extraQuery
  const effectiveActivityId = activityId ?? "null"
  return useListSearch<LotteryPool>({
    route,
    queryKey: [
      ...POOLS_KEY,
      { activityId: effectiveActivityId, includeActivity: !!includeActivity },
    ],
    filterDefs: LOTTERY_POOL_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<LotteryPool>>(
        `/api/v1/lottery/pools?${buildQs({
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
export function useAllLotteryPools(
  opts: { activityId?: string; includeActivity?: boolean } = {},
) {
  const { activityId, includeActivity } = opts
  return useQuery({
    queryKey: [...POOLS_KEY, "all", { activityId: activityId ?? null, includeActivity: !!includeActivity }],
    queryFn: () =>
      api
        .get<Page<LotteryPool>>(
          `/api/v1/lottery/pools?${buildQs({
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
    queryFn: () => api.get<LotteryPool>(`/api/v1/lottery/pools/${key}`),
    enabled: !!key,
  })
}

export function useCreateLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePoolInput) =>
      api.post<LotteryPool>("/api/v1/lottery/pools", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

export function useUpdateLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePoolInput & { id: string }) =>
      api.patch<LotteryPool>(`/api/v1/lottery/pools/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

export function useDeleteLotteryPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/lottery/pools/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  })
}

// ─── Tiers ───────────────────────────────────────────────────────

export const LOTTERY_TIER_FILTER_DEFS: FilterDef[] = []

/** Paginated tiers under one pool — URL-driven. */
 
export function useLotteryTiers(poolKey: string, route: AnyRoute) {
  return useListSearch<LotteryTier>({
    route,
    queryKey: ["lottery-tiers", poolKey],
    filterDefs: LOTTERY_TIER_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<LotteryTier>>(
        `/api/v1/lottery/pools/${poolKey}/tiers?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
          `/api/v1/lottery/pools/${poolKey}/tiers?${buildQs({ limit: 200 })}`,
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
        `/api/v1/lottery/pools/${poolKey}/tiers`,
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
      api.patch<LotteryTier>(`/api/v1/lottery/tiers/${tierId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
  })
}

export function useDeleteLotteryTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tierId: string) =>
      api.delete(`/api/v1/lottery/tiers/${tierId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-tiers"] }),
  })
}

// ─── Prizes ──────────────────────────────────────────────────────

export const LOTTERY_PRIZE_FILTER_DEFS: FilterDef[] = []

/** Paginated prizes under one pool — URL-driven. */
 
export function useLotteryPrizes(poolKey: string, route: AnyRoute) {
  return useListSearch<LotteryPrize>({
    route,
    queryKey: ["lottery-prizes", poolKey],
    filterDefs: LOTTERY_PRIZE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<LotteryPrize>>(
        `/api/v1/lottery/pools/${poolKey}/prizes?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
          `/api/v1/lottery/pools/${poolKey}/prizes?${buildQs({ limit: 200 })}`,
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
        ? `/api/v1/lottery/pools/${poolKey}/tiers/${tierId}/prizes`
        : `/api/v1/lottery/pools/${poolKey}/prizes`
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
      api.patch<LotteryPrize>(`/api/v1/lottery/prizes/${prizeId}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
  })
}

export function useDeleteLotteryPrize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prizeId: string) =>
      api.delete(`/api/v1/lottery/prizes/${prizeId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["lottery-prizes"] }),
  })
}

// ─── Pity Rules ──────────────────────────────────────────────────

export const LOTTERY_PITY_RULE_FILTER_DEFS: FilterDef[] = []

/** Paginated pity rules under one pool — URL-driven. */
 
export function useLotteryPityRules(poolKey: string, route: AnyRoute) {
  return useListSearch<LotteryPityRule>({
    route,
    queryKey: ["lottery-pity-rules", poolKey],
    filterDefs: LOTTERY_PITY_RULE_FILTER_DEFS,
    fetchPage: ({ cursor, limit, q, filters, adv }) =>
      api.get<Page<LotteryPityRule>>(
        `/api/v1/lottery/pools/${poolKey}/pity-rules?${buildQs({ cursor, limit, q, adv, ...filters })}`,
      ),
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
          `/api/v1/lottery/pools/${poolKey}/pity-rules?${buildQs({ limit: 200 })}`,
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
        `/api/v1/lottery/pools/${poolKey}/pity-rules`,
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
        `/api/v1/lottery/pity-rules/${ruleId}`,
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
      api.delete(`/api/v1/lottery/pity-rules/${ruleId}`),
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
      api.post<PullResult>(`/api/v1/lottery/pools/${poolKey}/pull`, input),
  })
}

export function useLotteryMultiPull() {
  return useMutation({
    mutationFn: ({
      poolKey,
      ...input
    }: MultiPullInput & { poolKey: string }) =>
      api.post<PullResult>(
        `/api/v1/lottery/pools/${poolKey}/multi-pull`,
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
        `/api/v1/lottery/pools/${poolKey}/users/${endUserId}/state`,
      ),
    enabled: !!poolKey && !!endUserId,
  })
}

export function useLotteryPullHistory(poolKey: string, endUserId: string) {
  return useQuery({
    queryKey: ["lottery-pull-history", poolKey, endUserId],
    queryFn: () =>
      api.get<{ items: LotteryPullLog[] }>(
        `/api/v1/lottery/pools/${poolKey}/users/${endUserId}/history`,
      ),
    select: (data) => data.items,
    enabled: !!poolKey && !!endUserId,
  })
}
