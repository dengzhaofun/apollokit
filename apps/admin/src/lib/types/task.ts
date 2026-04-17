import type { ItemEntry } from "./item"

export type TaskPeriod = "daily" | "weekly" | "monthly" | "none"
export type CountingMethod = "event_count" | "event_value" | "child_completion"
export type CategoryScope = "task" | "achievement" | "custom"

export interface TaskNavigation {
  type: string
  target: string
  params?: Record<string, unknown>
  label?: string
}

export interface TaskCategory {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  scope: string
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface TaskDefinition {
  id: string
  organizationId: string
  categoryId: string | null
  parentId: string | null
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  period: string
  timezone: string
  weekStartsOn: number
  countingMethod: string
  eventName: string | null
  eventValueField: string | null
  targetValue: number
  parentProgressValue: number
  prerequisiteTaskIds: string[]
  rewards: ItemEntry[]
  autoClaim: boolean
  navigation: TaskNavigation | null
  isActive: boolean
  isHidden: boolean
  sortOrder: number
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryInput {
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  scope?: CategoryScope
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

export interface CreateDefinitionInput {
  categoryId?: string | null
  parentId?: string | null
  alias?: string | null
  name: string
  description?: string | null
  icon?: string | null
  period: TaskPeriod
  timezone?: string
  weekStartsOn?: number
  countingMethod: CountingMethod
  eventName?: string | null
  eventValueField?: string | null
  targetValue: number
  parentProgressValue?: number
  prerequisiteTaskIds?: string[]
  rewards: ItemEntry[]
  autoClaim?: boolean
  navigation?: TaskNavigation | null
  isActive?: boolean
  isHidden?: boolean
  sortOrder?: number
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export type UpdateDefinitionInput = Partial<CreateDefinitionInput>

export interface CategoryListResponse {
  items: TaskCategory[]
}

export interface DefinitionListResponse {
  items: TaskDefinition[]
}
