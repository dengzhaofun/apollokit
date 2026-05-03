export interface FriendGiftSettings {
  id: string
  tenantId: string
  dailySendLimit: number
  dailyReceiveLimit: number
  timezone: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface FriendGiftPackage {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  giftItems: { definitionId: string; quantity: number }[]
  isActive: boolean
  sortOrder: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface FriendGiftSend {
  id: string
  tenantId: string
  packageId: string | null
  senderUserId: string
  receiverUserId: string
  giftItems: { definitionId: string; quantity: number }[]
  status: string
  claimedAt: string | null
  expiresAt: string | null
  message: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertFriendGiftSettingsInput {
  dailySendLimit?: number
  dailyReceiveLimit?: number
  timezone?: string
  metadata?: Record<string, unknown> | null
}

export interface CreateFriendGiftPackageInput {
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  giftItems: { definitionId: string; quantity: number }[]
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateFriendGiftPackageInput {
  name?: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  giftItems?: { definitionId: string; quantity: number }[]
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}
