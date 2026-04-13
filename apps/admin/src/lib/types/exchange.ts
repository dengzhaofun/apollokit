import type { ItemEntry } from "./item"

export interface ExchangeConfig {
  id: string
  organizationId: string
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
  organizationId: string
  name: string
  description: string | null
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
  userLimit: number | null
  globalLimit: number | null
  globalCount: number
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ExchangeResult {
  success: boolean
  exchangeId: string
  optionId: string
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
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
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
  userLimit?: number | null
  globalLimit?: number | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateOptionInput {
  name?: string
  description?: string | null
  costItems?: ItemEntry[]
  rewardItems?: ItemEntry[]
  userLimit?: number | null
  globalLimit?: number | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface ExecuteExchangeInput {
  endUserId: string
  idempotencyKey?: string
}
