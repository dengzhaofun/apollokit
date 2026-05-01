/**
 * Zod schemas for the entity module.
 *
 * Shared between HTTP validation (routes.ts / client-routes.ts) and
 * service-layer input typing. `.openapi()` metadata is attached for
 * the Scalar UI at /docs.
 */

import { z } from "@hono/zod-openapi";

import { FractionalKeySchema, MoveBodySchema } from "../../lib/fractional-order";

import { pageOf } from "../../lib/pagination";

const AliasRegex = /^[a-z0-9][a-z0-9\-_]*$/;

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .openapi({ description: "Arbitrary JSON blob for tenant-specific extensions." });

const AliasSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(AliasRegex, {
    message: "alias must start with [a-z0-9] and contain only [a-z0-9-_]",
  })
  .openapi({
    description: "Optional human-readable key, unique within its scope.",
    example: "hero",
  });

// ─── JSONB sub-schemas ──────────────────────────────────────────

const StatDefinitionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  type: z.enum(["integer", "decimal"]),
  defaultValue: z.number(),
});

const TagDefinitionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  values: z.array(z.string().min(1).max(64)).min(1),
});

const SlotDefinitionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  acceptsSchemaIds: z.array(z.string()),
  acceptsTags: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  maxCount: z.number().int().min(1).max(100),
});

const LevelConfigSchema = z.object({
  enabled: z.boolean(),
  maxLevel: z.number().int().min(1),
});

const RankEntrySchema = z.object({
  key: z.string().min(1).max(32),
  label: z.string().min(1).max(100),
  order: z.number().int().min(0),
});

const RankConfigSchema = z.object({
  enabled: z.boolean(),
  ranks: z.array(RankEntrySchema),
});

const SynthesisConfigSchema = z.object({
  enabled: z.boolean(),
  sameBlueprint: z.boolean(),
  inputCount: z.number().int().min(1),
});

const RewardEntrySchema = z.object({
  type: z.enum(["item", "entity", "currency"]),
  id: z.string(),
  count: z.number().int().positive(),
});

const LevelUpCostSchema = z.object({
  level: z.number().int().min(2),
  cost: z.array(RewardEntrySchema),
});

const RankUpCostSchema = z.object({
  fromRank: z.string(),
  toRank: z.string(),
  cost: z.array(RewardEntrySchema),
  statBonuses: z.record(z.string(), z.number()),
});

const SynthesisCostConfigSchema = z.object({
  inputCount: z.number().int().min(1),
  cost: z.array(RewardEntrySchema),
  resultBonuses: z.record(z.string(), z.number()),
});

const AssetBundleSchema = z.record(z.string(), z.string());

const StatsMapSchema = z.record(z.string(), z.number());

const TagsMapSchema = z.record(z.string(), z.string());

// ─── Schema CRUD ────────────────────────────────────────────────

export const CreateSchemaInput = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Hero" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    statDefinitions: z.array(StatDefinitionSchema).optional(),
    tagDefinitions: z.array(TagDefinitionSchema).optional(),
    slotDefinitions: z.array(SlotDefinitionSchema).optional(),
    levelConfig: LevelConfigSchema.optional(),
    rankConfig: RankConfigSchema.optional(),
    synthesisConfig: SynthesisConfigSchema.optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityCreateSchema");

export const UpdateSchemaInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    statDefinitions: z.array(StatDefinitionSchema).optional(),
    tagDefinitions: z.array(TagDefinitionSchema).optional(),
    slotDefinitions: z.array(SlotDefinitionSchema).optional(),
    levelConfig: LevelConfigSchema.optional(),
    rankConfig: RankConfigSchema.optional(),
    synthesisConfig: SynthesisConfigSchema.optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityUpdateSchema");

// ─── Blueprint CRUD ─────────────────────────────────────────────

export const CreateBlueprintInput = z
  .object({
    schemaId: z.string().uuid(),
    name: z.string().min(1).max(200).openapi({ example: "Fire Dragon Warrior" }),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    tags: TagsMapSchema.optional(),
    assets: AssetBundleSchema.optional(),
    baseStats: StatsMapSchema.optional(),
    statGrowth: StatsMapSchema.optional(),
    levelUpCosts: z.array(LevelUpCostSchema).optional(),
    rankUpCosts: z.array(RankUpCostSchema).optional(),
    synthesisCost: SynthesisCostConfigSchema.nullable().optional(),
    maxLevel: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional().openapi({
      description:
        "Soft link to activity_configs.id when the blueprint is activity-scoped. NULL = permanent.",
    }),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityCreateBlueprint");

export const UpdateBlueprintInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(1024).nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    tags: TagsMapSchema.optional(),
    assets: AssetBundleSchema.optional(),
    baseStats: StatsMapSchema.optional(),
    statGrowth: StatsMapSchema.optional(),
    levelUpCosts: z.array(LevelUpCostSchema).optional(),
    rankUpCosts: z.array(RankUpCostSchema).optional(),
    synthesisCost: SynthesisCostConfigSchema.nullable().optional(),
    maxLevel: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    activityId: z.string().uuid().nullable().optional(),
    activityNodeId: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityUpdateBlueprint");

// ─── Skin CRUD ──────────────────────────────────────────────────

export const CreateSkinInput = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Dragon Scale Armor" }),
    alias: AliasSchema.nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    assets: AssetBundleSchema.optional(),
    statBonuses: StatsMapSchema.optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityCreateSkin");

export const UpdateSkinInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    rarity: z.string().max(32).nullable().optional(),
    assets: AssetBundleSchema.optional(),
    statBonuses: StatsMapSchema.optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityUpdateSkin");

// ─── Formation Config CRUD ──────────────────────────────────────

export const CreateFormationConfigInput = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: "Default Formation" }),
    alias: AliasSchema.nullable().optional(),
    maxFormations: z.number().int().min(1).max(20).optional(),
    maxSlots: z.number().int().min(1).max(20).optional(),
    acceptsSchemaIds: z.array(z.string().uuid()).optional(),
    allowDuplicateBlueprints: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityCreateFormationConfig");

export const UpdateFormationConfigInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    alias: AliasSchema.nullable().optional(),
    maxFormations: z.number().int().min(1).max(20).optional(),
    maxSlots: z.number().int().min(1).max(20).optional(),
    acceptsSchemaIds: z.array(z.string().uuid()).optional(),
    allowDuplicateBlueprints: z.boolean().optional(),
    metadata: MetadataSchema,
  })
  .openapi("EntityUpdateFormationConfig");

// ─── Param schemas ──────────────────────────────────────────────

export const SchemaKeyParamSchema = z.object({
  key: z.string().openapi({
    param: { name: "key", in: "path" },
    description: "Schema ID (uuid) or alias",
    example: "hero",
  }),
});

export const SchemaIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Schema UUID",
  }),
});

export const BlueprintKeyParamSchema = z.object({
  key: z.string().openapi({
    param: { name: "key", in: "path" },
    description: "Blueprint ID (uuid) or alias",
    example: "fire-warrior",
  }),
});

export const BlueprintIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Blueprint UUID",
  }),
});

export const SkinIdParamSchema = z.object({
  skinId: z.string().uuid().openapi({
    param: { name: "skinId", in: "path" },
    description: "Skin UUID",
  }),
});

export const FormationConfigKeyParamSchema = z.object({
  key: z.string().openapi({
    param: { name: "key", in: "path" },
    description: "Formation config ID (uuid) or alias",
  }),
});

export const FormationConfigIdParamSchema = z.object({
  id: z.string().uuid().openapi({
    param: { name: "id", in: "path" },
    description: "Formation config UUID",
  }),
});

// ─── Response schemas ───────────────────────────────────────────

export const SchemaResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    statDefinitions: z.array(StatDefinitionSchema),
    tagDefinitions: z.array(TagDefinitionSchema),
    slotDefinitions: z.array(SlotDefinitionSchema),
    levelConfig: LevelConfigSchema,
    rankConfig: RankConfigSchema,
    synthesisConfig: SynthesisConfigSchema,
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EntitySchema");

export const SchemaListResponseSchema = pageOf(SchemaResponseSchema).openapi(
  "EntitySchemaList",
);

export const BlueprintResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    schemaId: z.string().uuid(),
    alias: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    rarity: z.string().nullable(),
    tags: TagsMapSchema,
    assets: AssetBundleSchema,
    baseStats: StatsMapSchema,
    statGrowth: StatsMapSchema,
    levelUpCosts: z.array(LevelUpCostSchema),
    rankUpCosts: z.array(RankUpCostSchema),
    synthesisCost: SynthesisCostConfigSchema.nullable(),
    maxLevel: z.number().nullable(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    activityId: z.string().nullable(),
    activityNodeId: z.string().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EntityBlueprint");

export const BlueprintListResponseSchema = pageOf(BlueprintResponseSchema).openapi(
  "EntityBlueprintList",
);

export const SkinResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    blueprintId: z.string().uuid(),
    alias: z.string().nullable(),
    name: z.string(),
    rarity: z.string().nullable(),
    assets: AssetBundleSchema,
    statBonuses: StatsMapSchema,
    isDefault: z.boolean(),
    sortOrder: FractionalKeySchema,
    isActive: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EntitySkin");

export const SkinListResponseSchema = z.array(SkinResponseSchema);

export const FormationConfigResponseSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string(),
    alias: z.string().nullable(),
    name: z.string(),
    maxFormations: z.number(),
    maxSlots: z.number(),
    acceptsSchemaIds: z.array(z.string()),
    allowDuplicateBlueprints: z.boolean(),
    metadata: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("EntityFormationConfig");

export const FormationConfigListResponseSchema = pageOf(FormationConfigResponseSchema).openapi(
  "EntityFormationConfigList",
);

// ─── Export input types ─────────────────────────────────────────

export type CreateSchemaInputType = z.input<typeof CreateSchemaInput>;
export type UpdateSchemaInputType = z.input<typeof UpdateSchemaInput>;
export type CreateBlueprintInputType = z.input<typeof CreateBlueprintInput>;
export type UpdateBlueprintInputType = z.input<typeof UpdateBlueprintInput>;
export type CreateSkinInputType = z.input<typeof CreateSkinInput>;
export type UpdateSkinInputType = z.input<typeof UpdateSkinInput>;
export type CreateFormationConfigInputType = z.input<typeof CreateFormationConfigInput>;
export type UpdateFormationConfigInputType = z.input<typeof UpdateFormationConfigInput>;
