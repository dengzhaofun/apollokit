import type { RewardEntry } from "./rewards"

export type AlbumScope = "hero" | "monster" | "equipment" | "custom"
export type MilestoneScope = "entry" | "group" | "album"
export type TriggerType = "item" | "event"

export interface CollectionAlbum {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  coverImage: string | null
  icon: string | null
  scope: string
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CollectionGroup {
  id: string
  albumId: string
  organizationId: string
  name: string
  description: string | null
  icon: string | null
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CollectionEntry {
  id: string
  albumId: string
  groupId: string | null
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  image: string | null
  rarity: string | null
  sortOrder: number
  hiddenUntilUnlocked: boolean
  triggerType: string
  triggerItemDefinitionId: string | null
  triggerQuantity: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CollectionMilestone {
  id: string
  organizationId: string
  albumId: string
  scope: string
  groupId: string | null
  entryId: string | null
  threshold: number
  label: string | null
  rewardItems: RewardEntry[]
  autoClaim: boolean
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateAlbumInput {
  name: string
  alias?: string | null
  description?: string | null
  coverImage?: string | null
  icon?: string | null
  scope?: AlbumScope
  sortOrder?: number
  isActive?: boolean
}
export type UpdateAlbumInput = Partial<CreateAlbumInput>

export interface CreateGroupInput {
  name: string
  description?: string | null
  icon?: string | null
  sortOrder?: number
}
export type UpdateGroupInput = Partial<CreateGroupInput>

export interface CreateEntryInput {
  groupId?: string | null
  alias?: string | null
  name: string
  description?: string | null
  image?: string | null
  rarity?: string | null
  sortOrder?: number
  hiddenUntilUnlocked?: boolean
  triggerType?: TriggerType
  triggerItemDefinitionId?: string | null
  triggerQuantity?: number
}
export type UpdateEntryInput = Partial<CreateEntryInput>

export interface CreateMilestoneInput {
  scope: MilestoneScope
  groupId?: string | null
  entryId?: string | null
  threshold?: number
  label?: string | null
  rewardItems: RewardEntry[]
  autoClaim?: boolean
  sortOrder?: number
}
export interface UpdateMilestoneInput {
  threshold?: number
  label?: string | null
  rewardItems?: RewardEntry[]
  autoClaim?: boolean
  sortOrder?: number
}

export interface AlbumListResponse {
  items: CollectionAlbum[]
}
export interface GroupListResponse {
  items: CollectionGroup[]
}
export interface EntryListResponse {
  items: CollectionEntry[]
}
export interface MilestoneListResponse {
  items: CollectionMilestone[]
}

export interface CollectionStats {
  albumId: string
  totalEndUsers: number
  entries: Array<{
    entryId: string
    name: string
    unlockedCount: number
  }>
  milestones: Array<{
    milestoneId: string
    scope: string
    threshold: number
    claimedCount: number
  }>
}
