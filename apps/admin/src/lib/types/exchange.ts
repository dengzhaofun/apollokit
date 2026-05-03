import type { RewardEntry } from "./rewards"

export interface ExchangeConfig {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ExchangeOption {
  id: string
  configId: string
  tenantId: string
  name: string
  description: string | null
  costItems: RewardEntry[]
  rewardItems: RewardEntry[]
  userLimit: number | null
  globalLimit: number | null
  globalCount: number
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ExchangeResult {
  success: boolean
  exchangeId: string
  optionId: string
  costItems: RewardEntry[]
  rewardItems: RewardEntry[]
}

export interface ExchangeUserState {
  optionId: string
  endUserId: string
  count: number
}

export interface CreateConfigInput {
  name: string
  alias?: string | null
  description?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateConfigInput {
  name?: string
  alias?: string | null
  description?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateOptionInput {
  name: string
  description?: string | null
  costItems: RewardEntry[]
  rewardItems: RewardEntry[]
  userLimit?: number | null
  globalLimit?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateOptionInput {
  name?: string
  description?: string | null
  costItems?: RewardEntry[]
  rewardItems?: RewardEntry[]
  userLimit?: number | null
  globalLimit?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface ExecuteExchangeInput {
  endUserId: string
  idempotencyKey?: string
}
