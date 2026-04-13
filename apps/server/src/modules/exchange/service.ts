/**
 * Exchange service — protocol-agnostic business logic for the exchange system.
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * The exchange module depends on the item module's service for granting
 * and deducting items. This cross-module dependency is injected via the
 * factory function, not imported directly.
 *
 * Exchange execution flow (without transactions):
 * 1. Idempotency check via grant_log
 * 2. Atomically increment user exchange count (WHERE count < userLimit)
 * 3. Atomically increment global count (WHERE global_count < globalLimit)
 * 4. Sequentially deduct cost items (optimistic lock per item)
 * 5. Sequentially grant reward items
 * 6. On any failure in step 4, rollback already-deducted items
 *
 * See the plan document for concurrency analysis and risk discussion.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  exchangeConfigs,
  exchangeOptions,
  exchangeUserStates,
} from "../../schema/exchange";
import { itemGrantLogs } from "../../schema/item";
import type { ItemService } from "../item";
import {
  ExchangeConfigAliasConflict,
  ExchangeConfigInactive,
  ExchangeConfigNotFound,
  ExchangeGlobalLimitReached,
  ExchangeOptionInactive,
  ExchangeOptionNotFound,
  ExchangeUserLimitReached,
} from "./errors";
import type { ItemEntry } from "../item/types";
import type {
  ExchangeConfig,
  ExchangeOption,
  ExchangeResult,
} from "./types";
import type {
  CreateConfigInput,
  CreateOptionInput,
  UpdateConfigInput,
  UpdateOptionInput,
} from "./validators";

type ExchangeDeps = Pick<AppDeps, "db">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

export function createExchangeService(d: ExchangeDeps, itemSvc: ItemService) {
  const { db } = d;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<ExchangeConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(exchangeConfigs.organizationId, organizationId),
          eq(exchangeConfigs.id, key),
        )
      : and(
          eq(exchangeConfigs.organizationId, organizationId),
          eq(exchangeConfigs.alias, key),
        );
    const rows = await db.select().from(exchangeConfigs).where(where).limit(1);
    if (!rows[0]) throw new ExchangeConfigNotFound(key);
    return rows[0];
  }

  async function loadOptionById(
    optionId: string,
  ): Promise<ExchangeOption> {
    const rows = await db
      .select()
      .from(exchangeOptions)
      .where(eq(exchangeOptions.id, optionId))
      .limit(1);
    if (!rows[0]) throw new ExchangeOptionNotFound(optionId);
    return rows[0];
  }

  return {
    // ─── Config CRUD ──────────────────────────────────────────

    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<ExchangeConfig> {
      try {
        const [row] = await db
          .insert(exchangeConfigs)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new ExchangeConfigAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateConfig(
      organizationId: string,
      id: string,
      patch: UpdateConfigInput,
    ): Promise<ExchangeConfig> {
      const existing = await loadConfigByKey(organizationId, id);
      const updateValues: Partial<typeof exchangeConfigs.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(exchangeConfigs)
          .set(updateValues)
          .where(
            and(
              eq(exchangeConfigs.id, existing.id),
              eq(exchangeConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new ExchangeConfigNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new ExchangeConfigAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(exchangeConfigs)
        .where(
          and(
            eq(exchangeConfigs.id, id),
            eq(exchangeConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: exchangeConfigs.id });
      if (deleted.length === 0) throw new ExchangeConfigNotFound(id);
    },

    async listConfigs(organizationId: string): Promise<ExchangeConfig[]> {
      return db
        .select()
        .from(exchangeConfigs)
        .where(eq(exchangeConfigs.organizationId, organizationId))
        .orderBy(desc(exchangeConfigs.createdAt));
    },

    async getConfig(
      organizationId: string,
      idOrAlias: string,
    ): Promise<ExchangeConfig> {
      return loadConfigByKey(organizationId, idOrAlias);
    },

    // ─── Option CRUD ──────────────────────────────────────────

    async createOption(
      organizationId: string,
      configKey: string,
      input: CreateOptionInput,
    ): Promise<ExchangeOption> {
      const config = await loadConfigByKey(organizationId, configKey);
      const [row] = await db
        .insert(exchangeOptions)
        .values({
          configId: config.id,
          organizationId,
          name: input.name,
          description: input.description ?? null,
          costItems: input.costItems,
          rewardItems: input.rewardItems,
          userLimit: input.userLimit ?? null,
          globalLimit: input.globalLimit ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    async updateOption(
      organizationId: string,
      optionId: string,
      patch: UpdateOptionInput,
    ): Promise<ExchangeOption> {
      const existing = await loadOptionById(optionId);
      if (existing.organizationId !== organizationId) {
        throw new ExchangeOptionNotFound(optionId);
      }

      const updateValues: Partial<typeof exchangeOptions.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.costItems !== undefined) updateValues.costItems = patch.costItems;
      if (patch.rewardItems !== undefined)
        updateValues.rewardItems = patch.rewardItems;
      if (patch.userLimit !== undefined) updateValues.userLimit = patch.userLimit;
      if (patch.globalLimit !== undefined)
        updateValues.globalLimit = patch.globalLimit;
      if (patch.sortOrder !== undefined) updateValues.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      const [row] = await db
        .update(exchangeOptions)
        .set(updateValues)
        .where(eq(exchangeOptions.id, optionId))
        .returning();
      if (!row) throw new ExchangeOptionNotFound(optionId);
      return row;
    },

    async deleteOption(
      organizationId: string,
      optionId: string,
    ): Promise<void> {
      const deleted = await db
        .delete(exchangeOptions)
        .where(
          and(
            eq(exchangeOptions.id, optionId),
            eq(exchangeOptions.organizationId, organizationId),
          ),
        )
        .returning({ id: exchangeOptions.id });
      if (deleted.length === 0) throw new ExchangeOptionNotFound(optionId);
    },

    async listOptions(
      organizationId: string,
      configKey: string,
    ): Promise<ExchangeOption[]> {
      const config = await loadConfigByKey(organizationId, configKey);
      return db
        .select()
        .from(exchangeOptions)
        .where(eq(exchangeOptions.configId, config.id))
        .orderBy(exchangeOptions.sortOrder, exchangeOptions.createdAt);
    },

    async getOption(optionId: string): Promise<ExchangeOption> {
      return loadOptionById(optionId);
    },

    // ─── Exchange execution ───────────────────────────────────

    async execute(params: {
      organizationId: string;
      endUserId: string;
      optionId: string;
      idempotencyKey?: string;
    }): Promise<ExchangeResult> {
      const exchangeId = params.idempotencyKey ?? crypto.randomUUID();

      // 1. Idempotency check
      const existing = await db
        .select({ id: itemGrantLogs.id })
        .from(itemGrantLogs)
        .where(
          and(
            eq(itemGrantLogs.source, "exchange"),
            eq(itemGrantLogs.sourceId, exchangeId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Already executed — return success without re-processing
        const option = await loadOptionById(params.optionId);
        return {
          success: true,
          exchangeId,
          optionId: option.id,
          costItems: option.costItems,
          rewardItems: option.rewardItems,
        };
      }

      // 2. Load and validate option + parent config
      const option = await loadOptionById(params.optionId);
      if (option.organizationId !== params.organizationId) {
        throw new ExchangeOptionNotFound(params.optionId);
      }
      if (!option.isActive) {
        throw new ExchangeOptionInactive(params.optionId);
      }

      const config = await loadConfigByKey(
        params.organizationId,
        option.configId,
      );
      if (!config.isActive) {
        throw new ExchangeConfigInactive(option.configId);
      }

      const costItems = option.costItems;
      const rewardItems = option.rewardItems;

      // 3. Check + increment user limit (atomic upsert)
      if (option.userLimit !== null) {
        const upserted = await db
          .insert(exchangeUserStates)
          .values({
            optionId: option.id,
            endUserId: params.endUserId,
            organizationId: params.organizationId,
            count: 1,
          })
          .onConflictDoUpdate({
            target: [exchangeUserStates.optionId, exchangeUserStates.endUserId],
            set: {
              count: sql`${exchangeUserStates.count} + 1`,
              version: sql`${exchangeUserStates.version} + 1`,
            },
            setWhere: sql`${exchangeUserStates.count} < ${option.userLimit}`,
          })
          .returning();

        if (upserted.length === 0) {
          throw new ExchangeUserLimitReached(option.id);
        }
      }

      // 4. Check + increment global limit
      if (option.globalLimit !== null) {
        const updated = await db
          .update(exchangeOptions)
          .set({
            globalCount: sql`${exchangeOptions.globalCount} + 1`,
          })
          .where(
            and(
              eq(exchangeOptions.id, option.id),
              sql`${exchangeOptions.globalCount} < ${option.globalLimit}`,
            ),
          )
          .returning();

        if (updated.length === 0) {
          // Rollback user count
          if (option.userLimit !== null) {
            await db
              .update(exchangeUserStates)
              .set({
                count: sql`${exchangeUserStates.count} - 1`,
                version: sql`${exchangeUserStates.version} + 1`,
              })
              .where(
                and(
                  eq(exchangeUserStates.optionId, option.id),
                  eq(exchangeUserStates.endUserId, params.endUserId),
                ),
              );
          }
          throw new ExchangeGlobalLimitReached(option.id);
        }
      }

      // 5. Deduct cost items
      const deductedEntries: ItemEntry[] = [];
      try {
        for (const cost of costItems) {
          await itemSvc.deductItems({
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            deductions: [cost],
            source: "exchange",
            sourceId: exchangeId,
          });
          deductedEntries.push(cost);
        }
      } catch (err) {
        // Rollback already-deducted items
        for (const deducted of deductedEntries) {
          await itemSvc.grantItems({
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            grants: [deducted],
            source: "exchange_rollback",
            sourceId: exchangeId,
          });
        }

        // Rollback user count
        if (option.userLimit !== null) {
          await db
            .update(exchangeUserStates)
            .set({
              count: sql`${exchangeUserStates.count} - 1`,
              version: sql`${exchangeUserStates.version} + 1`,
            })
            .where(
              and(
                eq(exchangeUserStates.optionId, option.id),
                eq(exchangeUserStates.endUserId, params.endUserId),
              ),
            );
        }

        // Rollback global count
        if (option.globalLimit !== null) {
          await db
            .update(exchangeOptions)
            .set({
              globalCount: sql`${exchangeOptions.globalCount} - 1`,
            })
            .where(eq(exchangeOptions.id, option.id));
        }

        throw err;
      }

      // 6. Grant reward items
      for (const reward of rewardItems) {
        await itemSvc.grantItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          grants: [reward],
          source: "exchange",
          sourceId: exchangeId,
        });
      }

      return {
        success: true,
        exchangeId,
        optionId: option.id,
        costItems,
        rewardItems,
      };
    },

    async getUserOptionState(params: {
      organizationId: string;
      endUserId: string;
      optionId: string;
    }): Promise<{ optionId: string; endUserId: string; count: number }> {
      const rows = await db
        .select()
        .from(exchangeUserStates)
        .where(
          and(
            eq(exchangeUserStates.optionId, params.optionId),
            eq(exchangeUserStates.endUserId, params.endUserId),
          ),
        )
        .limit(1);

      return {
        optionId: params.optionId,
        endUserId: params.endUserId,
        count: rows[0]?.count ?? 0,
      };
    },
  };
}

export type ExchangeService = ReturnType<typeof createExchangeService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
