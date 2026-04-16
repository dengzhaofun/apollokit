export interface FriendSettings {
  id: string
  organizationId: string
  maxFriends: number
  maxBlocked: number
  maxPendingRequests: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface FriendRelationship {
  id: string
  organizationId: string
  userA: string
  userB: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface UpsertFriendSettingsInput {
  maxFriends?: number
  maxBlocked?: number
  maxPendingRequests?: number
  metadata?: Record<string, unknown> | null
}
