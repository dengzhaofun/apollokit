import type { RewardEntry } from "./rewards"

export type CdkeyCodeType = "universal" | "unique"

export interface CdkeyBatch {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  codeType: CdkeyCodeType
  reward: RewardEntry[]
  totalLimit: number | null
  perUserLimit: number
  totalRedeemed: number
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CdkeyCode {
  id: string
  tenantId: string
  batchId: string
  code: string
  status: string
  redeemedBy: string | null
  redeemedAt: string | null
  createdAt: string
}

export interface CdkeyRedemptionLog {
  id: string
  tenantId: string
  endUserId: string
  batchId: string
  codeId: string | null
  code: string
  source: string
  sourceId: string
  status: string
  failReason: string | null
  reward: RewardEntry[] | null
  createdAt: string
}

export interface CreateBatchInput {
  name: string
  alias?: string | null
  description?: string | null
  codeType: CdkeyCodeType
  reward: RewardEntry[]
  totalLimit?: number | null
  perUserLimit?: number
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
  universalCode?: string
  initialCount?: number
}

export interface UpdateBatchInput {
  name?: string
  alias?: string | null
  description?: string | null
  reward?: RewardEntry[]
  totalLimit?: number | null
  perUserLimit?: number
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}
