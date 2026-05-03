export type StorageBoxType = "demand" | "fixed"

export interface StorageBoxConfig {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  type: StorageBoxType | string
  lockupDays: number | null
  interestRateBps: number
  interestPeriodDays: number
  acceptedCurrencyIds: string[]
  minDeposit: number | null
  maxDeposit: number | null
  allowEarlyWithdraw: boolean
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface StorageBoxDepositView {
  id: string
  tenantId: string
  endUserId: string
  boxConfigId: string
  currencyDefinitionId: string
  principal: number
  accruedInterest: number
  projectedInterest: number
  status: string
  isSingleton: boolean
  isMatured: boolean
  depositedAt: string
  lastAccrualAt: string
  maturesAt: string | null
  withdrawnAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface DepositResult {
  deposit: StorageBoxDepositView
  currencyDeducted: number
}

export interface WithdrawResult {
  deposit: StorageBoxDepositView
  principalPaid: number
  interestPaid: number
  currencyGranted: number
}

export interface CreateStorageBoxConfigInput {
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  type: StorageBoxType
  lockupDays?: number | null
  interestRateBps?: number
  interestPeriodDays?: number
  acceptedCurrencyIds: string[]
  minDeposit?: number | null
  maxDeposit?: number | null
  allowEarlyWithdraw?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateStorageBoxConfigInput {
  name?: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  type?: StorageBoxType
  lockupDays?: number | null
  interestRateBps?: number
  interestPeriodDays?: number
  acceptedCurrencyIds?: string[]
  minDeposit?: number | null
  maxDeposit?: number | null
  allowEarlyWithdraw?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface DepositInput {
  endUserId: string
  boxConfigId: string
  currencyDefinitionId: string
  amount: number
  idempotencyKey?: string
}

export interface WithdrawInput {
  endUserId: string
  depositId?: string
  boxConfigId?: string
  currencyDefinitionId?: string
  amount?: number
  idempotencyKey?: string
}
