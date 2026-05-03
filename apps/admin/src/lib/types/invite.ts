export interface InviteSettings {
  tenantId: string
  enabled: boolean
  codeLength: number
  allowSelfInvite: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface InviteRelationship {
  id: string
  tenantId: string
  inviterEndUserId: string
  inviteeEndUserId: string
  inviterCodeSnapshot: string
  boundAt: string
  qualifiedAt: string | null
  qualifiedReason: string | null
  metadata: Record<string, unknown> | null
}

export interface UpsertInviteSettingsInput {
  enabled?: boolean
  codeLength?: number
  allowSelfInvite?: boolean
  metadata?: Record<string, unknown> | null
}

export interface InviteRelationshipListQuery {
  limit?: number
  offset?: number
  inviterEndUserId?: string
  qualifiedOnly?: boolean
}

export interface InviteRelationshipList {
  items: InviteRelationship[]
  total: number
}
