export interface MatchSquadConfig {
  id: string
  tenantId: string
  alias: string | null
  name: string
  maxMembers: number
  autoDissolveOnLeaderLeave: boolean
  allowQuickMatch: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  tenantId: string
  configId: string
  leaderUserId: string
  status: string
  memberCount: number
  dissolvedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateMatchSquadConfigInput {
  name: string
  alias?: string | null
  maxMembers?: number
  autoDissolveOnLeaderLeave?: boolean
  allowQuickMatch?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateMatchSquadConfigInput {
  name?: string
  alias?: string | null
  maxMembers?: number
  autoDissolveOnLeaderLeave?: boolean
  allowQuickMatch?: boolean
  metadata?: Record<string, unknown> | null
}
