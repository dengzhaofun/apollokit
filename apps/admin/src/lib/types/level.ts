export interface RewardEntry {
  type: "item" | "entity"
  id: string
  count: number
}

export interface StarRewardTier {
  stars: number
  rewards: RewardEntry[]
}

export type UnlockRule =
  | { type: "auto" }
  | { type: "level_clear"; levelId: string }
  | { type: "level_stars"; levelId: string; stars: number }
  | { type: "stage_clear"; stageId: string }
  | { type: "star_threshold"; threshold: number }
  | { type: "all"; rules: UnlockRule[] }
  | { type: "any"; rules: UnlockRule[] }

export interface LevelConfig {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  coverImage: string | null
  icon: string | null
  hasStages: boolean
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface LevelStage {
  id: string
  configId: string
  organizationId: string
  name: string
  description: string | null
  icon: string | null
  unlockRule: UnlockRule | null
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface Level {
  id: string
  configId: string
  stageId: string | null
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  difficulty: string | null
  maxStars: number
  unlockRule: UnlockRule | null
  clearRewards: RewardEntry[] | null
  starRewards: StarRewardTier[] | null
  sortOrder: number
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

// Input types
export interface CreateConfigInput {
  name: string
  alias?: string | null
  description?: string | null
  coverImage?: string | null
  icon?: string | null
  hasStages?: boolean
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}
export type UpdateConfigInput = Partial<CreateConfigInput>

export interface CreateStageInput {
  name: string
  description?: string | null
  icon?: string | null
  unlockRule?: UnlockRule | null
  sortOrder?: number
  metadata?: Record<string, unknown> | null
}
export type UpdateStageInput = Partial<CreateStageInput>

export interface CreateLevelInput {
  stageId?: string | null
  alias?: string | null
  name: string
  description?: string | null
  icon?: string | null
  difficulty?: string | null
  maxStars?: number
  unlockRule?: UnlockRule | null
  clearRewards?: RewardEntry[] | null
  starRewards?: StarRewardTier[] | null
  sortOrder?: number
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}
export type UpdateLevelInput = Partial<CreateLevelInput>

// List responses
export interface ConfigListResponse {
  items: LevelConfig[]
}
export interface StageListResponse {
  items: LevelStage[]
}
export interface LevelListResponse {
  items: Level[]
}
