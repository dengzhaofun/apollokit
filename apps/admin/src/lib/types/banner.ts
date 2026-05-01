import type { LinkAction } from "./link"

export type BannerTargetType = "broadcast" | "multicast"
export type BannerLayout = "carousel" | "single" | "grid"

export interface BannerGroup {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  layout: BannerLayout
  intervalMs: number
  isActive: boolean
  activityId: string | null
  activityNodeId: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface Banner {
  id: string
  organizationId: string
  groupId: string
  title: string
  imageUrlMobile: string
  imageUrlDesktop: string
  altText: string | null
  linkAction: LinkAction
  sortOrder: string
  visibleFrom: string | null
  visibleUntil: string | null
  targetType: BannerTargetType
  targetUserIds: string[] | null
  isActive: boolean
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface CreateBannerGroupInput {
  alias?: string | null
  name: string
  description?: string | null
  layout?: BannerLayout
  intervalMs?: number
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
}

export type UpdateBannerGroupInput = Partial<CreateBannerGroupInput>

export interface CreateBannerInput {
  title: string
  imageUrlMobile: string
  imageUrlDesktop: string
  altText?: string | null
  linkAction: LinkAction
  visibleFrom?: string | null
  visibleUntil?: string | null
  targetType?: BannerTargetType
  targetUserIds?: string[] | null
  isActive?: boolean
}

export type UpdateBannerInput = Partial<CreateBannerInput>

export interface BannerGroupListResponse {
  items: BannerGroup[]
}

export interface BannerListResponse {
  items: Banner[]
}
