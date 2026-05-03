import type { RewardEntry } from "./rewards"

export interface LotteryPool {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  costPerPull: RewardEntry[]
  isActive: boolean
  startAt: string | null
  endAt: string | null
  globalPullLimit: number | null
  globalPullCount: number
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryTier {
  id: string
  poolId: string
  tenantId: string
  name: string
  alias: string | null
  baseWeight: number
  color: string | null
  icon: string | null
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryPrize {
  id: string
  tierId: string | null
  poolId: string
  tenantId: string
  name: string
  description: string | null
  rewardItems: RewardEntry[]
  weight: number
  isRateUp: boolean
  rateUpWeight: number
  globalStockLimit: number | null
  globalStockUsed: number
  fallbackPrizeId: string | null
  isActive: boolean
  sortOrder: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryPityRule {
  id: string
  poolId: string
  tenantId: string
  guaranteeTierId: string
  hardPityThreshold: number
  softPityStartAt: number | null
  softPityWeightIncrement: number | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryUserState {
  poolId: string
  endUserId: string
  totalPullCount: number
  pityCounters: Record<string, number>
}

export interface LotteryPullLog {
  id: string
  poolId: string
  endUserId: string
  batchId: string
  batchIndex: number
  prizeId: string
  tierId: string | null
  tierName: string | null
  prizeName: string
  rewardItems: RewardEntry[]
  pityTriggered: boolean
  pityRuleId: string | null
  costItems: RewardEntry[]
  createdAt: string
}

// ─── Inputs ───────────────────────────────────────────────────────

export interface CreatePoolInput {
  name: string
  alias?: string | null
  description?: string | null
  costPerPull?: RewardEntry[]
  isActive?: boolean
  startAt?: string | null
  endAt?: string | null
  globalPullLimit?: number | null
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdatePoolInput {
  name?: string
  alias?: string | null
  description?: string | null
  costPerPull?: RewardEntry[]
  isActive?: boolean
  startAt?: string | null
  endAt?: string | null
  globalPullLimit?: number | null
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CreateTierInput {
  name: string
  alias?: string | null
  baseWeight: number
  color?: string | null
  icon?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateTierInput {
  name?: string
  alias?: string | null
  baseWeight?: number
  color?: string | null
  icon?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreatePrizeInput {
  name: string
  description?: string | null
  rewardItems: RewardEntry[]
  weight?: number
  isRateUp?: boolean
  rateUpWeight?: number
  globalStockLimit?: number | null
  fallbackPrizeId?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdatePrizeInput {
  name?: string
  description?: string | null
  rewardItems?: RewardEntry[]
  weight?: number
  isRateUp?: boolean
  rateUpWeight?: number
  globalStockLimit?: number | null
  fallbackPrizeId?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreatePityRuleInput {
  guaranteeTierId: string
  hardPityThreshold: number
  softPityStartAt?: number | null
  softPityWeightIncrement?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdatePityRuleInput {
  hardPityThreshold?: number
  softPityStartAt?: number | null
  softPityWeightIncrement?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface PullInput {
  endUserId: string
  idempotencyKey?: string
}

export interface MultiPullInput {
  endUserId: string
  count: number
  idempotencyKey?: string
}

export interface PullResultEntry {
  batchIndex: number
  prizeId: string
  prizeName: string
  tierId: string | null
  tierName: string | null
  rewardItems: RewardEntry[]
  pityTriggered: boolean
  pityRuleId: string | null
}

export interface PullResult {
  batchId: string
  poolId: string
  endUserId: string
  costItems: RewardEntry[]
  pulls: PullResultEntry[]
}
