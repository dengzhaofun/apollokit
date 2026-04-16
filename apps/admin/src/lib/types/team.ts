export interface TeamConfig {
  id: string
  organizationId: string
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
  organizationId: string
  configId: string
  leaderUserId: string
  status: string
  memberCount: number
  dissolvedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateTeamConfigInput {
  name: string
  alias?: string | null
  maxMembers?: number
  autoDissolveOnLeaderLeave?: boolean
  allowQuickMatch?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateTeamConfigInput {
  name?: string
  alias?: string | null
  maxMembers?: number
  autoDissolveOnLeaderLeave?: boolean
  allowQuickMatch?: boolean
  metadata?: Record<string, unknown> | null
}
