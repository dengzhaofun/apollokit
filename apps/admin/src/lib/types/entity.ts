// ─── JSONB sub-types ─────────────────────────────────────────────

export interface StatDefinition {
  key: string
  label: string
  type: "integer" | "decimal"
  defaultValue: number
}

export interface TagDefinition {
  key: string
  label: string
  values: string[]
}

export interface SlotDefinition {
  key: string
  label: string
  acceptsSchemaIds: string[]
  acceptsTags?: Record<string, string | string[]>
  maxCount: number
}

export interface LevelConfig {
  enabled: boolean
  maxLevel: number
}

export interface RankEntry {
  key: string
  label: string
  order: number
}

export interface RankConfig {
  enabled: boolean
  ranks: RankEntry[]
}

export interface SynthesisConfig {
  enabled: boolean
  sameBlueprint: boolean
  inputCount: number
}

export interface ItemEntry {
  definitionId: string
  quantity: number
}

export interface LevelUpCost {
  level: number
  cost: ItemEntry[]
}

export interface RankUpCost {
  fromRank: string
  toRank: string
  cost: ItemEntry[]
  statBonuses: Record<string, number>
}

export interface SynthesisCostConfig {
  inputCount: number
  cost: ItemEntry[]
  resultBonuses: Record<string, number>
}

// ─── Main entity types ──────────────────────────────────────────

export interface EntitySchema {
  id: string
  tenantId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  statDefinitions: StatDefinition[]
  tagDefinitions: TagDefinition[]
  slotDefinitions: SlotDefinition[]
  levelConfig: LevelConfig
  rankConfig: RankConfig
  synthesisConfig: SynthesisConfig
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface EntityBlueprint {
  id: string
  tenantId: string
  schemaId: string
  alias: string | null
  name: string
  description: string | null
  icon: string | null
  rarity: string | null
  tags: Record<string, string>
  assets: Record<string, string>
  baseStats: Record<string, number>
  statGrowth: Record<string, number>
  levelUpCosts: LevelUpCost[]
  rankUpCosts: RankUpCost[]
  synthesisCost: SynthesisCostConfig | null
  maxLevel: number | null
  sortOrder: string
  isActive: boolean
  activityId: string | null
  activityNodeId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface EntityBlueprintSkin {
  id: string
  tenantId: string
  blueprintId: string
  alias: string | null
  name: string
  rarity: string | null
  assets: Record<string, string>
  statBonuses: Record<string, number>
  isDefault: boolean
  sortOrder: string
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface EntityFormationConfig {
  id: string
  tenantId: string
  alias: string | null
  name: string
  maxFormations: number
  maxSlots: number
  acceptsSchemaIds: string[]
  allowDuplicateBlueprints: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

// ─── Input types for mutations ──────────────────────────────────

export interface CreateSchemaInput {
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  statDefinitions?: StatDefinition[]
  tagDefinitions?: TagDefinition[]
  slotDefinitions?: SlotDefinition[]
  levelConfig?: LevelConfig
  rankConfig?: RankConfig
  synthesisConfig?: SynthesisConfig
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateSchemaInput {
  name?: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  statDefinitions?: StatDefinition[]
  tagDefinitions?: TagDefinition[]
  slotDefinitions?: SlotDefinition[]
  levelConfig?: LevelConfig
  rankConfig?: RankConfig
  synthesisConfig?: SynthesisConfig
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateBlueprintInput {
  schemaId: string
  name: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  rarity?: string | null
  tags?: Record<string, string>
  assets?: Record<string, string>
  baseStats?: Record<string, number>
  statGrowth?: Record<string, number>
  levelUpCosts?: LevelUpCost[]
  rankUpCosts?: RankUpCost[]
  synthesisCost?: SynthesisCostConfig | null
  maxLevel?: number | null
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateBlueprintInput {
  name?: string
  alias?: string | null
  description?: string | null
  icon?: string | null
  rarity?: string | null
  tags?: Record<string, string>
  assets?: Record<string, string>
  baseStats?: Record<string, number>
  statGrowth?: Record<string, number>
  levelUpCosts?: LevelUpCost[]
  rankUpCosts?: RankUpCost[]
  synthesisCost?: SynthesisCostConfig | null
  maxLevel?: number | null
  isActive?: boolean
  activityId?: string | null
  activityNodeId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CreateSkinInput {
  name: string
  alias?: string | null
  rarity?: string | null
  assets?: Record<string, string>
  statBonuses?: Record<string, number>
  isDefault?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateSkinInput {
  name?: string
  alias?: string | null
  rarity?: string | null
  assets?: Record<string, string>
  statBonuses?: Record<string, number>
  isDefault?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CreateFormationConfigInput {
  name: string
  alias?: string | null
  maxFormations?: number
  maxSlots?: number
  acceptsSchemaIds?: string[]
  allowDuplicateBlueprints?: boolean
  metadata?: Record<string, unknown> | null
}

export interface UpdateFormationConfigInput {
  name?: string
  alias?: string | null
  maxFormations?: number
  maxSlots?: number
  acceptsSchemaIds?: string[]
  allowDuplicateBlueprints?: boolean
  metadata?: Record<string, unknown> | null
}
