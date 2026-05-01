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

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { type MoveBody, appendKey, moveAndReturn } from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import type { RewardEntry } from "../../lib/rewards";
import {
  exchangeConfigs,
  exchangeOptions,
  exchangeUserStates,
} from "../../schema/exchange";
import { itemGrantLogs } from "../../schema/item";
import type { CurrencyService } from "../currency";
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

// `events` optional to keep `createExchangeService({ db }, ...)` test
// sites compiling. Production wiring hands it in via `deps`.
type ExchangeDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with exchange-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "exchange.executed": {
      organizationId: string;
      endUserId: string;
      exchangeId: string;
      optionId: string;
      configId: string;
      configAlias: string | null;
      costItems: RewardEntry[];
      rewardItems: RewardEntry[];
    };
  }
}

export function createExchangeService(
  d: ExchangeDeps,
  itemSvc: ItemService,
  currencySvc: CurrencyService,
) {
  const { db, events } = d;

  /**
   * Deduct one RewardEntry, routed by type.
   *
   * Keeps the per-entry deduct loop (required for the exchange rollback
   * semantics: already-deducted entries need to be individually refunded
   * on a mid-flight failure). `"entity"` is rejected because entities
   * cannot be spent — use synthesis/discard for that.
   */
  async function deductOne(
    entry: RewardEntry,
    organizationId: string,
    endUserId: string,
    source: string,
    sourceId: string,
  ): Promise<void> {
    if (entry.type === "currency") {
      await currencySvc.deduct({
        organizationId,
        endUserId,
        deductions: [{ currencyId: entry.id, amount: entry.count }],
        source,
        sourceId,
      });
    } else if (entry.type === "item") {
      await itemSvc.deductItems({
        organizationId,
        endUserId,
        deductions: [{ definitionId: entry.id, quantity: entry.count }],
        source,
        sourceId,
      });
    } else {
      throw new Error(
        `exchange: reward entry type "${entry.type}" is not deductible`,
      );
    }
  }

  /** Grant one RewardEntry, routed by type. */
  async function grantOne(
    entry: RewardEntry,
    organizationId: string,
    endUserId: string,
    source: string,
    sourceId: string,
  ): Promise<void> {
    if (entry.type === "currency") {
      await currencySvc.grant({
        organizationId,
        endUserId,
        grants: [{ currencyId: entry.id, amount: entry.count }],
        source,
        sourceId,
      });
    } else if (entry.type === "item") {
      await itemSvc.grantItems({
        organizationId,
        endUserId,
        grants: [{ definitionId: entry.id, quantity: entry.count }],
        source,
        sourceId,
      });
    } else {
      // "entity" — not supported as a refund target here. The exchange
      // reward path typically delegates entity rewards to a higher-level
      // orchestrator; this module has no `entitySvc` injected.
      throw new Error(
        `exchange: reward entry type "${entry.type}" is not supported here`,
      );
    }
  }

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

    async listConfigs(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<ExchangeConfig>> {
      const limit = clampLimit(params.limit);
      const conditions: SQL[] = [eq(exchangeConfigs.organizationId, organizationId)];
      const seek = cursorWhere(params.cursor, exchangeConfigs.createdAt, exchangeConfigs.id);
      if (seek) conditions.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(exchangeConfigs.name, pat), ilike(exchangeConfigs.alias, pat));
        if (search) conditions.push(search);
      }
      const rows = await db
        .select()
        .from(exchangeConfigs)
        .where(and(...conditions))
        .orderBy(desc(exchangeConfigs.createdAt), desc(exchangeConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
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
      const __sortKey = await appendKey(db, { table: exchangeOptions, sortColumn: exchangeOptions.sortOrder, scopeWhere: eq(exchangeOptions.organizationId, organizationId)! });
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
          sortOrder: __sortKey,
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

    async moveOption(
      organizationId: string,
      optionId: string,
      body: MoveBody,
    ): Promise<ExchangeOption> {
      const existing = await loadOptionById(optionId);
      if (existing.organizationId !== organizationId) {
        throw new ExchangeOptionNotFound(optionId);
      }
      // Scope by configId so reordering is per-exchange-config.
      return moveAndReturn<ExchangeOption>(db, {
        table: exchangeOptions,
        sortColumn: exchangeOptions.sortOrder,
        idColumn: exchangeOptions.id,
        partitionWhere: and(
          eq(exchangeOptions.organizationId, organizationId),
          eq(exchangeOptions.configId, existing.configId),
        )!,
        id: optionId,
        body,
        notFound: (sid) => new ExchangeOptionNotFound(sid),
      });
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
      params: PageParams = {},
    ): Promise<Page<ExchangeOption>> {
      const config = await loadConfigByKey(organizationId, configKey);
      const limit = clampLimit(params.limit);
      const conditions: SQL[] = [eq(exchangeOptions.configId, config.id)];
      const seek = cursorWhere(params.cursor, exchangeOptions.createdAt, exchangeOptions.id);
      if (seek) conditions.push(seek);
      if (params.q) {
        conditions.push(ilike(exchangeOptions.name, `%${params.q}%`));
      }
      const rows = await db
        .select()
        .from(exchangeOptions)
        .where(and(...conditions))
        .orderBy(asc(exchangeOptions.sortOrder), asc(exchangeOptions.createdAt))
        .limit(limit + 1);
      return buildPage(rows, limit);
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

      // 5. Deduct cost items (items + currencies via per-entry dispatch)
      const deductedEntries: RewardEntry[] = [];
      try {
        for (const cost of costItems) {
          await deductOne(
            cost,
            params.organizationId,
            params.endUserId,
            "exchange",
            exchangeId,
          );
          deductedEntries.push(cost);
        }
      } catch (err) {
        // Rollback already-deducted entries, routed by type.
        for (const deducted of deductedEntries) {
          await grantOne(
            deducted,
            params.organizationId,
            params.endUserId,
            "exchange_rollback",
            exchangeId,
          );
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

      // 6. Grant reward items (items + currencies via per-entry dispatch)
      for (const reward of rewardItems) {
        await grantOne(
          reward,
          params.organizationId,
          params.endUserId,
          "exchange",
          exchangeId,
        );
      }

      if (events) {
        await events.emit("exchange.executed", {
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          exchangeId,
          optionId: option.id,
          configId: config.id,
          configAlias: config.alias,
          costItems,
          rewardItems,
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
