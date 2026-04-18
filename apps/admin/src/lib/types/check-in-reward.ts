import type { RewardEntry } from "./rewards"

export interface CheckInReward {
  id: string
  configId: string
  organizationId: string
  dayNumber: number
  rewardItems: RewardEntry[]
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateRewardInput {
  dayNumber: number
  rewardItems: RewardEntry[]
  metadata?: Record<string, unknown> | null
}

export interface UpdateRewardInput {
  dayNumber?: number
  rewardItems?: RewardEntry[]
  metadata?: Record<string, unknown> | null
}
