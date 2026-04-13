export interface ItemCategory {
  id: string
  organizationId: string
  alias: string | null
  name: string
  icon: string | null
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ItemDefinition {
  id: string
  organizationId: string
  categoryId: string | null
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  stackable: boolean
  stackLimit: number | null
  holdLimit: number | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface InventoryStack {
  id: string
  quantity: number
  instanceData: unknown | null
}

export interface InventoryView {
  definitionId: string
  definitionAlias: string | null
  definitionName: string
  icon: string | null
  stackable: boolean
  totalQuantity: number
  stacks: InventoryStack[]
}

export interface ItemEntry {
  definitionId: string
  quantity: number
}

export interface GrantResultEntry {
  definitionId: string
  quantityBefore: number
  quantityAfter: number
  delta: number
}

export interface GrantResult {
  grants: GrantResultEntry[]
}

export interface DeductResult {
  deductions: GrantResultEntry[]
}

export interface BalanceResult {
  definitionId: string
  balance: number
}

export interface CreateCategoryInput {
  name: string
  alias?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateCategoryInput {
  name?: string
  alias?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateDefinitionInput {
  name: string
  alias?: string | null
  categoryId?: string | null
  description?: string | null
  icon?: string | null
  stackable?: boolean
  stackLimit?: number | null
  holdLimit?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateDefinitionInput {
  name?: string
  alias?: string | null
  categoryId?: string | null
  description?: string | null
  icon?: string | null
  stackable?: boolean
  stackLimit?: number | null
  holdLimit?: number | null
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface GrantItemsInput {
  endUserId: string
  grants: ItemEntry[]
  source: string
  sourceId?: string
}

export interface DeductItemsInput {
  endUserId: string
  deductions: ItemEntry[]
  source: string
  sourceId?: string
}
