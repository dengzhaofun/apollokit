import type { ItemEntry } from "./item"

export interface LotteryPool {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  costPerPull: ItemEntry[]
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
  organizationId: string
  name: string
  alias: string | null
  baseWeight: number
  color: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryPrize {
  id: string
  tierId: string | null
  poolId: string
  organizationId: string
  name: string
  description: string | null
  rewardItems: ItemEntry[]
  weight: number
  isRateUp: boolean
  rateUpWeight: number
  globalStockLimit: number | null
  globalStockUsed: number
  fallbackPrizeId: string | null
  isActive: boolean
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LotteryPityRule {
  id: string
  poolId: string
  organizationId: string
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
  rewardItems: ItemEntry[]
  pityTriggered: boolean
  pityRuleId: string | null
  costItems: ItemEntry[]
  createdAt: string
}

// ─── Inputs ───────────────────────────────────────────────────────

export interface CreatePoolInput {
  name: string
  alias?: string | null
  description?: string | null
  costPerPull?: ItemEntry[]
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
  costPerPull?: ItemEntry[]
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
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateTierInput {
  name?: string
  alias?: string | null
  baseWeight?: number
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreatePrizeInput {
  name: string
  description?: string | null
  rewardItems: ItemEntry[]
  weight?: number
  isRateUp?: boolean
  rateUpWeight?: number
  globalStockLimit?: number | null
  fallbackPrizeId?: string | null
  isActive?: boolean
  sortOrder?: number
  metadata?: Record<string, unknown> | null
}

export interface UpdatePrizeInput {
  name?: string
  description?: string | null
  rewardItems?: ItemEntry[]
  weight?: number
  isRateUp?: boolean
  rateUpWeight?: number
  globalStockLimit?: number | null
  fallbackPrizeId?: string | null
  isActive?: boolean
  sortOrder?: number
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
  rewardItems: ItemEntry[]
  pityTriggered: boolean
  pityRuleId: string | null
}

export interface PullResult {
  batchId: string
  poolId: string
  endUserId: string
  costItems: ItemEntry[]
  pulls: PullResultEntry[]
}
