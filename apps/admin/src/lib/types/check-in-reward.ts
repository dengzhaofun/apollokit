import type { ItemEntry } from "./item"

export interface CheckInReward {
  id: string
  configId: string
  organizationId: string
  dayNumber: number
  rewardItems: ItemEntry[]
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateRewardInput {
  dayNumber: number
  rewardItems: ItemEntry[]
  metadata?: Record<string, unknown> | null
}

export interface UpdateRewardInput {
  dayNumber?: number
  rewardItems?: ItemEntry[]
  metadata?: Record<string, unknown> | null
}
