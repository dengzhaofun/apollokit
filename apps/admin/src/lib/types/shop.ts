import type { ItemEntry } from "./item"

export type ShopProductType = "regular" | "growth_pack"
export type ShopTimeWindowType = "none" | "absolute" | "relative" | "cyclic"
export type ShopEligibilityAnchor = "user_created" | "first_purchase"
export type ShopRefreshCycle = "daily" | "weekly" | "monthly"
export type ShopGrowthTriggerType =
  | "accumulated_cost"
  | "accumulated_payment"
  | "custom_metric"
  | "manual"
export type ShopEligibilityStatus =
  | "available"
  | "not_started"
  | "expired"
  | "user_limit_reached"
  | "global_limit_reached"
  | "cycle_limit_reached"
  | "inactive"

// ─── Read shapes ────────────────────────────────────────────────────

export interface ShopCategory {
  id: string
  organizationId: string
  parentId: string | null
  alias: string | null
  name: string
  description: string | null
  coverImage: string | null
  icon: string | null
  level: number
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ShopCategoryNode extends ShopCategory {
  children: ShopCategoryNode[]
}

export interface ShopTag {
  id: string
  organizationId: string
  alias: string | null
  name: string
  color: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ShopProduct {
  id: string
  organizationId: string
  categoryId: string | null
  alias: string | null
  name: string
  description: string | null
  coverImage: string | null
  galleryImages: string[] | null
  productType: ShopProductType
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
  timeWindowType: ShopTimeWindowType
  availableFrom: string | null
  availableTo: string | null
  eligibilityAnchor: ShopEligibilityAnchor | null
  eligibilityWindowSeconds: number | null
  refreshCycle: ShopRefreshCycle | null
  refreshLimit: number | null
  userLimit: number | null
  globalLimit: number | null
  globalCount: number
  sortOrder: number
  isActive: boolean
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  tags: ShopTag[]
}

export interface ShopGrowthStage {
  id: string
  productId: string
  organizationId: string
  stageIndex: number
  name: string
  description: string | null
  triggerType: ShopGrowthTriggerType
  triggerConfig: Record<string, unknown> | null
  rewardItems: ItemEntry[]
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ShopUserPurchaseState {
  productId: string
  endUserId: string
  organizationId: string
  totalCount: number
  cycleCount: number
  cycleResetAt: string | null
  firstPurchaseAt: string | null
}

export interface ShopUserProductView extends ShopProduct {
  eligibility: {
    status: ShopEligibilityStatus
    resetsAt: string | null
    availableUntil: string | null
  }
  userPurchaseState: ShopUserPurchaseState | null
}

export interface ShopPurchaseResult {
  success: boolean
  productId: string
  endUserId: string
  productType: ShopProductType
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
  grantedRewards: boolean
}

export interface ShopClaimStageResult {
  success: boolean
  stageId: string
  productId: string
  endUserId: string
  rewardItems: ItemEntry[]
}

// ─── Write shapes ───────────────────────────────────────────────────

export interface CreateShopCategoryInput {
  name: string
  alias?: string | null
  parentId?: string | null
  description?: string | null
  coverImage?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateShopCategoryInput {
  name?: string
  alias?: string | null
  parentId?: string | null
  description?: string | null
  coverImage?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateShopTagInput {
  name: string
  alias?: string | null
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateShopTagInput {
  name?: string
  alias?: string | null
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateShopProductInput {
  name: string
  alias?: string | null
  categoryId?: string | null
  description?: string | null
  coverImage?: string | null
  galleryImages?: string[] | null
  productType: ShopProductType
  costItems: ItemEntry[]
  rewardItems: ItemEntry[]
  timeWindowType: ShopTimeWindowType
  availableFrom?: string | null
  availableTo?: string | null
  eligibilityAnchor?: ShopEligibilityAnchor | null
  eligibilityWindowSeconds?: number | null
  refreshCycle?: ShopRefreshCycle | null
  refreshLimit?: number | null
  userLimit?: number | null
  globalLimit?: number | null
  sortOrder?: number
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
  tagIds?: string[]
}

export interface UpdateShopProductInput
  extends Partial<Omit<CreateShopProductInput, "productType">> {
  productType?: ShopProductType
}

export interface CreateShopGrowthStageInput {
  stageIndex: number
  name: string
  description?: string | null
  triggerType: ShopGrowthTriggerType
  triggerConfig?: Record<string, unknown> | null
  rewardItems: ItemEntry[]
  sortOrder?: number
  metadata?: Record<string, unknown> | null
}

export interface UpdateShopGrowthStageInput {
  stageIndex?: number
  name?: string
  description?: string | null
  triggerType?: ShopGrowthTriggerType
  triggerConfig?: Record<string, unknown> | null
  rewardItems?: ItemEntry[]
  sortOrder?: number
  metadata?: Record<string, unknown> | null
}

export interface ShopPurchaseInput {
  endUserId: string
  idempotencyKey?: string
}

export interface ShopClaimStageInput {
  idempotencyKey?: string
}

export interface ShopListProductsQuery {
  categoryId?: string
  tagId?: string
  productType?: ShopProductType
  isActive?: boolean
  includeDescendantCategories?: boolean
  activityId?: string
  includeActivity?: boolean
}

export interface ShopListUserProductsQuery {
  categoryId?: string
  tagId?: string
  productType?: ShopProductType
}
