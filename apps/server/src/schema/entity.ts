import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

// ─── JSONB type helpers ──────────────────────────────────────────

/** A single stat definition declared at the schema level. */
export type StatDefinition = {
  key: string;
  label: string;
  type: "integer" | "decimal";
  defaultValue: number;
};

/** A single tag definition declared at the schema level. */
export type TagDefinition = {
  key: string;
  label: string;
  values: string[];
};

/**
 * A slot definition declared at the schema level.
 *
 * `acceptsTags` values can be literal arrays (["warrior", "all"]) or
 * `$owner.<tagKey>` strings for dynamic matching against the owner
 * blueprint's tags. When `$owner.class` is used, the service expands
 * it to the owning entity's tag value plus the "all" wildcard.
 */
export type SlotDefinition = {
  key: string;
  label: string;
  acceptsSchemaIds: string[];
  acceptsTags?: Record<string, string | string[]>;
  maxCount: number;
};

/** Level progression configuration. */
export type LevelConfig = {
  enabled: boolean;
  maxLevel: number;
};

/** Rank progression configuration. */
export type RankConfig = {
  enabled: boolean;
  ranks: Array<{
    key: string;
    label: string;
    order: number;
  }>;
};

/** Synthesis/merge configuration. */
export type SynthesisConfig = {
  enabled: boolean;
  sameBlueprint: boolean;
  inputCount: number;
};

/** Per-level upgrade cost. */
export type LevelUpCost = {
  level: number;
  cost: RewardEntry[];
};

/** Per-rank upgrade cost with stat bonuses. */
export type RankUpCost = {
  fromRank: string;
  toRank: string;
  cost: RewardEntry[];
  statBonuses: Record<string, number>;
};

/** Synthesis cost configuration on a blueprint. */
export type SynthesisCostConfig = {
  inputCount: number;
  cost: RewardEntry[];
  resultBonuses: Record<string, number>;
};

/** Multi-resource asset bundle (icon, portrait, model3d, etc.). */
export type AssetBundle = Record<string, string>;

// ─── Tables ──────────────────────────────────────────────────────

/**
 * Entity schemas — org-defined entity categories.
 *
 * A schema defines what KIND of entity exists (hero, weapon, skill,
 * accessory, pet, ...). It declares:
 *   - What stats the type has (statDefinitions)
 *   - What tags the type supports (tagDefinitions)
 *   - What slots the type provides (slotDefinitions)
 *   - Whether level-up, rank-up, synthesis are enabled
 *
 * Schemas are the natural "category" for entity display in a backpack
 * UI — the client filters instances by schemaId.
 */
export const entitySchemas = pgTable(
  "entity_schemas",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    statDefinitions: jsonb("stat_definitions")
      .$type<StatDefinition[]>()
      .default([])
      .notNull(),
    tagDefinitions: jsonb("tag_definitions")
      .$type<TagDefinition[]>()
      .default([])
      .notNull(),
    slotDefinitions: jsonb("slot_definitions")
      .$type<SlotDefinition[]>()
      .default([])
      .notNull(),
    levelConfig: jsonb("level_config")
      .$type<LevelConfig>()
      .default({ enabled: false, maxLevel: 1 })
      .notNull(),
    rankConfig: jsonb("rank_config")
      .$type<RankConfig>()
      .default({ enabled: false, ranks: [] })
      .notNull(),
    synthesisConfig: jsonb("synthesis_config")
      .$type<SynthesisConfig>()
      .default({ enabled: false, sameBlueprint: true, inputCount: 2 })
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("entity_schemas_org_idx").on(table.organizationId),
    uniqueIndex("entity_schemas_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Entity blueprints — concrete templates within a schema.
 *
 * Each blueprint defines one specific entity (e.g. "Fire Dragon Warrior"
 * hero, "Flame Sword" weapon). It carries:
 *   - Base stats and per-level growth
 *   - Tags for slot compatibility filtering
 *   - Asset URLs (icon, portrait, model3d, etc.)
 *   - Progression costs (level-up, rank-up, synthesis)
 */
export const entityBlueprints = pgTable(
  "entity_blueprints",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    schemaId: uuid("schema_id")
      .notNull()
      .references(() => entitySchemas.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    rarity: text("rarity"),
    tags: jsonb("tags").$type<Record<string, string>>().default({}).notNull(),
    assets: jsonb("assets").$type<AssetBundle>().default({}).notNull(),
    baseStats: jsonb("base_stats")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    statGrowth: jsonb("stat_growth")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    levelUpCosts: jsonb("level_up_costs")
      .$type<LevelUpCost[]>()
      .default([])
      .notNull(),
    rankUpCosts: jsonb("rank_up_costs")
      .$type<RankUpCost[]>()
      .default([])
      .notNull(),
    synthesisCost: jsonb("synthesis_cost").$type<SynthesisCostConfig | null>(),
    maxLevel: integer("max_level"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("entity_blueprints_org_idx").on(table.organizationId),
    index("entity_blueprints_schema_idx").on(table.schemaId),
    index("entity_blueprints_org_schema_idx").on(
      table.organizationId,
      table.schemaId,
    ),
    uniqueIndex("entity_blueprints_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Entity blueprint skins — cosmetic variants for a blueprint.
 *
 * Skins carry replacement assets (icon, portrait, model3d, etc.) and
 * optional stat bonuses. One skin per blueprint may be marked as default.
 */
export const entityBlueprintSkins = pgTable(
  "entity_blueprint_skins",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => entityBlueprints.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    rarity: text("rarity"),
    assets: jsonb("assets").$type<AssetBundle>().default({}).notNull(),
    statBonuses: jsonb("stat_bonuses")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("entity_blueprint_skins_blueprint_idx").on(table.blueprintId),
    index("entity_blueprint_skins_org_idx").on(table.organizationId),
    uniqueIndex("entity_blueprint_skins_bp_alias_uidx")
      .on(table.blueprintId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Entity instances — per-player owned entity state.
 *
 * Each row is a non-stackable instance with independent level, experience,
 * rank, skin, and cached computed stats. The `version` column provides
 * optimistic concurrency control for all write paths (level-up, equip,
 * synthesize, etc.).
 *
 * `schemaId` is denormalized from the blueprint for efficient per-type
 * filtering (e.g. "list all heroes for this player").
 *
 * `computedStats` is a materialized cache recomputed on every mutation
 * (level-up, rank-up, equip, skin change). Read paths return it as-is.
 */
export const entityInstances = pgTable(
  "entity_instances",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => entityBlueprints.id, { onDelete: "cascade" }),
    schemaId: uuid("schema_id").notNull(),
    level: integer("level").default(1).notNull(),
    exp: integer("exp").default(0).notNull(),
    rankKey: text("rank_key"),
    skinId: uuid("skin_id").references(() => entityBlueprintSkins.id, {
      onDelete: "set null",
    }),
    computedStats: jsonb("computed_stats")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    customData: jsonb("custom_data"),
    isLocked: boolean("is_locked").default(false).notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    /**
     * Soft link to an `activity_configs.id` when this entity instance
     * was granted as an activity-scoped item (spring-festival badge,
     * one-time pass, …). NULL means permanent player inventory.
     *
     * When the activity archives, the activity service's cleanup path
     * acts on rows matching `activity_id` per the activity's
     * `cleanupRule`:
     *   - purge   → DELETE these rows
     *   - convert → run the conversion map (future), then DELETE
     *   - keep    → no-op (stays as a souvenir)
     */
    activityId: uuid("activity_id"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("entity_instances_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("entity_instances_org_user_schema_idx").on(
      table.organizationId,
      table.endUserId,
      table.schemaId,
    ),
    index("entity_instances_org_user_bp_idx").on(
      table.organizationId,
      table.endUserId,
      table.blueprintId,
    ),
    index("entity_instances_activity_idx").on(table.activityId),
  ],
);

/**
 * Entity slot assignments — equipment/skill mounting relationships.
 *
 * Represents "hero instance X has weapon Y in weapon slot 0" or
 * "hero instance X has skill Z in skill slot 2". The primary key is
 * (ownerInstanceId, slotKey, slotIndex), and a unique constraint on
 * equippedInstanceId ensures an entity can only be equipped in one
 * slot at a time.
 */
export const entitySlotAssignments = pgTable(
  "entity_slot_assignments",
  {
    ownerInstanceId: uuid("owner_instance_id")
      .notNull()
      .references(() => entityInstances.id, { onDelete: "cascade" }),
    slotKey: text("slot_key").notNull(),
    slotIndex: integer("slot_index").default(0).notNull(),
    equippedInstanceId: uuid("equipped_instance_id")
      .notNull()
      .references(() => entityInstances.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerInstanceId, table.slotKey, table.slotIndex],
      name: "entity_slot_assignments_pk",
    }),
    uniqueIndex("entity_slot_assignments_equipped_uidx").on(
      table.equippedInstanceId,
    ),
    index("entity_slot_assignments_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Entity formation configs — admin-defined team composition rules.
 *
 * Defines how many formations a player can create, how many slots per
 * formation, which entity schemas are allowed, and whether duplicate
 * blueprints are permitted within a single formation.
 */
export const entityFormationConfigs = pgTable(
  "entity_formation_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    maxFormations: integer("max_formations").default(5).notNull(),
    maxSlots: integer("max_slots").default(4).notNull(),
    acceptsSchemaIds: jsonb("accepts_schema_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    allowDuplicateBlueprints: boolean("allow_duplicate_blueprints")
      .default(false)
      .notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("entity_formation_configs_org_idx").on(table.organizationId),
    uniqueIndex("entity_formation_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/** Slot entry in a formation's slots array. */
export type FormationSlot = {
  slotIndex: number;
  instanceId: string | null;
};

/**
 * Entity formations — per-player team composition data.
 *
 * Each row is one formation (team) that a player has configured.
 * The `slots` JSONB array holds which entity instances fill each
 * position. `formationIndex` distinguishes teams under the same config.
 */
export const entityFormations = pgTable(
  "entity_formations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    configId: uuid("config_id")
      .notNull()
      .references(() => entityFormationConfigs.id, { onDelete: "cascade" }),
    formationIndex: integer("formation_index").notNull(),
    name: text("name"),
    slots: jsonb("slots").$type<FormationSlot[]>().default([]).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("entity_formations_org_user_config_idx_uidx").on(
      table.organizationId,
      table.endUserId,
      table.configId,
      table.formationIndex,
    ),
    index("entity_formations_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Entity action logs — audit trail for entity mutations.
 *
 * Records level-ups, rank-ups, synthesis, equip/unequip, acquire, and
 * discard events. `instanceId` is NOT a foreign key because the
 * referenced instance may have been deleted (e.g. synthesis feed).
 */
export const entityActionLogs = pgTable(
  "entity_action_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    instanceId: uuid("instance_id").notNull(),
    action: text("action").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("entity_action_logs_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("entity_action_logs_instance_idx").on(table.instanceId),
    index("entity_action_logs_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
  ],
);
