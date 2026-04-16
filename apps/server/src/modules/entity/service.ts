/**
 * Entity service — protocol-agnostic business logic for the RPG entity
 * system (heroes, equipment, skills, skins, formations).
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Phase 1 scope: Schema / Blueprint / Skin / FormationConfig CRUD.
 * Phase 2+: instance acquisition, progression, slot management, formations.
 *
 * ---------------------------------------------------------------------
 * neon-http: no transactions
 * ---------------------------------------------------------------------
 *
 * Every write path is a single atomic SQL statement. All mutable
 * per-player state uses the `version` column for optimistic concurrency
 * control — the write includes `WHERE version = ?` and the caller
 * retries or reports conflict on zero affected rows.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  entityBlueprints,
  entityBlueprintSkins,
  entityFormationConfigs,
  entitySchemas,
} from "../../schema/entity";
import {
  EntityAliasConflict,
  EntityBlueprintNotFound,
  EntityFormationConfigNotFound,
  EntityInvalidInput,
  EntitySchemaNotFound,
  EntitySkinNotFound,
} from "./errors";
import type {
  EntityBlueprint,
  EntityBlueprintSkin,
  EntityFormationConfig,
  EntitySchema,
} from "./types";
import type {
  CreateBlueprintInputType,
  CreateFormationConfigInputType,
  CreateSchemaInputType,
  CreateSkinInputType,
  UpdateBlueprintInputType,
  UpdateFormationConfigInputType,
  UpdateSchemaInputType,
  UpdateSkinInputType,
} from "./validators";

type EntityDeps = Pick<AppDeps, "db">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}

export function createEntityService(d: EntityDeps) {
  const { db } = d;

  // ═══════════════════════════════════════════════════════════════
  // Schema CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadSchemaByKey(
    organizationId: string,
    key: string,
  ): Promise<EntitySchema> {
    const where = looksLikeId(key)
      ? and(
          eq(entitySchemas.organizationId, organizationId),
          eq(entitySchemas.id, key),
        )
      : and(
          eq(entitySchemas.organizationId, organizationId),
          eq(entitySchemas.alias, key),
        );
    const rows = await db.select().from(entitySchemas).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new EntitySchemaNotFound(key);
    return row;
  }

  async function createSchema(
    organizationId: string,
    input: CreateSchemaInputType,
  ): Promise<EntitySchema> {
    try {
      const rows = await db
        .insert(entitySchemas)
        .values({
          organizationId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          icon: input.icon ?? null,
          statDefinitions: input.statDefinitions ?? [],
          tagDefinitions: input.tagDefinitions ?? [],
          slotDefinitions: input.slotDefinitions ?? [],
          levelConfig: input.levelConfig ?? { enabled: false, maxLevel: 1 },
          rankConfig: input.rankConfig ?? { enabled: false, ranks: [] },
          synthesisConfig: input.synthesisConfig ?? {
            enabled: false,
            sameBlueprint: true,
            inputCount: 2,
          },
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function updateSchema(
    organizationId: string,
    id: string,
    input: UpdateSchemaInputType,
  ): Promise<EntitySchema> {
    const existing = await loadSchemaByKey(organizationId, id);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.alias !== undefined) patch.alias = input.alias;
    if (input.description !== undefined) patch.description = input.description;
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.statDefinitions !== undefined)
      patch.statDefinitions = input.statDefinitions;
    if (input.tagDefinitions !== undefined)
      patch.tagDefinitions = input.tagDefinitions;
    if (input.slotDefinitions !== undefined)
      patch.slotDefinitions = input.slotDefinitions;
    if (input.levelConfig !== undefined) patch.levelConfig = input.levelConfig;
    if (input.rankConfig !== undefined) patch.rankConfig = input.rankConfig;
    if (input.synthesisConfig !== undefined)
      patch.synthesisConfig = input.synthesisConfig;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entitySchemas)
        .set(patch)
        .where(
          and(
            eq(entitySchemas.organizationId, organizationId),
            eq(entitySchemas.id, existing.id),
          ),
        )
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function deleteSchema(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadSchemaByKey(organizationId, id);
    await db
      .delete(entitySchemas)
      .where(
        and(
          eq(entitySchemas.organizationId, organizationId),
          eq(entitySchemas.id, existing.id),
        ),
      );
  }

  async function listSchemas(organizationId: string): Promise<EntitySchema[]> {
    return db
      .select()
      .from(entitySchemas)
      .where(eq(entitySchemas.organizationId, organizationId))
      .orderBy(asc(entitySchemas.sortOrder), asc(entitySchemas.name));
  }

  async function getSchema(
    organizationId: string,
    key: string,
  ): Promise<EntitySchema> {
    return loadSchemaByKey(organizationId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Blueprint CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadBlueprintByKey(
    organizationId: string,
    key: string,
  ): Promise<EntityBlueprint> {
    const where = looksLikeId(key)
      ? and(
          eq(entityBlueprints.organizationId, organizationId),
          eq(entityBlueprints.id, key),
        )
      : and(
          eq(entityBlueprints.organizationId, organizationId),
          eq(entityBlueprints.alias, key),
        );
    const rows = await db
      .select()
      .from(entityBlueprints)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new EntityBlueprintNotFound(key);
    return row;
  }

  async function createBlueprint(
    organizationId: string,
    input: CreateBlueprintInputType,
  ): Promise<EntityBlueprint> {
    // Validate schema exists
    await loadSchemaByKey(organizationId, input.schemaId);

    try {
      const rows = await db
        .insert(entityBlueprints)
        .values({
          organizationId,
          schemaId: input.schemaId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          icon: input.icon ?? null,
          rarity: input.rarity ?? null,
          tags: input.tags ?? {},
          assets: input.assets ?? {},
          baseStats: input.baseStats ?? {},
          statGrowth: input.statGrowth ?? {},
          levelUpCosts: input.levelUpCosts ?? [],
          rankUpCosts: input.rankUpCosts ?? [],
          synthesisCost: input.synthesisCost ?? null,
          maxLevel: input.maxLevel ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function updateBlueprint(
    organizationId: string,
    id: string,
    input: UpdateBlueprintInputType,
  ): Promise<EntityBlueprint> {
    const existing = await loadBlueprintByKey(organizationId, id);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.alias !== undefined) patch.alias = input.alias;
    if (input.description !== undefined) patch.description = input.description;
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.rarity !== undefined) patch.rarity = input.rarity;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.assets !== undefined) patch.assets = input.assets;
    if (input.baseStats !== undefined) patch.baseStats = input.baseStats;
    if (input.statGrowth !== undefined) patch.statGrowth = input.statGrowth;
    if (input.levelUpCosts !== undefined)
      patch.levelUpCosts = input.levelUpCosts;
    if (input.rankUpCosts !== undefined) patch.rankUpCosts = input.rankUpCosts;
    if (input.synthesisCost !== undefined)
      patch.synthesisCost = input.synthesisCost;
    if (input.maxLevel !== undefined) patch.maxLevel = input.maxLevel;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entityBlueprints)
        .set(patch)
        .where(
          and(
            eq(entityBlueprints.organizationId, organizationId),
            eq(entityBlueprints.id, existing.id),
          ),
        )
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function deleteBlueprint(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadBlueprintByKey(organizationId, id);
    await db
      .delete(entityBlueprints)
      .where(
        and(
          eq(entityBlueprints.organizationId, organizationId),
          eq(entityBlueprints.id, existing.id),
        ),
      );
  }

  async function listBlueprints(
    organizationId: string,
    opts?: { schemaId?: string },
  ): Promise<EntityBlueprint[]> {
    const conditions = [eq(entityBlueprints.organizationId, organizationId)];
    if (opts?.schemaId) {
      conditions.push(eq(entityBlueprints.schemaId, opts.schemaId));
    }
    return db
      .select()
      .from(entityBlueprints)
      .where(and(...conditions))
      .orderBy(asc(entityBlueprints.sortOrder), asc(entityBlueprints.name));
  }

  async function getBlueprint(
    organizationId: string,
    key: string,
  ): Promise<EntityBlueprint> {
    return loadBlueprintByKey(organizationId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Skin CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadSkinById(
    organizationId: string,
    skinId: string,
  ): Promise<EntityBlueprintSkin> {
    const rows = await db
      .select()
      .from(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.organizationId, organizationId),
          eq(entityBlueprintSkins.id, skinId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new EntitySkinNotFound(skinId);
    return row;
  }

  async function createSkin(
    organizationId: string,
    blueprintId: string,
    input: CreateSkinInputType,
  ): Promise<EntityBlueprintSkin> {
    // Validate blueprint exists
    await loadBlueprintByKey(organizationId, blueprintId);

    try {
      const rows = await db
        .insert(entityBlueprintSkins)
        .values({
          organizationId,
          blueprintId,
          name: input.name,
          alias: input.alias ?? null,
          rarity: input.rarity ?? null,
          assets: input.assets ?? {},
          statBonuses: input.statBonuses ?? {},
          isDefault: input.isDefault ?? false,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function updateSkin(
    organizationId: string,
    skinId: string,
    input: UpdateSkinInputType,
  ): Promise<EntityBlueprintSkin> {
    const existing = await loadSkinById(organizationId, skinId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.alias !== undefined) patch.alias = input.alias;
    if (input.rarity !== undefined) patch.rarity = input.rarity;
    if (input.assets !== undefined) patch.assets = input.assets;
    if (input.statBonuses !== undefined) patch.statBonuses = input.statBonuses;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entityBlueprintSkins)
        .set(patch)
        .where(
          and(
            eq(entityBlueprintSkins.organizationId, organizationId),
            eq(entityBlueprintSkins.id, existing.id),
          ),
        )
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function deleteSkin(
    organizationId: string,
    skinId: string,
  ): Promise<void> {
    const existing = await loadSkinById(organizationId, skinId);
    await db
      .delete(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.organizationId, organizationId),
          eq(entityBlueprintSkins.id, existing.id),
        ),
      );
  }

  async function listSkins(
    organizationId: string,
    blueprintId: string,
  ): Promise<EntityBlueprintSkin[]> {
    return db
      .select()
      .from(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.organizationId, organizationId),
          eq(entityBlueprintSkins.blueprintId, blueprintId),
        ),
      )
      .orderBy(
        asc(entityBlueprintSkins.sortOrder),
        asc(entityBlueprintSkins.name),
      );
  }

  async function getSkin(
    organizationId: string,
    skinId: string,
  ): Promise<EntityBlueprintSkin> {
    return loadSkinById(organizationId, skinId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Formation Config CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadFormationConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<EntityFormationConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(entityFormationConfigs.organizationId, organizationId),
          eq(entityFormationConfigs.id, key),
        )
      : and(
          eq(entityFormationConfigs.organizationId, organizationId),
          eq(entityFormationConfigs.alias, key),
        );
    const rows = await db
      .select()
      .from(entityFormationConfigs)
      .where(where)
      .limit(1);
    const row = rows[0];
    if (!row) throw new EntityFormationConfigNotFound(key);
    return row;
  }

  async function createFormationConfig(
    organizationId: string,
    input: CreateFormationConfigInputType,
  ): Promise<EntityFormationConfig> {
    try {
      const rows = await db
        .insert(entityFormationConfigs)
        .values({
          organizationId,
          name: input.name,
          alias: input.alias ?? null,
          maxFormations: input.maxFormations ?? 5,
          maxSlots: input.maxSlots ?? 4,
          acceptsSchemaIds: input.acceptsSchemaIds ?? [],
          allowDuplicateBlueprints: input.allowDuplicateBlueprints ?? false,
          metadata: input.metadata ?? null,
        })
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function updateFormationConfig(
    organizationId: string,
    id: string,
    input: UpdateFormationConfigInputType,
  ): Promise<EntityFormationConfig> {
    const existing = await loadFormationConfigByKey(organizationId, id);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.alias !== undefined) patch.alias = input.alias;
    if (input.maxFormations !== undefined)
      patch.maxFormations = input.maxFormations;
    if (input.maxSlots !== undefined) patch.maxSlots = input.maxSlots;
    if (input.acceptsSchemaIds !== undefined)
      patch.acceptsSchemaIds = input.acceptsSchemaIds;
    if (input.allowDuplicateBlueprints !== undefined)
      patch.allowDuplicateBlueprints = input.allowDuplicateBlueprints;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entityFormationConfigs)
        .set(patch)
        .where(
          and(
            eq(entityFormationConfigs.organizationId, organizationId),
            eq(entityFormationConfigs.id, existing.id),
          ),
        )
        .returning();
      return rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new EntityAliasConflict(input.alias ?? "");
      throw err;
    }
  }

  async function deleteFormationConfig(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadFormationConfigByKey(organizationId, id);
    await db
      .delete(entityFormationConfigs)
      .where(
        and(
          eq(entityFormationConfigs.organizationId, organizationId),
          eq(entityFormationConfigs.id, existing.id),
        ),
      );
  }

  async function listFormationConfigs(
    organizationId: string,
  ): Promise<EntityFormationConfig[]> {
    return db
      .select()
      .from(entityFormationConfigs)
      .where(eq(entityFormationConfigs.organizationId, organizationId))
      .orderBy(asc(entityFormationConfigs.name));
  }

  async function getFormationConfig(
    organizationId: string,
    key: string,
  ): Promise<EntityFormationConfig> {
    return loadFormationConfigByKey(organizationId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════

  return {
    // Schema
    createSchema,
    updateSchema,
    deleteSchema,
    listSchemas,
    getSchema,

    // Blueprint
    createBlueprint,
    updateBlueprint,
    deleteBlueprint,
    listBlueprints,
    getBlueprint,

    // Skin
    createSkin,
    updateSkin,
    deleteSkin,
    listSkins,
    getSkin,

    // Formation Config
    createFormationConfig,
    updateFormationConfig,
    deleteFormationConfig,
    listFormationConfigs,
    getFormationConfig,
  };
}

export type EntityService = ReturnType<typeof createEntityService>;
