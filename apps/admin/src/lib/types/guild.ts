export interface GuildSettings {
  id: string
  tenantId: string
  maxMembers: number
  maxOfficers: number
  createCost: { definitionId: string; quantity: number }[]
  levelUpRules: { level: number; expRequired: number; memberCapBonus: number }[] | null
  joinMode: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface Guild {
  id: string
  tenantId: string
  name: string
  description: string | null
  icon: string | null
  announcement: string | null
  leaderUserId: string
  level: number
  experience: number
  memberCount: number
  maxMembers: number
  joinMode: string
  isActive: boolean
  disbandedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface GuildMember {
  guildId: string
  endUserId: string
  tenantId: string
  role: string
  contribution: number
  joinedAt: string
  createdAt: string
  updatedAt: string
}

export interface UpsertGuildSettingsInput {
  maxMembers?: number
  maxOfficers?: number
  createCost?: { definitionId: string; quantity: number }[]
  levelUpRules?: { level: number; expRequired: number; memberCapBonus: number }[] | null
  joinMode?: string
  metadata?: Record<string, unknown> | null
}
