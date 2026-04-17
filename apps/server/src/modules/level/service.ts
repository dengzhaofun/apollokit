/**
 * Level service — protocol-agnostic business logic for the "关卡"
 * (level / stage progression) module.
 *
 * This file MUST NOT import Hono or any HTTP concepts. Its only view of
 * the outside world is a typed `AppDeps` object. The service factory
 * declares what it needs with `Pick<AppDeps, ...>`.
 *
 * ---------------------------------------------------------------------
 * Three-tier hierarchy
 * ---------------------------------------------------------------------
 *
 * LevelConfig  (a level pack, e.g. "Main Story", "Daily Challenge")
 *   └─ LevelStage  (optional grouping, e.g. "Chapter 1")
 *         └─ Level  (individual level the player plays)
 *
 * Stages are optional: when `config.hasStages === false`, levels sit
 * directly under the config with `stageId = null`. The service layer
 * exposes the same overview API shape regardless — the client sees an
 * empty `stages` array if no stages exist.
 *
 * ---------------------------------------------------------------------
 * Unlock rules — recursive JSONB-based predicate system
 * ---------------------------------------------------------------------
 *
 * Each level (and optionally each stage) carries an `unlockRule` JSONB
 * column. The rule is a recursive discriminated union (see `types.ts`):
 *
 *   - `auto`           → always unlocked
 *   - `level_clear`    → requires a specific level to be cleared
 *   - `level_stars`    → requires N stars on a specific level
 *   - `stage_clear`    → requires all levels in a stage to be cleared
 *   - `star_threshold` → requires a total-star count across the config
 *   - `all` / `any`    → boolean combinators over child rules
 *
 * `evaluateUnlockRule` is a pure function with no I/O — all needed
 * state is pre-fetched into a `progressMap` before evaluation.
 *
 * ---------------------------------------------------------------------
 * Reward delivery
 * ---------------------------------------------------------------------
 *
 * Two reward tracks per level:
 *   1. **clearRewards** — `RewardEntry[]`, granted once on first clear.
 *      Guarded by the `rewardsClaimed` boolean on user progress.
 *   2. **starRewards** — `StarRewardTier[]`, each tier has a star
 *      threshold. Claiming a tier also grants all lower unclaimed
 *      tiers. Guarded by `starRewardsClaimed` (int — highest tier
 *      claimed).
 *
 * Both use the unified `grantRewards()` dispatcher from `../../lib/rewards`.
 *
 * ---------------------------------------------------------------------
 * neon-http: no transactions
 * ---------------------------------------------------------------------
 *
 * Every write path is a single atomic SQL statement. The `reportClear`
 * path uses:
 *
 *   INSERT INTO level_user_progress (...) VALUES (...)
 *   ON CONFLICT (level_id, end_user_id) DO UPDATE SET
 *     status = 'cleared',
 *     stars = GREATEST(existing.stars, new.stars),
 *     attempts = existing.attempts + 1,
 *     best_score = GREATEST(existing.best_score, new.best_score),
 *     cleared_at = COALESCE(existing.cleared_at, new.cleared_at),
 *     updated_at = NOW()
 *   RETURNING *, (xmax = 0) AS inserted
 *
 * The `claimRewards` paths use conditional UPDATE ... WHERE to gate
 * concurrency — only the winner sees a RETURNING row.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  levelConfigs,
  levelStages,
  levels,
  levelUserProgress,
} from "../../schema/level";
import type { RewardEntry } from "../../lib/rewards";
import { grantRewards, type RewardServices } from "../../lib/rewards";
import {
  LevelConfigNotFound,
  LevelStageNotFound,
  LevelNotFound,
  LevelAliasConflict,
  LevelLocked,
  LevelRewardsAlreadyClaimed,
  LevelNotCleared,
  LevelInvalidInput,
} from "./errors";
import type {
  UnlockRule,
  StarRewardTier,
  Level,
  LevelConfig,
  LevelStage,
  LevelUserProgress,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────

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

// ─── Pure unlock evaluator ────────────────────────────────────────

/**
 * Evaluate an unlock rule against pre-fetched user progress.
 *
 * This is a pure function — all data it needs is passed in as arguments.
 * Call sites must build the maps before invoking.
 *
 * @param rule          The unlock rule (null/undefined = auto-unlock)
 * @param progressMap   levelId → { status, stars }
 * @param stageLevelsMap stageId → levelId[] (needed for stage_clear)
 * @param totalStars    Sum of all stars across the config
 */
function evaluateUnlockRule(
  rule: UnlockRule | null | undefined,
  progressMap: Map<string, { status: string; stars: number }>,
  stageLevelsMap?: Map<string, string[]>,
  totalStars?: number,
): boolean {
  if (!rule) return true; // null/undefined = auto-unlock
  switch (rule.type) {
    case "auto":
      return true;
    case "level_clear": {
      const p = progressMap.get(rule.levelId);
      return p?.status === "cleared";
    }
    case "level_stars": {
      const p = progressMap.get(rule.levelId);
      return (p?.stars ?? 0) >= rule.stars;
    }
    case "stage_clear": {
      const levelIds = stageLevelsMap?.get(rule.stageId) ?? [];
      return (
        levelIds.length > 0 &&
        levelIds.every((id) => progressMap.get(id)?.status === "cleared")
      );
    }
    case "star_threshold":
      return (totalStars ?? 0) >= rule.threshold;
    case "all":
      return rule.rules.every((r) =>
        evaluateUnlockRule(r, progressMap, stageLevelsMap, totalStars),
      );
    case "any":
      return rule.rules.some((r) =>
        evaluateUnlockRule(r, progressMap, stageLevelsMap, totalStars),
      );
    default:
      return false;
  }
}

// ─── Factory ──────────────────────────────────────────────────────

// `events` is optional so existing tests that pass `{ db }` alone
// keep compiling. Production wiring (`modules/level/index.ts`) always
// supplies the bus from `deps`.
type LevelDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Event-bus augmentation — leaderboard / activity / analytics subscribe
// to these without any cross-module import cycles.
declare module "../../lib/event-bus" {
  interface EventMap {
    "level.cleared": {
      organizationId: string;
      endUserId: string;
      configId: string;
      levelId: string;
      stars: number;
      bestScore: number | null;
      firstClear: boolean;
    };
  }
}

export function createLevelService(
  d: LevelDeps,
  rewardServices: RewardServices,
) {
  const { db, events } = d;

  // ─── Load helpers ─────────────────────────────────────────────

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<LevelConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(levelConfigs.organizationId, organizationId),
          eq(levelConfigs.id, key),
        )
      : and(
          eq(levelConfigs.organizationId, organizationId),
          eq(levelConfigs.alias, key),
        );
    const rows = await db.select().from(levelConfigs).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new LevelConfigNotFound(key);
    return row;
  }

  async function loadConfigById(
    organizationId: string,
    id: string,
  ): Promise<LevelConfig> {
    const rows = await db
      .select()
      .from(levelConfigs)
      .where(
        and(
          eq(levelConfigs.organizationId, organizationId),
          eq(levelConfigs.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new LevelConfigNotFound(id);
    return row;
  }

  async function loadStageById(
    organizationId: string,
    id: string,
  ): Promise<LevelStage> {
    const rows = await db
      .select()
      .from(levelStages)
      .where(
        and(
          eq(levelStages.organizationId, organizationId),
          eq(levelStages.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new LevelStageNotFound(id);
    return row;
  }

  async function loadLevelById(
    organizationId: string,
    id: string,
  ): Promise<Level> {
    const rows = await db
      .select()
      .from(levels)
      .where(
        and(
          eq(levels.organizationId, organizationId),
          eq(levels.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new LevelNotFound(id);
    return row;
  }

  // ─── Config CRUD ──────────────────────────────────────────────

  async function createConfig(
    organizationId: string,
    input: {
      name: string;
      alias?: string | null;
      description?: string | null;
      coverImage?: string | null;
      icon?: string | null;
      hasStages?: boolean;
      sortOrder?: number;
      isActive?: boolean;
      metadata?: unknown;
    },
  ): Promise<LevelConfig> {
    try {
      const [row] = await db
        .insert(levelConfigs)
        .values({
          organizationId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          coverImage: input.coverImage ?? null,
          icon: input.icon ?? null,
          hasStages: input.hasStages ?? false,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new LevelAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function updateConfig(
    organizationId: string,
    id: string,
    patch: {
      name?: string;
      alias?: string | null;
      description?: string | null;
      coverImage?: string | null;
      icon?: string | null;
      hasStages?: boolean;
      sortOrder?: number;
      isActive?: boolean;
      metadata?: unknown;
    },
  ): Promise<LevelConfig> {
    const values: Partial<typeof levelConfigs.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.coverImage !== undefined) values.coverImage = patch.coverImage;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.hasStages !== undefined) values.hasStages = patch.hasStages;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) {
      return loadConfigById(organizationId, id);
    }

    try {
      const [row] = await db
        .update(levelConfigs)
        .set(values)
        .where(
          and(
            eq(levelConfigs.id, id),
            eq(levelConfigs.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new LevelConfigNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new LevelAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function deleteConfig(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(levelConfigs)
      .where(
        and(
          eq(levelConfigs.id, id),
          eq(levelConfigs.organizationId, organizationId),
        ),
      )
      .returning({ id: levelConfigs.id });
    if (deleted.length === 0) throw new LevelConfigNotFound(id);
  }

  async function listConfigs(
    organizationId: string,
  ): Promise<LevelConfig[]> {
    return db
      .select()
      .from(levelConfigs)
      .where(eq(levelConfigs.organizationId, organizationId))
      .orderBy(asc(levelConfigs.sortOrder), desc(levelConfigs.createdAt));
  }

  async function getConfig(
    organizationId: string,
    key: string,
  ): Promise<LevelConfig> {
    return loadConfigByKey(organizationId, key);
  }

  async function getConfigById(
    organizationId: string,
    id: string,
  ): Promise<LevelConfig> {
    return loadConfigById(organizationId, id);
  }

  // ─── Stage CRUD ───────────────────────────────────────────────

  async function createStage(
    organizationId: string,
    configId: string,
    input: {
      name: string;
      description?: string | null;
      icon?: string | null;
      unlockRule?: unknown;
      sortOrder?: number;
      metadata?: unknown;
    },
  ): Promise<LevelStage> {
    // Verify config exists and belongs to this org
    await loadConfigById(organizationId, configId);

    const [row] = await db
      .insert(levelStages)
      .values({
        configId,
        organizationId,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        unlockRule: input.unlockRule ?? null,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  async function updateStage(
    organizationId: string,
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      unlockRule?: unknown;
      sortOrder?: number;
      metadata?: unknown;
    },
  ): Promise<LevelStage> {
    const values: Partial<typeof levelStages.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.unlockRule !== undefined) values.unlockRule = patch.unlockRule;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) {
      return loadStageById(organizationId, id);
    }

    const [row] = await db
      .update(levelStages)
      .set(values)
      .where(
        and(
          eq(levelStages.id, id),
          eq(levelStages.organizationId, organizationId),
        ),
      )
      .returning();
    if (!row) throw new LevelStageNotFound(id);
    return row;
  }

  async function deleteStage(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(levelStages)
      .where(
        and(
          eq(levelStages.id, id),
          eq(levelStages.organizationId, organizationId),
        ),
      )
      .returning({ id: levelStages.id });
    if (deleted.length === 0) throw new LevelStageNotFound(id);
  }

  async function listStages(
    organizationId: string,
    configId: string,
  ): Promise<LevelStage[]> {
    return db
      .select()
      .from(levelStages)
      .where(
        and(
          eq(levelStages.configId, configId),
          eq(levelStages.organizationId, organizationId),
        ),
      )
      .orderBy(asc(levelStages.sortOrder), desc(levelStages.createdAt));
  }

  // ─── Level CRUD ───────────────────────────────────────────────

  async function createLevel(
    organizationId: string,
    configId: string,
    input: {
      name: string;
      stageId?: string | null;
      alias?: string | null;
      description?: string | null;
      icon?: string | null;
      difficulty?: string | null;
      maxStars?: number;
      unlockRule?: unknown;
      clearRewards?: RewardEntry[] | null;
      starRewards?: StarRewardTier[] | null;
      sortOrder?: number;
      isActive?: boolean;
      metadata?: unknown;
    },
  ): Promise<Level> {
    // Verify config exists and belongs to this org
    await loadConfigById(organizationId, configId);

    try {
      const [row] = await db
        .insert(levels)
        .values({
          configId,
          stageId: input.stageId ?? null,
          organizationId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          icon: input.icon ?? null,
          difficulty: input.difficulty ?? null,
          maxStars: input.maxStars ?? 3,
          unlockRule: input.unlockRule ?? null,
          clearRewards: input.clearRewards ?? null,
          starRewards: input.starRewards ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new LevelAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function updateLevel(
    organizationId: string,
    id: string,
    patch: {
      name?: string;
      stageId?: string | null;
      alias?: string | null;
      description?: string | null;
      icon?: string | null;
      difficulty?: string | null;
      maxStars?: number;
      unlockRule?: unknown;
      clearRewards?: RewardEntry[] | null;
      starRewards?: StarRewardTier[] | null;
      sortOrder?: number;
      isActive?: boolean;
      metadata?: unknown;
    },
  ): Promise<Level> {
    const values: Partial<typeof levels.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.stageId !== undefined) values.stageId = patch.stageId;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.difficulty !== undefined) values.difficulty = patch.difficulty;
    if (patch.maxStars !== undefined) values.maxStars = patch.maxStars;
    if (patch.unlockRule !== undefined) values.unlockRule = patch.unlockRule;
    if (patch.clearRewards !== undefined)
      values.clearRewards = patch.clearRewards;
    if (patch.starRewards !== undefined) values.starRewards = patch.starRewards;
    if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) {
      return loadLevelById(organizationId, id);
    }

    try {
      const [row] = await db
        .update(levels)
        .set(values)
        .where(
          and(
            eq(levels.id, id),
            eq(levels.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new LevelNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new LevelAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function deleteLevel(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(levels)
      .where(
        and(
          eq(levels.id, id),
          eq(levels.organizationId, organizationId),
        ),
      )
      .returning({ id: levels.id });
    if (deleted.length === 0) throw new LevelNotFound(id);
  }

  async function listLevels(
    organizationId: string,
    configId: string,
    stageId?: string,
  ): Promise<Level[]> {
    const conditions = [
      eq(levels.configId, configId),
      eq(levels.organizationId, organizationId),
    ];
    if (stageId !== undefined) {
      conditions.push(eq(levels.stageId, stageId));
    }
    return db
      .select()
      .from(levels)
      .where(and(...conditions))
      .orderBy(asc(levels.sortOrder), desc(levels.createdAt));
  }

  // ─── Progress helpers ─────────────────────────────────────────

  /**
   * Build the three data structures needed by `evaluateUnlockRule`
   * for all levels in a config.
   */
  async function buildProgressContext(
    organizationId: string,
    endUserId: string,
    configId: string,
  ) {
    const [allLevels, allProgress] = await Promise.all([
      db
        .select()
        .from(levels)
        .where(
          and(
            eq(levels.configId, configId),
            eq(levels.organizationId, organizationId),
          ),
        ),
      db
        .select()
        .from(levelUserProgress)
        .where(
          and(
            eq(levelUserProgress.configId, configId),
            eq(levelUserProgress.endUserId, endUserId),
            eq(levelUserProgress.organizationId, organizationId),
          ),
        ),
    ]);

    // progressMap: levelId → { status, stars }
    const progressMap = new Map<string, { status: string; stars: number }>();
    for (const p of allProgress) {
      progressMap.set(p.levelId, { status: p.status, stars: p.stars });
    }

    // stageLevelsMap: stageId → levelId[]
    const stageLevelsMap = new Map<string, string[]>();
    for (const l of allLevels) {
      if (l.stageId) {
        const arr = stageLevelsMap.get(l.stageId) ?? [];
        arr.push(l.id);
        stageLevelsMap.set(l.stageId, arr);
      }
    }

    // totalStars
    let totalStars = 0;
    for (const p of allProgress) {
      totalStars += p.stars;
    }

    // progressByLevelId for quick lookup
    const progressByLevelId = new Map<string, LevelUserProgress>();
    for (const p of allProgress) {
      progressByLevelId.set(p.levelId, p);
    }

    return {
      allLevels,
      allProgress,
      progressMap,
      stageLevelsMap,
      totalStars,
      progressByLevelId,
    };
  }

  // ─── Client: getConfigOverview ────────────────────────────────

  async function getConfigOverview(
    organizationId: string,
    endUserId: string,
    configKey: string,
  ) {
    const config = await loadConfigByKey(organizationId, configKey);

    const [allStages, ctx] = await Promise.all([
      config.hasStages
        ? db
            .select()
            .from(levelStages)
            .where(
              and(
                eq(levelStages.configId, config.id),
                eq(levelStages.organizationId, organizationId),
              ),
            )
            .orderBy(asc(levelStages.sortOrder), desc(levelStages.createdAt))
        : Promise.resolve([] as LevelStage[]),
      buildProgressContext(organizationId, endUserId, config.id),
    ]);

    const {
      allLevels,
      progressMap,
      stageLevelsMap,
      totalStars,
      progressByLevelId,
    } = ctx;

    // Build level views with unlock status
    const levelViews = allLevels
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((l) => {
        const unlocked = evaluateUnlockRule(
          l.unlockRule as UnlockRule | null,
          progressMap,
          stageLevelsMap,
          totalStars,
        );
        const progress = progressByLevelId.get(l.id);
        return {
          id: l.id,
          configId: l.configId,
          stageId: l.stageId,
          alias: l.alias,
          name: l.name,
          description: l.description,
          icon: l.icon,
          difficulty: l.difficulty,
          maxStars: l.maxStars,
          sortOrder: l.sortOrder,
          isActive: l.isActive,
          unlocked,
          status: progress?.status ?? null,
          stars: progress?.stars ?? 0,
          attempts: progress?.attempts ?? 0,
          bestScore: progress?.bestScore ?? null,
          rewardsClaimed: progress?.rewardsClaimed ?? false,
          starRewardsClaimed: progress?.starRewardsClaimed ?? 0,
          clearedAt: progress?.clearedAt?.toISOString() ?? null,
        };
      });

    // Build stage views with unlock status
    const stageViews = allStages.map((s) => {
      const unlocked = evaluateUnlockRule(
        s.unlockRule as UnlockRule | null,
        progressMap,
        stageLevelsMap,
        totalStars,
      );
      const stageLevelIds = stageLevelsMap.get(s.id) ?? [];
      const clearedCount = stageLevelIds.filter(
        (id) => progressMap.get(id)?.status === "cleared",
      ).length;
      return {
        id: s.id,
        configId: s.configId,
        name: s.name,
        description: s.description,
        icon: s.icon,
        sortOrder: s.sortOrder,
        unlocked,
        levelCount: stageLevelIds.length,
        clearedCount,
      };
    });

    // Totals
    const totalLevels = allLevels.length;
    const clearedLevels = [...progressMap.values()].filter(
      (p) => p.status === "cleared",
    ).length;

    return {
      config,
      stages: stageViews,
      levels: levelViews,
      totals: {
        totalLevels,
        clearedLevels,
        totalStars,
      },
    };
  }

  // ─── Client: getLevelDetail ───────────────────────────────────

  async function getLevelDetail(
    organizationId: string,
    endUserId: string,
    levelId: string,
  ) {
    const level = await loadLevelById(organizationId, levelId);

    // Fetch user progress (if any)
    const [progress] = await db
      .select()
      .from(levelUserProgress)
      .where(
        and(
          eq(levelUserProgress.levelId, levelId),
          eq(levelUserProgress.endUserId, endUserId),
          eq(levelUserProgress.organizationId, organizationId),
        ),
      )
      .limit(1);

    // Build progress context to evaluate unlock
    const ctx = await buildProgressContext(
      organizationId,
      endUserId,
      level.configId,
    );

    const unlocked = evaluateUnlockRule(
      level.unlockRule as UnlockRule | null,
      ctx.progressMap,
      ctx.stageLevelsMap,
      ctx.totalStars,
    );

    // Parse star rewards for the response
    const starRewards = (level.starRewards as StarRewardTier[] | null) ?? [];

    return {
      level,
      unlocked,
      progress: progress ?? null,
      starRewards,
    };
  }

  // ─── Client: reportClear ──────────────────────────────────────

  async function reportClear(
    organizationId: string,
    endUserId: string,
    levelId: string,
    input: { stars: number; score?: number | null },
  ) {
    const level = await loadLevelById(organizationId, levelId);

    // Validate stars
    if (input.stars < 0 || input.stars > level.maxStars) {
      throw new LevelInvalidInput(
        `stars must be between 0 and ${level.maxStars}`,
      );
    }

    // Verify level is unlocked
    const ctx = await buildProgressContext(
      organizationId,
      endUserId,
      level.configId,
    );

    const unlocked = evaluateUnlockRule(
      level.unlockRule as UnlockRule | null,
      ctx.progressMap,
      ctx.stageLevelsMap,
      ctx.totalStars,
    );
    if (!unlocked) {
      throw new LevelLocked(levelId);
    }

    // Atomic upsert
    const now = new Date();
    const rows = await db.execute<
      LevelUserProgress & { inserted: boolean }
    >(sql`
      INSERT INTO level_user_progress (
        level_id, end_user_id, organization_id, config_id,
        status, stars, attempts, best_score, cleared_at, created_at, updated_at
      ) VALUES (
        ${levelId}, ${endUserId}, ${organizationId}, ${level.configId},
        'cleared', ${input.stars}, 1,
        ${input.score ?? null},
        ${now}, ${now}, ${now}
      )
      ON CONFLICT (level_id, end_user_id) DO UPDATE SET
        status = 'cleared',
        stars = GREATEST(level_user_progress.stars, EXCLUDED.stars),
        attempts = level_user_progress.attempts + 1,
        best_score = GREATEST(level_user_progress.best_score, EXCLUDED.best_score),
        cleared_at = COALESCE(level_user_progress.cleared_at, EXCLUDED.cleared_at),
        updated_at = NOW()
      RETURNING *, (xmax = 0) AS inserted
    `);

    const result = rows.rows[0];
    if (!result) throw new Error("upsert returned no row");

    const firstClear = result.inserted;
    const newStars = Math.max(
      ctx.progressMap.get(levelId)?.stars ?? 0,
      input.stars,
    );

    // Compute newly unlocked levels — check all levels in this config
    // whose unlock_rule references this level
    const newlyUnlocked: string[] = [];

    // Build updated progress map reflecting the clear we just wrote
    const updatedProgressMap = new Map(ctx.progressMap);
    updatedProgressMap.set(levelId, { status: "cleared", stars: newStars });
    const updatedTotalStars =
      ctx.totalStars -
      (ctx.progressMap.get(levelId)?.stars ?? 0) +
      newStars;

    for (const l of ctx.allLevels) {
      if (l.id === levelId) continue;
      // Skip if already unlockable before this clear
      const wasPreviouslyUnlocked = evaluateUnlockRule(
        l.unlockRule as UnlockRule | null,
        ctx.progressMap,
        ctx.stageLevelsMap,
        ctx.totalStars,
      );
      if (wasPreviouslyUnlocked) continue;

      const nowUnlocked = evaluateUnlockRule(
        l.unlockRule as UnlockRule | null,
        updatedProgressMap,
        ctx.stageLevelsMap,
        updatedTotalStars,
      );
      if (nowUnlocked) {
        newlyUnlocked.push(l.id);
      }
    }

    // Domain event — leaderboard can subscribe to build a
    // `metricKey="level.cleared"` / `metricKey="level.stars"` board
    // without touching this service.
    if (events) {
      await events.emit("level.cleared", {
        organizationId,
        endUserId,
        configId: level.configId,
        levelId,
        stars: newStars,
        bestScore: result.bestScore ?? input.score ?? null,
        firstClear,
      });
    }

    return {
      levelId,
      stars: newStars,
      bestScore: result.bestScore ?? input.score ?? null,
      firstClear,
      newlyUnlocked,
    };
  }

  // ─── Client: claimRewards ─────────────────────────────────────

  async function claimRewards(
    organizationId: string,
    endUserId: string,
    levelId: string,
    input: { type: "clear" } | { type: "star"; starTier: number },
  ) {
    const level = await loadLevelById(organizationId, levelId);

    // Fetch user progress
    const [progress] = await db
      .select()
      .from(levelUserProgress)
      .where(
        and(
          eq(levelUserProgress.levelId, levelId),
          eq(levelUserProgress.endUserId, endUserId),
          eq(levelUserProgress.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!progress || progress.status !== "cleared") {
      throw new LevelNotCleared();
    }

    if (input.type === "clear") {
      // Atomic conditional update — only succeeds if not already claimed
      const updated = await db
        .update(levelUserProgress)
        .set({
          rewardsClaimed: true,
        })
        .where(
          and(
            eq(levelUserProgress.levelId, levelId),
            eq(levelUserProgress.endUserId, endUserId),
            eq(levelUserProgress.rewardsClaimed, false),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new LevelRewardsAlreadyClaimed();
      }

      // Grant clear rewards
      const clearRewards = (level.clearRewards as RewardEntry[]) ?? [];
      if (clearRewards.length > 0) {
        await grantRewards(
          rewardServices,
          organizationId,
          endUserId,
          clearRewards,
          "level.clear",
          `${levelId}:${endUserId}`,
        );
      }

      return {
        levelId,
        type: "clear" as const,
        grantedRewards: clearRewards,
        claimedAt: new Date().toISOString(),
      };
    }

    // type === "star"
    const starTier = input.starTier;

    // Validate the star tier
    if (starTier <= 0 || starTier > level.maxStars) {
      throw new LevelInvalidInput(
        `starTier must be between 1 and ${level.maxStars}`,
      );
    }

    // Check the player has enough stars
    if (progress.stars < starTier) {
      throw new LevelInvalidInput(
        `player has ${progress.stars} stars but tier requires ${starTier}`,
      );
    }

    // Atomic conditional update — only succeeds if starRewardsClaimed < starTier
    const updated = await db.execute<LevelUserProgress>(sql`
      UPDATE level_user_progress
      SET star_rewards_claimed = ${starTier}, updated_at = NOW()
      WHERE level_id = ${levelId}
        AND end_user_id = ${endUserId}
        AND star_rewards_claimed < ${starTier}
      RETURNING *
    `);

    if (updated.rows.length === 0) {
      throw new LevelRewardsAlreadyClaimed();
    }

    // Determine which star reward tiers to grant
    // Grant all tiers from (previouslyClaimed + 1) to starTier
    const previouslyClaimed = progress.starRewardsClaimed;
    const starRewards = (level.starRewards as StarRewardTier[] | null) ?? [];

    const grantedRewards: RewardEntry[] = [];
    for (const tier of starRewards) {
      if (tier.stars > previouslyClaimed && tier.stars <= starTier) {
        grantedRewards.push(...tier.rewards);
      }
    }

    if (grantedRewards.length > 0) {
      await grantRewards(
        rewardServices,
        organizationId,
        endUserId,
        grantedRewards,
        "level.star",
        `${levelId}:star${starTier}:${endUserId}`,
      );
    }

    return {
      levelId,
      type: "star" as const,
      grantedRewards,
      claimedAt: new Date().toISOString(),
    };
  }

  // ─── Public API ───────────────────────────────────────────────

  return {
    // Config CRUD
    createConfig,
    updateConfig,
    deleteConfig,
    listConfigs,
    getConfig,
    getConfigById,
    // Stage CRUD
    createStage,
    updateStage,
    deleteStage,
    listStages,
    // Level CRUD
    createLevel,
    updateLevel,
    deleteLevel,
    listLevels,
    // Client methods
    getConfigOverview,
    getLevelDetail,
    reportClear,
    claimRewards,
    // Pure helpers (useful for tests)
    evaluateUnlockRule,
    // Internal loaders (useful for tests / routes)
    loadConfigByKey,
    loadConfigById,
    loadLevelById,
  };
}

export type LevelService = ReturnType<typeof createLevelService>;
