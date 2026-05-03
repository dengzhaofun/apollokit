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
 * Single-statement writes + optimistic concurrency
 * ---------------------------------------------------------------------
 *
 * Every write path is a single atomic SQL statement. Mutable per-player
 * state uses the `version` column for optimistic concurrency — the write
 * includes `WHERE version = ?` and the caller retries or reports conflict
 * on zero affected rows.
 */

import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { type MoveBody, appendKey, moveAndReturn } from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  entityActionLogs,
  entityBlueprints,
  entityBlueprintSkins,
  entityFormationConfigs,
  entityFormations,
  entityInstances,
  entitySchemas,
  entitySlotAssignments,
  type FormationSlot,
  type LevelConfig,
  type RankConfig,
  type RankUpCost,
  type SlotDefinition,
  type SynthesisConfig,
} from "../../schema/entity";
import { assertActivityWritable } from "../activity/gate";
import {
  EntityAliasConflict,
  EntityAlreadyEquipped,
  EntityBlueprintNotFound,
  EntityConcurrencyConflict,
  EntityFormationConfigNotFound,
  EntityInsufficientMaterials,
  EntityInstanceNotFound,
  EntityInvalidInput,
  EntityLocked,
  EntityMaxLevelReached,
  EntityMaxRankReached,
  EntitySchemaNotFound,
  EntitySkinNotFound,
  EntitySlotIncompatible,
  EntitySlotOccupied,
  EntitySynthesisInvalid,
} from "./errors";
import type {
  EntityAction,
  EntityBlueprint,
  EntityBlueprintSkin,
  EntityFormation,
  EntityFormationConfig,
  EntityInstance,
  EntitySchema,
  EntitySlotAssignment,
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

/** Minimal item service interface — avoids circular import. */
export type ItemSvc = {
  grantItems: (params: {
    tenantId: string;
    endUserId: string;
    grants: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }) => Promise<unknown>;
  deductItems: (params: {
    tenantId: string;
    endUserId: string;
    deductions: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }) => Promise<unknown>;
};

export function createEntityService(d: EntityDeps, itemSvc?: ItemSvc) {
  const { db } = d;

  // ═══════════════════════════════════════════════════════════════
  // Schema CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadSchemaByKey(
    tenantId: string,
    key: string,
  ): Promise<EntitySchema> {
    const where = looksLikeId(key)
      ? and(
          eq(entitySchemas.tenantId, tenantId),
          eq(entitySchemas.id, key),
        )
      : and(
          eq(entitySchemas.tenantId, tenantId),
          eq(entitySchemas.alias, key),
        );
    const rows = await db.select().from(entitySchemas).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new EntitySchemaNotFound(key);
    return row;
  }

  async function createSchema(
    tenantId: string,
    input: CreateSchemaInputType,
  ): Promise<EntitySchema> {
    try {
      const __sortKey = await appendKey(db, { table: entitySchemas, sortColumn: entitySchemas.sortOrder, scopeWhere: eq(entitySchemas.tenantId, tenantId)! });
      const rows = await db
        .insert(entitySchemas)
        .values({
          tenantId,
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
          sortOrder: __sortKey,
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
    tenantId: string,
    id: string,
    input: UpdateSchemaInputType,
  ): Promise<EntitySchema> {
    const existing = await loadSchemaByKey(tenantId, id);

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
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entitySchemas)
        .set(patch)
        .where(
          and(
            eq(entitySchemas.tenantId, tenantId),
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

  async function moveSchema(
    tenantId: string,
    key: string,
    body: MoveBody,
  ): Promise<EntitySchema> {
    const existing = await loadSchemaByKey(tenantId, key);
    return moveAndReturn<EntitySchema>(db, {
      table: entitySchemas,
      sortColumn: entitySchemas.sortOrder,
      idColumn: entitySchemas.id,
      partitionWhere: eq(entitySchemas.tenantId, tenantId)!,
      id: existing.id,
      body,
      notFound: (sid) => new EntitySchemaNotFound(sid),
    });
  }

  async function deleteSchema(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadSchemaByKey(tenantId, id);
    await db
      .delete(entitySchemas)
      .where(
        and(
          eq(entitySchemas.tenantId, tenantId),
          eq(entitySchemas.id, existing.id),
        ),
      );
  }

  async function listSchemas(
    tenantId: string,
    params: PageParams = {},
  ): Promise<Page<EntitySchema>> {
    const limit = clampLimit(params.limit);
    const conds: SQL[] = [eq(entitySchemas.tenantId, tenantId)];
    const seek = cursorWhere(params.cursor, entitySchemas.createdAt, entitySchemas.id);
    if (seek) conds.push(seek);
    if (params.q) {
      const pat = `%${params.q}%`;
      const search = or(ilike(entitySchemas.name, pat), ilike(entitySchemas.alias, pat));
      if (search) conds.push(search);
    }
    const rows = await db
      .select()
      .from(entitySchemas)
      .where(and(...conds))
      .orderBy(asc(entitySchemas.sortOrder), asc(entitySchemas.createdAt))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getSchema(
    tenantId: string,
    key: string,
  ): Promise<EntitySchema> {
    return loadSchemaByKey(tenantId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Blueprint CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadBlueprintByKey(
    tenantId: string,
    key: string,
  ): Promise<EntityBlueprint> {
    const where = looksLikeId(key)
      ? and(
          eq(entityBlueprints.tenantId, tenantId),
          eq(entityBlueprints.id, key),
        )
      : and(
          eq(entityBlueprints.tenantId, tenantId),
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
    tenantId: string,
    input: CreateBlueprintInputType,
  ): Promise<EntityBlueprint> {
    // Validate schema exists
    await loadSchemaByKey(tenantId, input.schemaId);

    try {
      const __sortKey = await appendKey(db, { table: entityBlueprints, sortColumn: entityBlueprints.sortOrder, scopeWhere: eq(entityBlueprints.tenantId, tenantId)! });
      const rows = await db
        .insert(entityBlueprints)
        .values({
          tenantId,
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
          sortOrder: __sortKey,
          isActive: input.isActive ?? true,
          activityId: input.activityId ?? null,
          activityNodeId: input.activityNodeId ?? null,
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
    tenantId: string,
    id: string,
    input: UpdateBlueprintInputType,
  ): Promise<EntityBlueprint> {
    const existing = await loadBlueprintByKey(tenantId, id);

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
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.activityId !== undefined) patch.activityId = input.activityId;
    if (input.activityNodeId !== undefined)
      patch.activityNodeId = input.activityNodeId;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entityBlueprints)
        .set(patch)
        .where(
          and(
            eq(entityBlueprints.tenantId, tenantId),
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

  async function moveBlueprint(
    tenantId: string,
    key: string,
    body: MoveBody,
  ): Promise<EntityBlueprint> {
    const existing = await loadBlueprintByKey(tenantId, key);
    // Scope by schemaId so blueprints reorder within their parent schema only.
    return moveAndReturn<EntityBlueprint>(db, {
      table: entityBlueprints,
      sortColumn: entityBlueprints.sortOrder,
      idColumn: entityBlueprints.id,
      partitionWhere: and(
        eq(entityBlueprints.tenantId, tenantId),
        eq(entityBlueprints.schemaId, existing.schemaId),
      )!,
      id: existing.id,
      body,
      notFound: (sid) => new EntityBlueprintNotFound(sid),
    });
  }

  async function deleteBlueprint(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadBlueprintByKey(tenantId, id);
    await db
      .delete(entityBlueprints)
      .where(
        and(
          eq(entityBlueprints.tenantId, tenantId),
          eq(entityBlueprints.id, existing.id),
        ),
      );
  }

  async function listBlueprints(
    tenantId: string,
    opts: PageParams & { schemaId?: string; activityId?: string | null } = {},
  ): Promise<Page<EntityBlueprint>> {
    const limit = clampLimit(opts.limit);
    const conditions: SQL[] = [eq(entityBlueprints.tenantId, tenantId)];
    if (opts.schemaId) {
      conditions.push(eq(entityBlueprints.schemaId, opts.schemaId));
    }
    if (opts.activityId !== undefined) {
      if (opts.activityId === null) {
        conditions.push(sql`${entityBlueprints.activityId} IS NULL`);
      } else {
        conditions.push(eq(entityBlueprints.activityId, opts.activityId));
      }
    }
    const seek = cursorWhere(opts.cursor, entityBlueprints.createdAt, entityBlueprints.id);
    if (seek) conditions.push(seek);
    if (opts.q) {
      const pat = `%${opts.q}%`;
      const search = or(ilike(entityBlueprints.name, pat), ilike(entityBlueprints.alias, pat));
      if (search) conditions.push(search);
    }
    const rows = await db
      .select()
      .from(entityBlueprints)
      .where(and(...conditions))
      .orderBy(asc(entityBlueprints.sortOrder), asc(entityBlueprints.createdAt))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getBlueprint(
    tenantId: string,
    key: string,
  ): Promise<EntityBlueprint> {
    return loadBlueprintByKey(tenantId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Skin CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadSkinById(
    tenantId: string,
    skinId: string,
  ): Promise<EntityBlueprintSkin> {
    const rows = await db
      .select()
      .from(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.tenantId, tenantId),
          eq(entityBlueprintSkins.id, skinId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new EntitySkinNotFound(skinId);
    return row;
  }

  async function createSkin(
    tenantId: string,
    blueprintId: string,
    input: CreateSkinInputType,
  ): Promise<EntityBlueprintSkin> {
    // Validate blueprint exists
    await loadBlueprintByKey(tenantId, blueprintId);

    try {
      const __sortKey = await appendKey(db, { table: entityBlueprintSkins, sortColumn: entityBlueprintSkins.sortOrder, scopeWhere: eq(entityBlueprintSkins.tenantId, tenantId)! });
      const rows = await db
        .insert(entityBlueprintSkins)
        .values({
          tenantId,
          blueprintId,
          name: input.name,
          alias: input.alias ?? null,
          rarity: input.rarity ?? null,
          assets: input.assets ?? {},
          statBonuses: input.statBonuses ?? {},
          isDefault: input.isDefault ?? false,
          sortOrder: __sortKey,
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
    tenantId: string,
    skinId: string,
    input: UpdateSkinInputType,
  ): Promise<EntityBlueprintSkin> {
    const existing = await loadSkinById(tenantId, skinId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.alias !== undefined) patch.alias = input.alias;
    if (input.rarity !== undefined) patch.rarity = input.rarity;
    if (input.assets !== undefined) patch.assets = input.assets;
    if (input.statBonuses !== undefined) patch.statBonuses = input.statBonuses;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    try {
      const rows = await db
        .update(entityBlueprintSkins)
        .set(patch)
        .where(
          and(
            eq(entityBlueprintSkins.tenantId, tenantId),
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

  async function moveSkin(
    tenantId: string,
    skinId: string,
    body: MoveBody,
  ): Promise<EntityBlueprintSkin> {
    const existing = await loadSkinById(tenantId, skinId);
    return moveAndReturn<EntityBlueprintSkin>(db, {
      table: entityBlueprintSkins,
      sortColumn: entityBlueprintSkins.sortOrder,
      idColumn: entityBlueprintSkins.id,
      partitionWhere: and(
        eq(entityBlueprintSkins.tenantId, tenantId),
        eq(entityBlueprintSkins.blueprintId, existing.blueprintId),
      )!,
      id: existing.id,
      body,
      notFound: (sid) => new EntitySkinNotFound(sid),
    });
  }

  async function deleteSkin(
    tenantId: string,
    skinId: string,
  ): Promise<void> {
    const existing = await loadSkinById(tenantId, skinId);
    await db
      .delete(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.tenantId, tenantId),
          eq(entityBlueprintSkins.id, existing.id),
        ),
      );
  }

  async function listSkins(
    tenantId: string,
    blueprintId: string,
  ): Promise<EntityBlueprintSkin[]> {
    return db
      .select()
      .from(entityBlueprintSkins)
      .where(
        and(
          eq(entityBlueprintSkins.tenantId, tenantId),
          eq(entityBlueprintSkins.blueprintId, blueprintId),
        ),
      )
      .orderBy(
        asc(entityBlueprintSkins.sortOrder),
        asc(entityBlueprintSkins.name),
      );
  }

  async function getSkin(
    tenantId: string,
    skinId: string,
  ): Promise<EntityBlueprintSkin> {
    return loadSkinById(tenantId, skinId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Formation Config CRUD
  // ═══════════════════════════════════════════════════════════════

  async function loadFormationConfigByKey(
    tenantId: string,
    key: string,
  ): Promise<EntityFormationConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(entityFormationConfigs.tenantId, tenantId),
          eq(entityFormationConfigs.id, key),
        )
      : and(
          eq(entityFormationConfigs.tenantId, tenantId),
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
    tenantId: string,
    input: CreateFormationConfigInputType,
  ): Promise<EntityFormationConfig> {
    try {
      const rows = await db
        .insert(entityFormationConfigs)
        .values({
          tenantId,
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
    tenantId: string,
    id: string,
    input: UpdateFormationConfigInputType,
  ): Promise<EntityFormationConfig> {
    const existing = await loadFormationConfigByKey(tenantId, id);

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
            eq(entityFormationConfigs.tenantId, tenantId),
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
    tenantId: string,
    id: string,
  ): Promise<void> {
    const existing = await loadFormationConfigByKey(tenantId, id);
    await db
      .delete(entityFormationConfigs)
      .where(
        and(
          eq(entityFormationConfigs.tenantId, tenantId),
          eq(entityFormationConfigs.id, existing.id),
        ),
      );
  }

  async function listFormationConfigs(
    tenantId: string,
    params: PageParams = {},
  ): Promise<Page<EntityFormationConfig>> {
    const limit = clampLimit(params.limit);
    const conds: SQL[] = [eq(entityFormationConfigs.tenantId, tenantId)];
    const seek = cursorWhere(
      params.cursor,
      entityFormationConfigs.createdAt,
      entityFormationConfigs.id,
    );
    if (seek) conds.push(seek);
    if (params.q) {
      const pat = `%${params.q}%`;
      const search = or(
        ilike(entityFormationConfigs.name, pat),
        ilike(entityFormationConfigs.alias, pat),
      );
      if (search) conds.push(search);
    }
    const rows = await db
      .select()
      .from(entityFormationConfigs)
      .where(and(...conds))
      .orderBy(desc(entityFormationConfigs.createdAt), desc(entityFormationConfigs.id))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getFormationConfig(
    tenantId: string,
    key: string,
  ): Promise<EntityFormationConfig> {
    return loadFormationConfigByKey(tenantId, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // Stat Computation (pure function)
  // ═══════════════════════════════════════════════════════════════

  function computeStats(
    blueprint: EntityBlueprint,
    instance: { level: number; rankKey: string | null },
    equippedStats: Record<string, number>[],
    skinBonuses?: Record<string, number>,
  ): Record<string, number> {
    const stats: Record<string, number> = {};

    // Base stats
    for (const [key, val] of Object.entries(blueprint.baseStats)) {
      stats[key] = val;
    }

    // Level growth: baseStats + statGrowth × (level - 1)
    for (const [key, growth] of Object.entries(blueprint.statGrowth)) {
      stats[key] = (stats[key] ?? 0) + growth * (instance.level - 1);
    }

    // Rank bonuses: accumulate bonuses for ranks ALREADY REACHED.
    // rankUpCosts[i] = { fromRank: "N", toRank: "R", statBonuses: {...} }
    // The bonus is earned AFTER ranking up TO toRank. So if current rank
    // is "R", we apply the N→R bonus. If current rank is "N", we apply nothing.
    if (instance.rankKey && blueprint.rankUpCosts.length > 0) {
      for (const rc of blueprint.rankUpCosts) {
        // Apply bonus only if the entity has ALREADY ranked up past this entry
        // i.e., the toRank of this cost has been reached
        // We check: does any LATER cost have fromRank = rc.toRank? Or is
        // rc.toRank == current rank? Either way, the entity went through this rank-up.
        if (rc.fromRank === instance.rankKey) {
          // Current rank matches fromRank — this rank-up hasn't happened yet
          break;
        }
        // This rank-up has been completed, apply bonus
        for (const [key, bonus] of Object.entries(rc.statBonuses)) {
          stats[key] = (stats[key] ?? 0) + bonus;
        }
        if (rc.toRank === instance.rankKey) break;
      }
    }

    // Equipment stats (from slot assignments)
    for (const eqStats of equippedStats) {
      for (const [key, val] of Object.entries(eqStats)) {
        stats[key] = (stats[key] ?? 0) + val;
      }
    }

    // Skin bonuses
    if (skinBonuses) {
      for (const [key, val] of Object.entries(skinBonuses)) {
        stats[key] = (stats[key] ?? 0) + val;
      }
    }

    return stats;
  }

  /** Recompute and persist computedStats for an instance. */
  async function recomputeAndSave(
    tenantId: string,
    instanceId: string,
  ): Promise<EntityInstance> {
    const inst = await loadInstanceById(tenantId, instanceId);
    const bp = await loadBlueprintByKey(tenantId, inst.blueprintId);

    // Load equipped entities' computed stats
    const slots = await db
      .select()
      .from(entitySlotAssignments)
      .where(eq(entitySlotAssignments.ownerInstanceId, instanceId));

    const equippedStats: Record<string, number>[] = [];
    for (const slot of slots) {
      const eqInst = await loadInstanceById(
        tenantId,
        slot.equippedInstanceId,
      );
      equippedStats.push(eqInst.computedStats);
    }

    // Load skin bonuses
    let skinBonuses: Record<string, number> | undefined;
    if (inst.skinId) {
      const skin = await loadSkinById(tenantId, inst.skinId);
      skinBonuses = skin.statBonuses;
    }

    const newStats = computeStats(bp, inst, equippedStats, skinBonuses);

    const rows = await db
      .update(entityInstances)
      .set({ computedStats: newStats })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
        ),
      )
      .returning();
    return rows[0]!;
  }

  // ═══════════════════════════════════════════════════════════════
  // Instance Management (Phase 2)
  // ═══════════════════════════════════════════════════════════════

  async function loadInstanceById(
    tenantId: string,
    id: string,
  ): Promise<EntityInstance> {
    const rows = await db
      .select()
      .from(entityInstances)
      .where(
        and(
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new EntityInstanceNotFound(id);
    return row;
  }

  async function acquireEntity(
    tenantId: string,
    endUserId: string,
    blueprintId: string,
    source: string,
    sourceId?: string,
    context?: { activityId?: string; activityNodeId?: string },
  ): Promise<EntityInstance> {
    const bp = await loadBlueprintByKey(tenantId, blueprintId);
    const schema = await loadSchemaByKey(tenantId, bp.schemaId);

    // Activity-phase gate: if the blueprint is bound to an activity,
    // minting new instances of it is restricted to the activity's
    // writable phase ('active'). Operations on already-acquired
    // instances (levelUp, equip, …) are intentionally NOT gated —
    // entities persist past the activity.
    if (bp.activityId) {
      await assertActivityWritable(db, bp.activityId);
    }

    // Determine initial rank
    const initialRank =
      schema.rankConfig.enabled && schema.rankConfig.ranks.length > 0
        ? schema.rankConfig.ranks[0]!.key
        : null;

    // Compute initial stats (level 1, no equipment, no skin)
    const initialStats = computeStats(bp, { level: 1, rankKey: initialRank }, []);

    // The instance's `activity_id` records *which* activity owned the
    // grant. Prefer the explicit context (a player completing a task in
    // activity X grants a non-activity-bound blueprint) over the
    // blueprint's own activity_id (which only fires when the blueprint
    // itself was provisioned per-activity).
    const instanceActivityId =
      context?.activityId ?? bp.activityId ?? null;
    const instanceActivityNodeId =
      context?.activityNodeId ?? bp.activityNodeId ?? null;

    const rows = await db
      .insert(entityInstances)
      .values({
        tenantId,
        endUserId,
        blueprintId: bp.id,
        schemaId: bp.schemaId,
        level: 1,
        exp: 0,
        rankKey: initialRank,
        computedStats: initialStats,
        activityId: instanceActivityId,
        activityNodeId: instanceActivityNodeId,
      })
      .returning();

    const inst = rows[0]!;

    // Log
    await logAction(tenantId, endUserId, inst.id, "acquire", {
      blueprintId: bp.id,
      source,
      sourceId,
      activityId: instanceActivityId,
      activityNodeId: instanceActivityNodeId,
    });

    return inst;
  }

  async function listInstances(
    tenantId: string,
    endUserId: string,
    opts?: { schemaId?: string; blueprintId?: string },
  ): Promise<EntityInstance[]> {
    const conditions = [
      eq(entityInstances.tenantId, tenantId),
      eq(entityInstances.endUserId, endUserId),
    ];
    if (opts?.schemaId)
      conditions.push(eq(entityInstances.schemaId, opts.schemaId));
    if (opts?.blueprintId)
      conditions.push(eq(entityInstances.blueprintId, opts.blueprintId));

    return db
      .select()
      .from(entityInstances)
      .where(and(...conditions))
      .orderBy(desc(entityInstances.acquiredAt));
  }

  async function getInstance(
    tenantId: string,
    endUserId: string,
    instanceId: string,
  ): Promise<{
    instance: EntityInstance;
    slots: EntitySlotAssignment[];
  }> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    const slots = await db
      .select()
      .from(entitySlotAssignments)
      .where(eq(entitySlotAssignments.ownerInstanceId, instanceId));

    return { instance: inst, slots };
  }

  async function discardEntity(
    tenantId: string,
    endUserId: string,
    instanceId: string,
  ): Promise<void> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);
    if (inst.isLocked) throw new EntityLocked();

    // Check not equipped in any slot
    const equipped = await db
      .select()
      .from(entitySlotAssignments)
      .where(eq(entitySlotAssignments.equippedInstanceId, instanceId))
      .limit(1);
    if (equipped.length > 0)
      throw new EntityInvalidInput(
        "cannot discard an entity that is equipped in a slot",
      );

    await db
      .delete(entityInstances)
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
        ),
      );

    await logAction(tenantId, endUserId, instanceId, "discard", {
      blueprintId: inst.blueprintId,
      level: inst.level,
    });
  }

  async function toggleLock(
    tenantId: string,
    endUserId: string,
    instanceId: string,
    locked: boolean,
  ): Promise<EntityInstance> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    const rows = await db
      .update(entityInstances)
      .set({ isLocked: locked })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, inst.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(
      tenantId,
      endUserId,
      instanceId,
      locked ? "lock" : "unlock",
      {},
    );

    return rows[0]!;
  }

  // ═══════════════════════════════════════════════════════════════
  // Progression (Phase 3)
  // ═══════════════════════════════════════════════════════════════

  async function addExp(
    tenantId: string,
    endUserId: string,
    instanceId: string,
    amount: number,
  ): Promise<EntityInstance> {
    if (amount <= 0)
      throw new EntityInvalidInput("exp amount must be positive");

    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    const bp = await loadBlueprintByKey(tenantId, inst.blueprintId);
    const schema = await loadSchemaByKey(tenantId, bp.schemaId);

    if (!schema.levelConfig.enabled)
      throw new EntityInvalidInput("leveling is not enabled for this schema");

    const maxLevel = bp.maxLevel ?? schema.levelConfig.maxLevel;
    const newExp = inst.exp + amount;

    // Auto level-up: check if exp exceeds level thresholds
    // For now, just accumulate exp — levelUp is explicit via costs
    const rows = await db
      .update(entityInstances)
      .set({ exp: newExp })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, inst.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(tenantId, endUserId, instanceId, "add_exp", {
      amount,
      expBefore: inst.exp,
      expAfter: newExp,
    });

    return rows[0]!;
  }

  async function levelUp(
    tenantId: string,
    endUserId: string,
    instanceId: string,
    targetLevel?: number,
  ): Promise<EntityInstance> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    const bp = await loadBlueprintByKey(tenantId, inst.blueprintId);
    const schema = await loadSchemaByKey(tenantId, bp.schemaId);

    if (!schema.levelConfig.enabled)
      throw new EntityInvalidInput("leveling is not enabled for this schema");

    const maxLevel = bp.maxLevel ?? schema.levelConfig.maxLevel;
    const target = targetLevel ?? inst.level + 1;

    if (inst.level >= maxLevel) throw new EntityMaxLevelReached();
    if (target > maxLevel) throw new EntityMaxLevelReached();
    if (target <= inst.level)
      throw new EntityInvalidInput("target level must be higher than current");

    // Collect costs for all levels from current+1 to target
    if (itemSvc && bp.levelUpCosts.length > 0) {
      const totalCost: Record<string, number> = {};
      for (let lv = inst.level + 1; lv <= target; lv++) {
        const costEntry = bp.levelUpCosts.find((c) => c.level === lv);
        if (costEntry) {
          for (const item of costEntry.cost) {
            totalCost[item.id] =
              (totalCost[item.id] ?? 0) + item.count;
          }
        }
      }

      const deductions = Object.entries(totalCost).map(([defId, qty]) => ({
        definitionId: defId,
        quantity: qty,
      }));

      if (deductions.length > 0) {
        try {
          await itemSvc.deductItems({
            tenantId,
            endUserId,
            deductions,
            source: "entity.level_up",
            sourceId: instanceId,
          });
        } catch {
          throw new EntityInsufficientMaterials();
        }
      }
    }

    // Update level with OCC
    const rows = await db
      .update(entityInstances)
      .set({ level: target, version: sql`${entityInstances.version} + 1` })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, inst.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(tenantId, endUserId, instanceId, "level_up", {
      levelBefore: inst.level,
      levelAfter: target,
    });

    // Recompute stats
    return recomputeAndSave(tenantId, instanceId);
  }

  async function rankUp(
    tenantId: string,
    endUserId: string,
    instanceId: string,
  ): Promise<EntityInstance> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    const bp = await loadBlueprintByKey(tenantId, inst.blueprintId);
    const schema = await loadSchemaByKey(tenantId, bp.schemaId);

    if (!schema.rankConfig.enabled)
      throw new EntityInvalidInput("ranking is not enabled for this schema");

    // Find current rank's upgrade cost
    const costEntry = bp.rankUpCosts.find(
      (c) => c.fromRank === inst.rankKey,
    );
    if (!costEntry) throw new EntityMaxRankReached();

    // Deduct materials
    if (itemSvc && costEntry.cost.length > 0) {
      try {
        await itemSvc.deductItems({
          tenantId,
          endUserId,
          deductions: costEntry.cost
            .filter((c) => c.type === "item")
            .map((c) => ({ definitionId: c.id, quantity: c.count })),
          source: "entity.rank_up",
          sourceId: instanceId,
        });
      } catch {
        throw new EntityInsufficientMaterials();
      }
    }

    // Update rank with OCC
    const rows = await db
      .update(entityInstances)
      .set({
        rankKey: costEntry.toRank,
        version: sql`${entityInstances.version} + 1`,
      })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, inst.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(tenantId, endUserId, instanceId, "rank_up", {
      rankBefore: inst.rankKey,
      rankAfter: costEntry.toRank,
    });

    return recomputeAndSave(tenantId, instanceId);
  }

  async function synthesize(
    tenantId: string,
    endUserId: string,
    targetInstanceId: string,
    feedInstanceIds: string[],
  ): Promise<EntityInstance> {
    const target = await loadInstanceById(tenantId, targetInstanceId);
    if (target.endUserId !== endUserId)
      throw new EntityInstanceNotFound(targetInstanceId);
    if (target.isLocked) throw new EntityLocked();

    const bp = await loadBlueprintByKey(tenantId, target.blueprintId);
    const schema = await loadSchemaByKey(tenantId, bp.schemaId);

    if (!schema.synthesisConfig.enabled)
      throw new EntityInvalidInput(
        "synthesis is not enabled for this schema",
      );

    if (!bp.synthesisCost)
      throw new EntityInvalidInput(
        "blueprint has no synthesis cost configured",
      );

    if (feedInstanceIds.length !== bp.synthesisCost.inputCount)
      throw new EntitySynthesisInvalid(
        `expected ${bp.synthesisCost.inputCount} feed entities, got ${feedInstanceIds.length}`,
      );

    // Validate feed instances
    const feeds: EntityInstance[] = [];
    for (const fid of feedInstanceIds) {
      if (fid === targetInstanceId)
        throw new EntitySynthesisInvalid("target cannot be a feed");
      const feed = await loadInstanceById(tenantId, fid);
      if (feed.endUserId !== endUserId)
        throw new EntityInstanceNotFound(fid);
      if (feed.isLocked) throw new EntityLocked();

      if (schema.synthesisConfig.sameBlueprint) {
        if (feed.blueprintId !== target.blueprintId)
          throw new EntitySynthesisInvalid(
            "all feed entities must be the same blueprint",
          );
      } else {
        if (feed.schemaId !== target.schemaId)
          throw new EntitySynthesisInvalid(
            "all feed entities must be the same schema",
          );
      }

      // Check not equipped
      const equipped = await db
        .select()
        .from(entitySlotAssignments)
        .where(eq(entitySlotAssignments.equippedInstanceId, fid))
        .limit(1);
      if (equipped.length > 0)
        throw new EntitySynthesisInvalid(
          `feed entity ${fid} is equipped in a slot`,
        );

      feeds.push(feed);
    }

    // Deduct material cost
    if (itemSvc && bp.synthesisCost.cost.length > 0) {
      try {
        await itemSvc.deductItems({
          tenantId,
          endUserId,
          deductions: bp.synthesisCost.cost
            .filter((c) => c.type === "item")
            .map((c) => ({ definitionId: c.id, quantity: c.count })),
          source: "entity.synthesize",
          sourceId: targetInstanceId,
        });
      } catch {
        throw new EntityInsufficientMaterials();
      }
    }

    // Delete feed instances
    for (const feed of feeds) {
      await db
        .delete(entityInstances)
        .where(eq(entityInstances.id, feed.id));
    }

    // Apply result bonuses to target's customData (or we could add to base)
    // For now, store synthesis count in customData
    const synthCount =
      ((target.customData as Record<string, number> | null)?.synthCount ?? 0) +
      1;

    const rows = await db
      .update(entityInstances)
      .set({
        customData: { ...(target.customData as object ?? {}), synthCount },
        version: sql`${entityInstances.version} + 1`,
      })
      .where(
        and(
          eq(entityInstances.id, targetInstanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, target.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(
      tenantId,
      endUserId,
      targetInstanceId,
      "synthesize",
      {
        feedIds: feedInstanceIds,
        resultBonuses: bp.synthesisCost.resultBonuses,
      },
    );

    return recomputeAndSave(tenantId, targetInstanceId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Slot System (Phase 4)
  // ═══════════════════════════════════════════════════════════════

  async function equip(
    tenantId: string,
    endUserId: string,
    ownerInstanceId: string,
    slotKey: string,
    slotIndex: number,
    equippedInstanceId: string,
  ): Promise<EntitySlotAssignment> {
    const owner = await loadInstanceById(tenantId, ownerInstanceId);
    if (owner.endUserId !== endUserId)
      throw new EntityInstanceNotFound(ownerInstanceId);

    const equipped = await loadInstanceById(tenantId, equippedInstanceId);
    if (equipped.endUserId !== endUserId)
      throw new EntityInstanceNotFound(equippedInstanceId);

    // Validate slot exists on owner's schema
    const schema = await loadSchemaByKey(tenantId, owner.schemaId);
    const slotDef = schema.slotDefinitions.find(
      (s) => s.key === slotKey,
    );
    if (!slotDef)
      throw new EntitySlotIncompatible(`slot "${slotKey}" not defined on schema`);
    if (slotIndex >= slotDef.maxCount)
      throw new EntitySlotIncompatible(
        `slot index ${slotIndex} exceeds maxCount ${slotDef.maxCount}`,
      );

    // Validate schema compatibility
    if (
      slotDef.acceptsSchemaIds.length > 0 &&
      !slotDef.acceptsSchemaIds.includes(equipped.schemaId)
    )
      throw new EntitySlotIncompatible(
        "equipped entity's schema is not accepted by this slot",
      );

    // Validate tag compatibility (if acceptsTags is configured)
    if (slotDef.acceptsTags) {
      const ownerBp = await loadBlueprintByKey(tenantId, owner.blueprintId);
      const equippedBp = await loadBlueprintByKey(
        tenantId,
        equipped.blueprintId,
      );

      for (const [tagKey, acceptedVal] of Object.entries(slotDef.acceptsTags)) {
        let acceptedValues: string[];
        if (typeof acceptedVal === "string" && acceptedVal.startsWith("$owner.")) {
          // Dynamic: resolve from owner's tags
          const ownerTagKey = acceptedVal.slice(7); // strip "$owner."
          const ownerTagVal = ownerBp.tags[ownerTagKey];
          acceptedValues = ownerTagVal ? [ownerTagVal, "all"] : ["all"];
        } else if (Array.isArray(acceptedVal)) {
          acceptedValues = acceptedVal;
        } else {
          acceptedValues = [acceptedVal as string];
        }

        const equippedTagVal = equippedBp.tags[tagKey];
        if (
          equippedTagVal &&
          !acceptedValues.includes(equippedTagVal)
        )
          throw new EntitySlotIncompatible(
            `tag "${tagKey}" value "${equippedTagVal}" not in accepted [${acceptedValues.join(", ")}]`,
          );
      }
    }

    // Check entity not already equipped elsewhere
    const existing = await db
      .select()
      .from(entitySlotAssignments)
      .where(eq(entitySlotAssignments.equippedInstanceId, equippedInstanceId))
      .limit(1);
    if (existing.length > 0) throw new EntityAlreadyEquipped();

    // Check slot not occupied
    const occupied = await db
      .select()
      .from(entitySlotAssignments)
      .where(
        and(
          eq(entitySlotAssignments.ownerInstanceId, ownerInstanceId),
          eq(entitySlotAssignments.slotKey, slotKey),
          eq(entitySlotAssignments.slotIndex, slotIndex),
        ),
      )
      .limit(1);
    if (occupied.length > 0) throw new EntitySlotOccupied();

    const rows = await db
      .insert(entitySlotAssignments)
      .values({
        ownerInstanceId,
        slotKey,
        slotIndex,
        equippedInstanceId,
        tenantId,
        endUserId,
      })
      .returning();

    await logAction(tenantId, endUserId, ownerInstanceId, "equip", {
      slotKey,
      slotIndex,
      equippedInstanceId,
    });

    // Recompute owner stats
    await recomputeAndSave(tenantId, ownerInstanceId);

    return rows[0]!;
  }

  async function unequip(
    tenantId: string,
    endUserId: string,
    ownerInstanceId: string,
    slotKey: string,
    slotIndex: number,
  ): Promise<void> {
    const owner = await loadInstanceById(tenantId, ownerInstanceId);
    if (owner.endUserId !== endUserId)
      throw new EntityInstanceNotFound(ownerInstanceId);

    const deleted = await db
      .delete(entitySlotAssignments)
      .where(
        and(
          eq(entitySlotAssignments.ownerInstanceId, ownerInstanceId),
          eq(entitySlotAssignments.slotKey, slotKey),
          eq(entitySlotAssignments.slotIndex, slotIndex),
        ),
      )
      .returning();

    if (deleted.length === 0)
      throw new EntityInvalidInput("slot is empty");

    await logAction(tenantId, endUserId, ownerInstanceId, "unequip", {
      slotKey,
      slotIndex,
      equippedInstanceId: deleted[0]!.equippedInstanceId,
    });

    // Recompute owner stats
    await recomputeAndSave(tenantId, ownerInstanceId);
  }

  async function changeSkin(
    tenantId: string,
    endUserId: string,
    instanceId: string,
    skinId: string | null,
  ): Promise<EntityInstance> {
    const inst = await loadInstanceById(tenantId, instanceId);
    if (inst.endUserId !== endUserId)
      throw new EntityInstanceNotFound(instanceId);

    if (skinId) {
      const skin = await loadSkinById(tenantId, skinId);
      // Validate skin belongs to this blueprint
      if (skin.blueprintId !== inst.blueprintId)
        throw new EntityInvalidInput(
          "skin does not belong to this blueprint",
        );
    }

    const rows = await db
      .update(entityInstances)
      .set({
        skinId,
        version: sql`${entityInstances.version} + 1`,
      })
      .where(
        and(
          eq(entityInstances.id, instanceId),
          eq(entityInstances.tenantId, tenantId),
          eq(entityInstances.version, inst.version),
        ),
      )
      .returning();
    if (rows.length === 0) throw new EntityConcurrencyConflict();

    await logAction(
      tenantId,
      endUserId,
      instanceId,
      "change_skin",
      { skinBefore: inst.skinId, skinAfter: skinId },
    );

    return recomputeAndSave(tenantId, instanceId);
  }

  // ═══════════════════════════════════════════════════════════════
  // Formations (Phase 5)
  // ═══════════════════════════════════════════════════════════════

  async function listFormations(
    tenantId: string,
    endUserId: string,
    configId: string,
  ): Promise<EntityFormation[]> {
    return db
      .select()
      .from(entityFormations)
      .where(
        and(
          eq(entityFormations.tenantId, tenantId),
          eq(entityFormations.endUserId, endUserId),
          eq(entityFormations.configId, configId),
        ),
      )
      .orderBy(asc(entityFormations.formationIndex));
  }

  async function updateFormation(
    tenantId: string,
    endUserId: string,
    configId: string,
    formationIndex: number,
    name: string | null,
    slots: FormationSlot[],
  ): Promise<EntityFormation> {
    const config = await loadFormationConfigByKey(tenantId, configId);

    if (formationIndex >= config.maxFormations)
      throw new EntityInvalidInput(
        `formation index ${formationIndex} exceeds max ${config.maxFormations}`,
      );

    // Validate slots
    const validSlots: FormationSlot[] = [];
    const seenBlueprints = new Set<string>();
    for (const slot of slots) {
      if (slot.slotIndex >= config.maxSlots)
        throw new EntityInvalidInput(
          `slot index ${slot.slotIndex} exceeds max ${config.maxSlots}`,
        );

      if (slot.instanceId) {
        const inst = await loadInstanceById(tenantId, slot.instanceId);
        if (inst.endUserId !== endUserId)
          throw new EntityInstanceNotFound(slot.instanceId);

        // Check schema is accepted
        if (
          config.acceptsSchemaIds.length > 0 &&
          !config.acceptsSchemaIds.includes(inst.schemaId)
        )
          throw new EntityInvalidInput(
            `instance schema not accepted by this formation config`,
          );

        // Check duplicates
        if (!config.allowDuplicateBlueprints) {
          if (seenBlueprints.has(inst.blueprintId))
            throw new EntityInvalidInput(
              "duplicate blueprints not allowed in this formation",
            );
          seenBlueprints.add(inst.blueprintId);
        }
      }
      validSlots.push(slot);
    }

    // Upsert: try update first, then insert if not found
    const updated = await db
      .update(entityFormations)
      .set({
        name,
        slots: validSlots,
        version: sql`${entityFormations.version} + 1`,
      })
      .where(
        and(
          eq(entityFormations.tenantId, tenantId),
          eq(entityFormations.endUserId, endUserId),
          eq(entityFormations.configId, configId),
          eq(entityFormations.formationIndex, formationIndex),
        ),
      )
      .returning();

    if (updated.length > 0) return updated[0]!;

    // Insert new formation
    const inserted = await db
      .insert(entityFormations)
      .values({
        tenantId,
        endUserId,
        configId,
        formationIndex,
        name,
        slots: validSlots,
      })
      .returning();

    return inserted[0]!;
  }

  // ═══════════════════════════════════════════════════════════════
  // Action Log Helper
  // ═══════════════════════════════════════════════════════════════

  async function logAction(
    tenantId: string,
    endUserId: string,
    instanceId: string,
    action: EntityAction,
    details: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(entityActionLogs).values({
      tenantId,
      endUserId,
      instanceId,
      action,
      details,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════

  return {
    // Schema
    createSchema,
    updateSchema,
    moveSchema,
    deleteSchema,
    listSchemas,
    getSchema,

    // Blueprint
    createBlueprint,
    updateBlueprint,
    moveBlueprint,
    deleteBlueprint,
    listBlueprints,
    getBlueprint,

    // Skin
    createSkin,
    updateSkin,
    moveSkin,
    deleteSkin,
    listSkins,
    getSkin,

    // Formation Config
    createFormationConfig,
    updateFormationConfig,
    deleteFormationConfig,
    listFormationConfigs,
    getFormationConfig,

    // Instance (Phase 2)
    acquireEntity,
    listInstances,
    getInstance,
    discardEntity,
    toggleLock,

    // Progression (Phase 3)
    addExp,
    levelUp,
    rankUp,
    synthesize,

    // Slot System (Phase 4)
    equip,
    unequip,
    changeSkin,

    // Formations (Phase 5)
    listFormations,
    updateFormation,

    // Stat computation (exposed for testing/admin tools)
    computeStats,
  };
}

export type EntityService = ReturnType<typeof createEntityService>;
