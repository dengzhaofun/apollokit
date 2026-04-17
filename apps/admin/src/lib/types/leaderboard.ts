export type CycleMode = "daily" | "weekly" | "monthly" | "all_time"
export type ScopeMode = "global" | "guild" | "team" | "friend"
export type AggregationMode = "sum" | "max" | "latest"
export type TieBreaker = "earliest" | "latest"
export type ConfigStatus = "draft" | "active" | "paused" | "archived"

export interface RewardEntry {
  type: "item" | "entity"
  id: string
  count: number
}

export interface RewardTier {
  from: number
  to: number
  rewards: RewardEntry[]
}

export interface LeaderboardConfig {
  id: string
  organizationId: string
  alias: string
  name: string
  description: string | null
  metricKey: string
  cycle: CycleMode
  weekStartsOn: number
  timezone: string
  scope: ScopeMode
  aggregation: AggregationMode
  maxEntries: number
  tieBreaker: TieBreaker
  rewardTiers: RewardTier[]
  startAt: string | null
  endAt: string | null
  status: ConfigStatus
  activityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LeaderboardRanking {
  rank: number
  endUserId: string
  score: number
  displaySnapshot?: Record<string, unknown> | null
}

export interface LeaderboardTop {
  configId: string
  alias: string
  cycleKey: string
  scopeKey: string
  rankings: LeaderboardRanking[]
  self?: { rank: number | null; score: number | null }
}

export interface LeaderboardSnapshot {
  id: string
  configId: string
  organizationId: string
  cycleKey: string
  scopeKey: string
  rankings: LeaderboardRanking[]
  rewardPlan: RewardTier[]
  settledAt: string
}

export interface CreateLeaderboardInput {
  alias: string
  name: string
  description?: string | null
  metricKey: string
  cycle: CycleMode
  weekStartsOn?: number
  timezone?: string
  scope?: ScopeMode
  aggregation?: AggregationMode
  maxEntries?: number
  tieBreaker?: TieBreaker
  rewardTiers?: RewardTier[]
  startAt?: string | null
  endAt?: string | null
  status?: ConfigStatus
  activityId?: string | null
  metadata?: Record<string, unknown> | null
}

export type UpdateLeaderboardInput = Partial<Omit<CreateLeaderboardInput, "alias">>
