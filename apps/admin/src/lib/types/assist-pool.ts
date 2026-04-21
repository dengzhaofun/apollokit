export type AssistPoolMode = "accumulate" | "decrement"
export type AssistPoolStatus = "in_progress" | "completed" | "expired"

export type RewardItem = {
  type: "item" | "entity" | "currency"
  id: string
  count: number
}

export type AssistContributionPolicy =
  | { kind: "fixed"; amount: number }
  | { kind: "uniform"; min: number; max: number }
  | {
      kind: "decaying"
      base: number
      tailRatio: number
      tailFloor: number
    }

export type AssistPoolConfig = {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  mode: AssistPoolMode
  targetAmount: number
  contributionPolicy: AssistContributionPolicy
  perAssisterLimit: number
  initiatorCanAssist: boolean
  expiresInSeconds: number
  maxInstancesPerInitiator: number | null
  rewards: RewardItem[]
  isActive: boolean
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type AssistPoolInstance = {
  id: string
  organizationId: string
  configId: string
  initiatorEndUserId: string
  status: AssistPoolStatus
  remaining: number
  targetAmount: number
  contributionCount: number
  expiresAt: string
  completedAt: string | null
  rewardGrantedAt: string | null
  version: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type CreateAssistPoolConfigInput = {
  name: string
  alias?: string | null
  description?: string | null
  mode?: AssistPoolMode
  targetAmount: number
  contributionPolicy: AssistContributionPolicy
  perAssisterLimit?: number
  initiatorCanAssist?: boolean
  expiresInSeconds?: number
  maxInstancesPerInitiator?: number | null
  rewards?: RewardItem[]
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export type UpdateAssistPoolConfigInput = {
  name?: string
  alias?: string | null
  description?: string | null
  perAssisterLimit?: number
  initiatorCanAssist?: boolean
  maxInstancesPerInitiator?: number | null
  rewards?: RewardItem[]
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}
