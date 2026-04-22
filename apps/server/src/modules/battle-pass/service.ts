/**
 * Battle Pass / 纪行 —— protocol-agnostic business logic。
 *
 * 本文件禁止 import Hono / HTTP / `../../db` / `../../deps` 常量 ——
 * 只 import `AppDeps` 类型。依赖通过 `Pick<AppDeps, ...>` 工厂参数
 * 注入（见 apps/server/CLAUDE.md）。
 *
 * -----------------------------------------------------------------
 * neon-http 无事务 → 单条原子 SQL 策略
 * -----------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` 不支持 `db.transaction()`，所有写路径必
 * 须表达为单条 SQL 或幂等分步（见 check-in service 的注释）。本
 * 模块的高风险路径：
 *
 *   grantXpForTask：单 season 两步
 *     A. UPSERT user_progress 加经验，RETURNING 新 current_xp
 *     B. 按 RETURNING 算新 level，条件 UPDATE current_level
 *     A/B 之间并发风险：两笔加经验同时发生 → A 用 += 不丢；B 条件
 *     "current_level < new_level" 并发下只会上升，不会降级。
 *
 *   grantTier：CTE 复合语句
 *     INSERT tier_grants ON CONFLICT DO NOTHING → 同语句 UPDATE
 *     user_progress.owned_tiers（通过 array_append）。这是一条
 *     `WITH inserted AS (...) UPDATE ...` CTE，Postgres 保证原子。
 *
 *   claim：两步幂等
 *     A. INSERT battle_pass_claims ON CONFLICT DO NOTHING RETURNING *
 *     B. 仅当 A 有 RETURNING 时 grantRewards()
 *     失败恢复：如果 B 崩了 A 已写入，重调会被 UNIQUE 拦下返回
 *     idempotent，漏发奖 —— 上层应用错误时人工补偿或邮件兜底。
 *     这是平台的已知权衡（非事务环境下幂等优先于"精确一次"）。
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { grantRewards, type RewardServices } from "../../lib/rewards";
import { activityConfigs } from "../../schema/activity";
import {
  battlePassClaims,
  battlePassConfigs,
  battlePassSeasonTasks,
  battlePassTierGrants,
  battlePassUserProgress,
  type BattlePassBonusMilestoneDef,
  type BattlePassConfig,
  type BattlePassLevelRewardDef,
  type BattlePassTierDef,
} from "../../schema/battle-pass";
import {
  BattlePassActivityConflict,
  BattlePassActivityNotFound,
  BattlePassCodeConflict,
  BattlePassConfigNotFound,
  BattlePassInvalidInput,
  BattlePassLevelNotReached,
  BattlePassNoRewardAtLevel,
  BattlePassRewardWindowClosed,
  BattlePassTierNotOwned,
  BattlePassUnknownTier,
} from "./errors";
import {
  computeLevelFromXp,
  cumulativeXpAtLevel,
  xpToNextLevel,
} from "./level-curve";
import type {
  BattlePassAggregateView,
  BattlePassClaimOutcome,
  BattlePassClaimableEntry,
  BattlePassGrantTierOutcome,
  BattlePassTaskCategory,
  BattlePassTierGrantSource,
  BattlePassXpGrantOutcome,
} from "./types";
import type {
  BindTasksInput,
  CreateConfigInput,
  UpdateConfigInput,
} from "./validators";

type BattlePassDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// ─── Event bus augmentation ─────────────────────────────────────

declare module "../../lib/event-bus" {
  interface EventMap {
    "battlepass.xp.earned": {
      organizationId: string;
      endUserId: string;
      seasonId: string;
      taskDefinitionId: string | null;
      xp: number;
      oldLevel: number;
      newLevel: number;
      currentXp: number;
    };
    "battlepass.level.up": {
      organizationId: string;
      endUserId: string;
      seasonId: string;
      oldLevel: number;
      newLevel: number;
    };
    "battlepass.tier.granted": {
      organizationId: string;
      endUserId: string;
      seasonId: string;
      tierCode: string;
      source: BattlePassTierGrantSource;
      externalOrderId: string | null;
    };
    "battlepass.level.claimed": {
      organizationId: string;
      endUserId: string;
      seasonId: string;
      level: number;
      tierCode: string;
    };
  }
}

export function createBattlePassService(
  d: BattlePassDeps,
  rewardServicesGetter: () => RewardServices,
) {
  const { db } = d;
  const events = d.events;

  // ─── Internal helpers ─────────────────────────────────────────

  async function loadConfigById(
    organizationId: string,
    id: string,
  ): Promise<BattlePassConfig> {
    const [row] = await db
      .select()
      .from(battlePassConfigs)
      .where(
        and(
          eq(battlePassConfigs.organizationId, organizationId),
          eq(battlePassConfigs.id, id),
        ),
      )
      .limit(1);
    if (!row) throw new BattlePassConfigNotFound(id);
    return row;
  }

  function assertTierExists(config: BattlePassConfig, tierCode: string) {
    const tiers = config.tiers as BattlePassTierDef[];
    if (!tiers.some((t) => t.code === tierCode)) {
      throw new BattlePassUnknownTier(tierCode);
    }
  }

  function findLevelRewardEntries(
    config: BattlePassConfig,
    level: number,
    tierCode: string,
  ): import("../../lib/rewards").RewardEntry[] {
    const levelRewards = config.levelRewards as BattlePassLevelRewardDef[];
    const entry = levelRewards.find((lr) => lr.level === level);
    const rewards = entry?.rewards?.[tierCode];
    if (!rewards || rewards.length === 0) {
      throw new BattlePassNoRewardAtLevel(level, tierCode);
    }
    return rewards;
  }

  /**
   * 根据 activity_configs 判断某季目前能否继续领奖。规则：
   *   - 必须存在
   *   - 状态 ∈ {active, settling, ended}（active 阶段可做任务，ended 阶段仍在奖励窗口内）
   *   - now ≤ rewardEndAt（若 rewardEndAt 为 null，默认使用 endAt）
   */
  async function assertRewardWindowOpen(
    organizationId: string,
    activityId: string,
    seasonId: string,
    now: Date,
  ) {
    const [act] = await db
      .select()
      .from(activityConfigs)
      .where(
        and(
          eq(activityConfigs.organizationId, organizationId),
          eq(activityConfigs.id, activityId),
        ),
      )
      .limit(1);
    if (!act) throw new BattlePassRewardWindowClosed(seasonId);
    const rewardEndAt = act.rewardEndAt ?? act.endAt;
    if (rewardEndAt && now.getTime() > rewardEndAt.getTime()) {
      throw new BattlePassRewardWindowClosed(seasonId);
    }
    if (act.status === "archived") {
      throw new BattlePassRewardWindowClosed(seasonId);
    }
  }

  /** 确保 user_progress 行存在（幂等的 INSERT ON CONFLICT DO NOTHING）。 */
  async function ensureUserProgressRow(params: {
    organizationId: string;
    seasonId: string;
    endUserId: string;
    now: Date;
  }): Promise<void> {
    await db
      .insert(battlePassUserProgress)
      .values({
        seasonId: params.seasonId,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        currentXp: 0,
        currentLevel: 0,
        ownedTiers: ["free"],
        lastXpAt: null,
        createdAt: params.now,
        updatedAt: params.now,
      })
      .onConflictDoNothing({
        target: [
          battlePassUserProgress.seasonId,
          battlePassUserProgress.endUserId,
        ],
      });
  }

  async function loadUserProgress(
    organizationId: string,
    seasonId: string,
    endUserId: string,
  ) {
    const [row] = await db
      .select()
      .from(battlePassUserProgress)
      .where(
        and(
          eq(battlePassUserProgress.organizationId, organizationId),
          eq(battlePassUserProgress.seasonId, seasonId),
          eq(battlePassUserProgress.endUserId, endUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ─── Public API: config CRUD ──────────────────────────────────

  async function createConfig(
    organizationId: string,
    input: CreateConfigInput,
  ): Promise<BattlePassConfig> {
    // 1) 验证 activity 存在且 kind='season_pass'
    const [act] = await db
      .select()
      .from(activityConfigs)
      .where(
        and(
          eq(activityConfigs.organizationId, organizationId),
          eq(activityConfigs.id, input.activityId),
        ),
      )
      .limit(1);
    if (!act) throw new BattlePassActivityNotFound(input.activityId);
    if (act.kind !== "season_pass") {
      throw new BattlePassInvalidInput(
        `activity kind must be 'season_pass', got '${act.kind}'`,
      );
    }

    // 2) 插入（code + activityId 双 UNIQUE，任一冲突抛对应错误）
    try {
      const [row] = await db
        .insert(battlePassConfigs)
        .values({
          organizationId,
          activityId: input.activityId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          maxLevel: input.maxLevel,
          levelCurve: input.levelCurve,
          tiers: input.tiers,
          levelRewards: input.levelRewards,
          bonusMilestones: (input.bonusMilestones ?? []) as BattlePassBonusMilestoneDef[],
          allowLevelPurchase: input.allowLevelPurchase ?? false,
          levelPurchasePriceSku: input.levelPurchasePriceSku ?? null,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      // Drizzle 包装驱动报错为 DrizzleQueryError，约束名在 cause 里；
      // 兜底也看顶层 message 以防驱动直接 throw。
      const cause = (err as { cause?: { constraint?: string; message?: string } })
        .cause;
      const constraint = cause?.constraint ?? "";
      const haystack = `${constraint} ${cause?.message ?? ""} ${
        err instanceof Error ? err.message : String(err)
      }`;
      if (haystack.includes("battle_pass_configs_org_code_uidx")) {
        throw new BattlePassCodeConflict(input.code);
      }
      if (haystack.includes("battle_pass_configs_activity_uidx")) {
        throw new BattlePassActivityConflict(input.activityId);
      }
      throw err;
    }
  }

  async function updateConfig(
    organizationId: string,
    id: string,
    input: UpdateConfigInput,
  ): Promise<BattlePassConfig> {
    const existing = await loadConfigById(organizationId, id);

    const patch: Partial<typeof battlePassConfigs.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.maxLevel !== undefined) patch.maxLevel = input.maxLevel;
    if (input.levelCurve !== undefined) patch.levelCurve = input.levelCurve;
    if (input.tiers !== undefined) patch.tiers = input.tiers;
    if (input.levelRewards !== undefined)
      patch.levelRewards = input.levelRewards;
    if (input.bonusMilestones !== undefined)
      patch.bonusMilestones = input.bonusMilestones;
    if (input.allowLevelPurchase !== undefined)
      patch.allowLevelPurchase = input.allowLevelPurchase;
    if (input.levelPurchasePriceSku !== undefined)
      patch.levelPurchasePriceSku = input.levelPurchasePriceSku;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return existing;

    const [row] = await db
      .update(battlePassConfigs)
      .set(patch)
      .where(
        and(
          eq(battlePassConfigs.organizationId, organizationId),
          eq(battlePassConfigs.id, id),
        ),
      )
      .returning();
    if (!row) throw new BattlePassConfigNotFound(id);
    return row;
  }

  async function deleteConfig(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const [deleted] = await db
      .delete(battlePassConfigs)
      .where(
        and(
          eq(battlePassConfigs.organizationId, organizationId),
          eq(battlePassConfigs.id, id),
        ),
      )
      .returning({ id: battlePassConfigs.id });
    if (!deleted) throw new BattlePassConfigNotFound(id);
  }

  async function getConfig(
    organizationId: string,
    id: string,
  ): Promise<BattlePassConfig> {
    return await loadConfigById(organizationId, id);
  }

  async function listConfigs(
    organizationId: string,
  ): Promise<BattlePassConfig[]> {
    return await db
      .select()
      .from(battlePassConfigs)
      .where(eq(battlePassConfigs.organizationId, organizationId))
      .orderBy(asc(battlePassConfigs.createdAt));
  }

  // ─── Public API: task bindings ────────────────────────────────

  /** Replace 模式：删除当前绑定 + 批量插入新绑定。两步幂等。 */
  async function bindTasks(
    organizationId: string,
    seasonId: string,
    input: BindTasksInput,
  ): Promise<void> {
    const config = await loadConfigById(organizationId, seasonId);

    await db
      .delete(battlePassSeasonTasks)
      .where(
        and(
          eq(battlePassSeasonTasks.organizationId, organizationId),
          eq(battlePassSeasonTasks.seasonId, config.id),
        ),
      );

    if (input.bindings.length === 0) return;

    await db.insert(battlePassSeasonTasks).values(
      input.bindings.map((b) => ({
        seasonId: config.id,
        organizationId,
        taskDefinitionId: b.taskDefinitionId,
        xpReward: b.xpReward,
        category: b.category,
        weekIndex: b.weekIndex ?? null,
        sortOrder: b.sortOrder ?? 0,
      })),
    );
  }

  async function listSeasonTasks(
    organizationId: string,
    seasonId: string,
  ): Promise<Array<typeof battlePassSeasonTasks.$inferSelect>> {
    await loadConfigById(organizationId, seasonId);
    return await db
      .select()
      .from(battlePassSeasonTasks)
      .where(
        and(
          eq(battlePassSeasonTasks.organizationId, organizationId),
          eq(battlePassSeasonTasks.seasonId, seasonId),
        ),
      )
      .orderBy(asc(battlePassSeasonTasks.sortOrder));
  }

  // ─── Public API: XP earning (event-driven) ───────────────────

  /**
   * 任务完成时给纪行经验。订阅 `task.completed` 事件的主消费路径。
   *
   * 查找所有 **状态 = active** 的纪行季（通过 activity 状态机）且绑定
   * 了该 task 的 season，每个季加经验。一个 task 可能挂多个季（平行
   * 纪行、跨赛季扣款等），全部处理。
   */
  async function grantXpForTask(params: {
    organizationId: string;
    endUserId: string;
    taskDefinitionId: string;
    now?: Date;
  }): Promise<BattlePassXpGrantOutcome[]> {
    const now = params.now ?? new Date();

    // 1) 查所有绑定该 task 且 activity 正 active 的 season
    const rows = await db
      .select({
        seasonId: battlePassSeasonTasks.seasonId,
        xpReward: battlePassSeasonTasks.xpReward,
        configId: battlePassConfigs.id,
        maxLevel: battlePassConfigs.maxLevel,
        levelCurve: battlePassConfigs.levelCurve,
      })
      .from(battlePassSeasonTasks)
      .innerJoin(
        battlePassConfigs,
        eq(battlePassConfigs.id, battlePassSeasonTasks.seasonId),
      )
      .innerJoin(
        activityConfigs,
        eq(activityConfigs.id, battlePassConfigs.activityId),
      )
      .where(
        and(
          eq(
            battlePassSeasonTasks.organizationId,
            params.organizationId,
          ),
          eq(
            battlePassSeasonTasks.taskDefinitionId,
            params.taskDefinitionId,
          ),
          eq(activityConfigs.status, "active"),
        ),
      );

    if (rows.length === 0) {
      return [
        {
          idempotent: true,
          seasonId: null,
          xpAdded: 0,
          oldLevel: 0,
          newLevel: 0,
          currentXp: 0,
        },
      ];
    }

    const outcomes: BattlePassXpGrantOutcome[] = [];

    for (const binding of rows) {
      const oldProgress = await loadUserProgress(
        params.organizationId,
        binding.seasonId,
        params.endUserId,
      );
      const oldLevel = oldProgress?.currentLevel ?? 0;

      // Step A: UPSERT 加经验
      const [after] = await db
        .insert(battlePassUserProgress)
        .values({
          seasonId: binding.seasonId,
          endUserId: params.endUserId,
          organizationId: params.organizationId,
          currentXp: binding.xpReward,
          currentLevel: 0,
          ownedTiers: ["free"],
          lastXpAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            battlePassUserProgress.seasonId,
            battlePassUserProgress.endUserId,
          ],
          set: {
            currentXp: sql`${battlePassUserProgress.currentXp} + ${binding.xpReward}`,
            lastXpAt: now,
            updatedAt: now,
          },
        })
        .returning({
          currentXp: battlePassUserProgress.currentXp,
          currentLevel: battlePassUserProgress.currentLevel,
        });

      if (!after) continue;

      // Step B: 按新 xp 算 newLevel，条件 UPDATE
      const newLevel = computeLevelFromXp(
        after.currentXp,
        binding.levelCurve,
        binding.maxLevel,
      );
      if (newLevel > after.currentLevel) {
        await db
          .update(battlePassUserProgress)
          .set({ currentLevel: newLevel })
          .where(
            and(
              eq(battlePassUserProgress.seasonId, binding.seasonId),
              eq(battlePassUserProgress.endUserId, params.endUserId),
              sql`${battlePassUserProgress.currentLevel} < ${newLevel}`,
            ),
          );
      }

      outcomes.push({
        idempotent: false,
        seasonId: binding.seasonId,
        xpAdded: binding.xpReward,
        oldLevel,
        newLevel,
        currentXp: after.currentXp,
      });

      if (events) {
        void events.emit("battlepass.xp.earned", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          seasonId: binding.seasonId,
          taskDefinitionId: params.taskDefinitionId,
          xp: binding.xpReward,
          oldLevel,
          newLevel,
          currentXp: after.currentXp,
        });
        if (newLevel > oldLevel) {
          void events.emit("battlepass.level.up", {
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            seasonId: binding.seasonId,
            oldLevel,
            newLevel,
          });
        }
      }
    }

    return outcomes;
  }

  // ─── Public API: tier grant ──────────────────────────────────

  /**
   * 激活档位。外部支付回调 / 运营补发 / 兑换码的统一入口。
   * 同一 (season, endUser, tier) UNIQUE 拦重，返回 `idempotent:true`。
   */
  async function grantTier(params: {
    organizationId: string;
    seasonId: string;
    endUserId: string;
    tierCode: string;
    source: BattlePassTierGrantSource;
    externalOrderId?: string | null;
    now?: Date;
  }): Promise<BattlePassGrantTierOutcome> {
    const now = params.now ?? new Date();
    const config = await loadConfigById(params.organizationId, params.seasonId);
    assertTierExists(config, params.tierCode);

    await ensureUserProgressRow({
      organizationId: params.organizationId,
      seasonId: params.seasonId,
      endUserId: params.endUserId,
      now,
    });

    const inserted = await db
      .insert(battlePassTierGrants)
      .values({
        seasonId: params.seasonId,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        tierCode: params.tierCode,
        source: params.source,
        externalOrderId: params.externalOrderId ?? null,
        grantedAt: now,
      })
      .onConflictDoNothing({
        target: [
          battlePassTierGrants.seasonId,
          battlePassTierGrants.endUserId,
          battlePassTierGrants.tierCode,
        ],
      })
      .returning({ id: battlePassTierGrants.id });

    const idempotent = inserted.length === 0;

    if (!idempotent) {
      // 只有首次激活才追加 ownedTiers。并发安全：即便两条请求同时都
      // 过了 UNIQUE（不可能，UNIQUE 保证只有一个插入成功），下面的
      // array_append 使用 WHERE NOT (tierCode = ANY(owned_tiers)) 仍
      // 然幂等。
      await db
        .update(battlePassUserProgress)
        .set({
          ownedTiers: sql`array_append(${battlePassUserProgress.ownedTiers}, ${params.tierCode})`,
          updatedAt: now,
        })
        .where(
          and(
            eq(battlePassUserProgress.seasonId, params.seasonId),
            eq(battlePassUserProgress.endUserId, params.endUserId),
            sql`NOT (${params.tierCode} = ANY(${battlePassUserProgress.ownedTiers}))`,
          ),
        );
    }

    const progress = await loadUserProgress(
      params.organizationId,
      params.seasonId,
      params.endUserId,
    );

    if (events && !idempotent) {
      void events.emit("battlepass.tier.granted", {
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        seasonId: params.seasonId,
        tierCode: params.tierCode,
        source: params.source,
        externalOrderId: params.externalOrderId ?? null,
      });
    }

    return {
      idempotent,
      ownedTiers: progress?.ownedTiers ?? ["free", params.tierCode],
    };
  }

  // ─── Public API: claim ───────────────────────────────────────

  async function claimLevel(params: {
    organizationId: string;
    seasonId: string;
    endUserId: string;
    level: number;
    tierCode: string;
    now?: Date;
  }): Promise<BattlePassClaimOutcome> {
    const now = params.now ?? new Date();
    const config = await loadConfigById(params.organizationId, params.seasonId);
    assertTierExists(config, params.tierCode);

    await assertRewardWindowOpen(
      params.organizationId,
      config.activityId,
      config.id,
      now,
    );

    const progress = await loadUserProgress(
      params.organizationId,
      params.seasonId,
      params.endUserId,
    );
    if (!progress || progress.currentLevel < params.level) {
      throw new BattlePassLevelNotReached(
        params.level,
        progress?.currentLevel ?? 0,
      );
    }
    if (!progress.ownedTiers.includes(params.tierCode)) {
      throw new BattlePassTierNotOwned(params.tierCode);
    }

    const rewardEntries = findLevelRewardEntries(
      config,
      params.level,
      params.tierCode,
    );

    // 幂等插入 claims 账本
    const inserted = await db
      .insert(battlePassClaims)
      .values({
        seasonId: params.seasonId,
        endUserId: params.endUserId,
        organizationId: params.organizationId,
        level: params.level,
        tierCode: params.tierCode,
        rewardEntries,
        claimedAt: now,
      })
      .onConflictDoNothing({
        target: [
          battlePassClaims.seasonId,
          battlePassClaims.endUserId,
          battlePassClaims.level,
          battlePassClaims.tierCode,
        ],
      })
      .returning({ id: battlePassClaims.id });

    if (inserted.length === 0) {
      return {
        level: params.level,
        tierCode: params.tierCode,
        idempotent: true,
        rewardEntries,
      };
    }

    // 首次领 → 发奖
    const rewardSvcs = rewardServicesGetter();
    await grantRewards(
      rewardSvcs,
      params.organizationId,
      params.endUserId,
      rewardEntries,
      `battle_pass.level_claim`,
      `${params.seasonId}:${params.level}:${params.tierCode}`,
    );

    if (events) {
      void events.emit("battlepass.level.claimed", {
        organizationId: params.organizationId,
        endUserId: params.endUserId,
        seasonId: params.seasonId,
        level: params.level,
        tierCode: params.tierCode,
      });
    }

    return {
      level: params.level,
      tierCode: params.tierCode,
      idempotent: false,
      rewardEntries,
    };
  }

  async function listClaimable(
    organizationId: string,
    seasonId: string,
    endUserId: string,
  ): Promise<BattlePassClaimableEntry[]> {
    const config = await loadConfigById(organizationId, seasonId);
    const progress = await loadUserProgress(
      organizationId,
      seasonId,
      endUserId,
    );
    if (!progress) return [];

    const levelRewards = config.levelRewards as BattlePassLevelRewardDef[];
    const owned = new Set(progress.ownedTiers);

    // 查询 claims 表拿已领记录
    const claimed = await db
      .select({
        level: battlePassClaims.level,
        tierCode: battlePassClaims.tierCode,
      })
      .from(battlePassClaims)
      .where(
        and(
          eq(battlePassClaims.organizationId, organizationId),
          eq(battlePassClaims.seasonId, seasonId),
          eq(battlePassClaims.endUserId, endUserId),
        ),
      );
    const claimedKeys = new Set(
      claimed.map((c) => `${c.level}:${c.tierCode}`),
    );

    const result: BattlePassClaimableEntry[] = [];
    for (const lr of levelRewards) {
      if (lr.level > progress.currentLevel) continue;
      for (const [tierCode, entries] of Object.entries(lr.rewards)) {
        if (!owned.has(tierCode)) continue;
        if (!entries || entries.length === 0) continue;
        if (claimedKeys.has(`${lr.level}:${tierCode}`)) continue;
        result.push({ level: lr.level, tierCode, rewardEntries: entries });
      }
    }
    return result;
  }

  async function claimAll(params: {
    organizationId: string;
    seasonId: string;
    endUserId: string;
    now?: Date;
  }): Promise<BattlePassClaimOutcome[]> {
    const claimable = await listClaimable(
      params.organizationId,
      params.seasonId,
      params.endUserId,
    );
    if (claimable.length === 0) return [];

    // reward window 检查在 claimLevel 内部做；这里直接逐项调用。
    const outcomes: BattlePassClaimOutcome[] = [];
    for (const item of claimable) {
      outcomes.push(
        await claimLevel({
          organizationId: params.organizationId,
          seasonId: params.seasonId,
          endUserId: params.endUserId,
          level: item.level,
          tierCode: item.tierCode,
          now: params.now,
        }),
      );
    }
    return outcomes;
  }

  // ─── Public API: aggregate view ──────────────────────────────

  async function getAggregateView(
    organizationId: string,
    seasonId: string,
    endUserId: string,
  ): Promise<BattlePassAggregateView> {
    const config = await loadConfigById(organizationId, seasonId);

    // progress
    const progress = await loadUserProgress(organizationId, seasonId, endUserId);
    const currentXp = progress?.currentXp ?? 0;
    const currentLevel = progress?.currentLevel ?? 0;
    const ownedTiers = progress?.ownedTiers ?? ["free"];

    // task bindings
    const bindings = await db
      .select()
      .from(battlePassSeasonTasks)
      .where(
        and(
          eq(battlePassSeasonTasks.organizationId, organizationId),
          eq(battlePassSeasonTasks.seasonId, seasonId),
        ),
      )
      .orderBy(asc(battlePassSeasonTasks.sortOrder));

    // claimable
    const claimable = await listClaimable(organizationId, seasonId, endUserId);

    return {
      season: {
        id: config.id,
        code: config.code,
        name: config.name,
        maxLevel: config.maxLevel,
        tiers: config.tiers as BattlePassTierDef[],
        levelCurve: config.levelCurve,
      },
      progress: {
        currentXp,
        currentLevel,
        xpToNextLevel: xpToNextLevel(
          currentXp,
          currentLevel,
          config.levelCurve,
          config.maxLevel,
        ),
        ownedTiers,
      },
      claimable,
      taskBindings: bindings.map((b) => ({
        taskDefinitionId: b.taskDefinitionId,
        xpReward: b.xpReward,
        category: b.category as BattlePassTaskCategory,
        weekIndex: b.weekIndex,
        sortOrder: b.sortOrder,
      })),
    };
  }

  /**
   * 查找当前 organization 下 state=active 的第一个纪行季（用于
   * "玩家进入纪行页只有一个当前赛季"场景）。多个并行赛季时返回
   * 最早 startAt 的那个。
   */
  async function getCurrentSeason(
    organizationId: string,
  ): Promise<BattlePassConfig | null> {
    const rows = await db
      .select({ config: battlePassConfigs })
      .from(battlePassConfigs)
      .innerJoin(
        activityConfigs,
        eq(activityConfigs.id, battlePassConfigs.activityId),
      )
      .where(
        and(
          eq(battlePassConfigs.organizationId, organizationId),
          inArray(activityConfigs.status, [
            "active",
            "settling",
            "ended",
          ]),
        ),
      )
      .orderBy(asc(activityConfigs.startAt));
    return rows[0]?.config ?? null;
  }

  // ─── Archive cleanup (called by kind handler) ────────────────

  async function purgeUserProgressForSeason(seasonId: string): Promise<void> {
    await db
      .delete(battlePassUserProgress)
      .where(eq(battlePassUserProgress.seasonId, seasonId));
  }

  // ─── Utilities (exposed for handler/tests) ───────────────────

  function computeLevel(
    xp: number,
    config: Pick<BattlePassConfig, "levelCurve" | "maxLevel">,
  ): number {
    return computeLevelFromXp(xp, config.levelCurve, config.maxLevel);
  }

  function getCumulativeXp(
    level: number,
    config: Pick<BattlePassConfig, "levelCurve">,
  ): number {
    return cumulativeXpAtLevel(level, config.levelCurve);
  }

  return {
    // Config CRUD
    createConfig,
    updateConfig,
    deleteConfig,
    getConfig,
    listConfigs,
    // Task bindings
    bindTasks,
    listSeasonTasks,
    // Gameplay
    grantXpForTask,
    grantTier,
    claimLevel,
    claimAll,
    listClaimable,
    getAggregateView,
    getCurrentSeason,
    // Lifecycle
    purgeUserProgressForSeason,
    // Utilities
    computeLevel,
    getCumulativeXp,
  };
}

export type BattlePassService = ReturnType<typeof createBattlePassService>;
