/**
 * Item service — protocol-agnostic business logic for the unified
 * resource system (items + currencies).
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Key design decisions:
 *
 * 1. Currencies and items share one table (`item_definitions` +
 *    `item_inventories`). A "currency" is just a stackable item with
 *    stackLimit=null and holdLimit=null.
 *
 * 2. Inventory writes use single atomic SQL statements rather than
 *    transactions, so concurrency is handled via optimistic locking
 *    (version column) or conditional upserts.
 *
 * 3. For unlimited-stack items (currencies), a partial unique index on
 *    (org, endUser, defId) WHERE instance_data IS NULL ensures one row
 *    per user+item and enables ON CONFLICT DO UPDATE.
 *
 * 4. `grantItems` is the unified reward center entry point — both
 *    admin grants and system rewards (check-in, exchange) call it.
 */

import { and, desc, eq, ilike, or, sql, sum, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import { logger } from "../../lib/logger";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  itemCategories,
  itemDefinitions,
  itemGrantLogs,
  itemInventories,
} from "../../schema/item";
import {
  ItemCategoryAliasConflict,
  ItemCategoryNotFound,
  ItemConcurrencyConflict,
  ItemDefinitionAliasConflict,
  ItemDefinitionNotFound,
  ItemHoldLimitReached,
  ItemInsufficientBalance,
  ItemInvalidInput,
} from "./errors";
import type {
  DeductResult,
  GrantResult,
  InventoryView,
  ItemCategory,
  ItemDefinition,
} from "./types";
import {
  itemDefinitionFilters,
  type CreateCategoryInput,
  type CreateDefinitionInput,
  type UpdateCategoryInput,
  type UpdateDefinitionInput,
} from "./validators";

type ItemDeps = Pick<AppDeps, "db">;

/**
 * Post-grant hook signature. Other modules (currently: collection) can
 * register a fire-and-forget callback that receives the same params
 * grantItems was called with, AFTER all inventory + log writes have
 * succeeded. The hook must be idempotent and must never throw — its
 * errors are caught and logged here, because a hook failure absolutely
 * must not roll back the user-facing grant.
 */
export type GrantHook = (params: {
  organizationId: string;
  endUserId: string;
  grants: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
  source: string;
  sourceId?: string;
}) => Promise<void>;

export function createItemService(d: ItemDeps) {
  const { db } = d;

  // Single slot for a post-grant hook. Module-scope so `setGrantHook`
  // can rebind it from outside (e.g., the collection barrel) after this
  // factory has been called.
  let grantHook: GrantHook | null = null;

  // ─── Category helpers ───────────────────────────────────────────

  async function loadCategoryByKey(
    organizationId: string,
    key: string,
  ): Promise<ItemCategory> {
    const where = looksLikeId(key)
      ? and(
          eq(itemCategories.organizationId, organizationId),
          eq(itemCategories.id, key),
        )
      : and(
          eq(itemCategories.organizationId, organizationId),
          eq(itemCategories.alias, key),
        );
    const rows = await db.select().from(itemCategories).where(where).limit(1);
    if (!rows[0]) throw new ItemCategoryNotFound(key);
    return rows[0];
  }

  // ─── Definition helpers ─────────────────────────────────────────

  async function loadDefinitionByKey(
    organizationId: string,
    key: string,
  ): Promise<ItemDefinition> {
    const where = looksLikeId(key)
      ? and(
          eq(itemDefinitions.organizationId, organizationId),
          eq(itemDefinitions.id, key),
        )
      : and(
          eq(itemDefinitions.organizationId, organizationId),
          eq(itemDefinitions.alias, key),
        );
    const rows = await db.select().from(itemDefinitions).where(where).limit(1);
    if (!rows[0]) throw new ItemDefinitionNotFound(key);
    return rows[0];
  }

  // ─── Inventory helpers ──────────────────────────────────────────

  /** Sum total quantity across all stacks for a user + definition. */
  async function totalBalance(
    organizationId: string,
    endUserId: string,
    definitionId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ total: sum(itemInventories.quantity) })
      .from(itemInventories)
      .where(
        and(
          eq(itemInventories.organizationId, organizationId),
          eq(itemInventories.endUserId, endUserId),
          eq(itemInventories.definitionId, definitionId),
        ),
      );
    return Number(row?.total ?? 0);
  }

  /**
   * Grant a single item type to a user. Handles stacking logic:
   * - Unlimited stack (stackLimit=null): upsert single row
   * - Limited stack: fill existing stacks then create new ones
   * - Non-stackable: insert individual rows (quantity=1 each)
   */
  async function grantSingleItem(
    organizationId: string,
    endUserId: string,
    def: ItemDefinition,
    quantity: number,
  ): Promise<{ quantityBefore: number; quantityAfter: number }> {
    const quantityBefore = await totalBalance(
      organizationId,
      endUserId,
      def.id,
    );

    // Hold limit check
    if (def.holdLimit !== null && quantityBefore + quantity > def.holdLimit) {
      throw new ItemHoldLimitReached(def.id, def.holdLimit);
    }

    if (!def.stackable) {
      // Non-stackable: insert `quantity` individual rows
      for (let i = 0; i < quantity; i++) {
        await db.insert(itemInventories).values({
          organizationId,
          endUserId,
          definitionId: def.id,
          quantity: 1,
          isSingleton: false,
        });
      }
    } else if (def.stackLimit === null) {
      // Unlimited stack (currency): upsert single row via partial unique index
      await db
        .insert(itemInventories)
        .values({
          organizationId,
          endUserId,
          definitionId: def.id,
          quantity,
          isSingleton: true,
        })
        .onConflictDoUpdate({
          target: [
            itemInventories.organizationId,
            itemInventories.endUserId,
            itemInventories.definitionId,
          ],
          targetWhere: sql`${itemInventories.isSingleton} = true`,
          set: {
            quantity: sql`${itemInventories.quantity} + ${quantity}`,
            version: sql`${itemInventories.version} + 1`,
          },
        });
    } else {
      // Limited stack: fill existing then create new stacks
      let remaining = quantity;

      // Find existing non-full stacks
      const stacks = await db
        .select()
        .from(itemInventories)
        .where(
          and(
            eq(itemInventories.organizationId, organizationId),
            eq(itemInventories.endUserId, endUserId),
            eq(itemInventories.definitionId, def.id),
            sql`${itemInventories.quantity} < ${def.stackLimit}`,
          ),
        )
        .orderBy(itemInventories.createdAt);

      for (const stack of stacks) {
        if (remaining <= 0) break;
        const space = def.stackLimit - stack.quantity;
        const add = Math.min(space, remaining);

        const updated = await db
          .update(itemInventories)
          .set({
            quantity: sql`${itemInventories.quantity} + ${add}`,
            version: sql`${itemInventories.version} + 1`,
          })
          .where(
            and(
              eq(itemInventories.id, stack.id),
              eq(itemInventories.version, stack.version),
            ),
          )
          .returning();

        if (updated.length === 0) {
          throw new ItemConcurrencyConflict();
        }
        remaining -= add;
      }

      // Create new stacks for the remainder
      while (remaining > 0) {
        const stackQty = Math.min(remaining, def.stackLimit);
        await db.insert(itemInventories).values({
          organizationId,
          endUserId,
          definitionId: def.id,
          quantity: stackQty,
          isSingleton: false,
        });
        remaining -= stackQty;
      }
    }

    const quantityAfter = quantityBefore + quantity;
    return { quantityBefore, quantityAfter };
  }

  /**
   * Deduct a single item type from a user. Drains from last stack first.
   * Removes empty stacks.
   */
  async function deductSingleItem(
    organizationId: string,
    endUserId: string,
    def: ItemDefinition,
    quantity: number,
  ): Promise<{ quantityBefore: number; quantityAfter: number }> {
    const quantityBefore = await totalBalance(
      organizationId,
      endUserId,
      def.id,
    );

    if (quantityBefore < quantity) {
      throw new ItemInsufficientBalance(def.id, quantity, quantityBefore);
    }

    if (!def.stackable) {
      // Non-stackable: delete `quantity` rows (newest first)
      const rows = await db
        .select({ id: itemInventories.id })
        .from(itemInventories)
        .where(
          and(
            eq(itemInventories.organizationId, organizationId),
            eq(itemInventories.endUserId, endUserId),
            eq(itemInventories.definitionId, def.id),
          ),
        )
        .orderBy(desc(itemInventories.createdAt))
        .limit(quantity);

      for (const row of rows) {
        await db
          .delete(itemInventories)
          .where(eq(itemInventories.id, row.id));
      }
    } else if (def.stackLimit === null) {
      // Unlimited stack: atomic decrement with balance check
      const updated = await db
        .update(itemInventories)
        .set({
          quantity: sql`${itemInventories.quantity} - ${quantity}`,
          version: sql`${itemInventories.version} + 1`,
        })
        .where(
          and(
            eq(itemInventories.organizationId, organizationId),
            eq(itemInventories.endUserId, endUserId),
            eq(itemInventories.definitionId, def.id),
            eq(itemInventories.isSingleton, true),
            sql`${itemInventories.quantity} >= ${quantity}`,
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new ItemConcurrencyConflict();
      }
    } else {
      // Limited stack: drain from last stack first
      let remaining = quantity;

      const stacks = await db
        .select()
        .from(itemInventories)
        .where(
          and(
            eq(itemInventories.organizationId, organizationId),
            eq(itemInventories.endUserId, endUserId),
            eq(itemInventories.definitionId, def.id),
          ),
        )
        .orderBy(desc(itemInventories.createdAt));

      for (const stack of stacks) {
        if (remaining <= 0) break;
        const drain = Math.min(stack.quantity, remaining);

        if (drain === stack.quantity) {
          // Empty the stack — delete it
          await db
            .delete(itemInventories)
            .where(
              and(
                eq(itemInventories.id, stack.id),
                eq(itemInventories.version, stack.version),
              ),
            );
        } else {
          const updated = await db
            .update(itemInventories)
            .set({
              quantity: sql`${itemInventories.quantity} - ${drain}`,
              version: sql`${itemInventories.version} + 1`,
            })
            .where(
              and(
                eq(itemInventories.id, stack.id),
                eq(itemInventories.version, stack.version),
              ),
            )
            .returning();

          if (updated.length === 0) {
            throw new ItemConcurrencyConflict();
          }
        }
        remaining -= drain;
      }

      if (remaining > 0) {
        throw new ItemConcurrencyConflict();
      }
    }

    const quantityAfter = quantityBefore - quantity;
    return { quantityBefore, quantityAfter };
  }

  return {
    // ─── Category CRUD ──────────────────────────────────────────

    async createCategory(
      organizationId: string,
      input: CreateCategoryInput,
    ): Promise<ItemCategory> {
      try {
        const [row] = await db
          .insert(itemCategories)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            icon: input.icon ?? null,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new ItemCategoryAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateCategory(
      organizationId: string,
      id: string,
      patch: UpdateCategoryInput,
    ): Promise<ItemCategory> {
      const existing = await loadCategoryByKey(organizationId, id);
      const updateValues: Partial<typeof itemCategories.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.sortOrder !== undefined) updateValues.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(itemCategories)
          .set(updateValues)
          .where(
            and(
              eq(itemCategories.id, existing.id),
              eq(itemCategories.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new ItemCategoryNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new ItemCategoryAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteCategory(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(itemCategories)
        .where(
          and(
            eq(itemCategories.id, id),
            eq(itemCategories.organizationId, organizationId),
          ),
        )
        .returning({ id: itemCategories.id });
      if (deleted.length === 0) throw new ItemCategoryNotFound(id);
    },

    async listCategories(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<ItemCategory>> {
      const limit = clampLimit(params.limit);
      const conditions: SQL[] = [eq(itemCategories.organizationId, organizationId)];
      const seek = cursorWhere(
        params.cursor,
        itemCategories.createdAt,
        itemCategories.id,
      );
      if (seek) conditions.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(itemCategories.name, pat), ilike(itemCategories.alias, pat));
        if (search) conditions.push(search);
      }
      const rows = await db
        .select()
        .from(itemCategories)
        .where(and(...conditions))
        .orderBy(desc(itemCategories.createdAt), desc(itemCategories.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getCategory(
      organizationId: string,
      idOrAlias: string,
    ): Promise<ItemCategory> {
      return loadCategoryByKey(organizationId, idOrAlias);
    },

    // ─── Definition CRUD ────────────────────────────────────────

    async createDefinition(
      organizationId: string,
      input: CreateDefinitionInput,
    ): Promise<ItemDefinition> {
      if (!input.stackable && input.stackLimit != null) {
        throw new ItemInvalidInput(
          "stackLimit is not applicable for non-stackable items",
        );
      }

      try {
        const [row] = await db
          .insert(itemDefinitions)
          .values({
            organizationId,
            categoryId: input.categoryId ?? null,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            icon: input.icon ?? null,
            stackable: input.stackable ?? true,
            stackLimit: input.stackLimit ?? null,
            holdLimit: input.holdLimit ?? null,
            isActive: input.isActive ?? true,
            activityId: input.activityId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new ItemDefinitionAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateDefinition(
      organizationId: string,
      id: string,
      patch: UpdateDefinitionInput,
    ): Promise<ItemDefinition> {
      const existing = await loadDefinitionByKey(organizationId, id);
      const updateValues: Partial<typeof itemDefinitions.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.categoryId !== undefined) updateValues.categoryId = patch.categoryId;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.stackable !== undefined) updateValues.stackable = patch.stackable;
      if (patch.stackLimit !== undefined) updateValues.stackLimit = patch.stackLimit;
      if (patch.holdLimit !== undefined) updateValues.holdLimit = patch.holdLimit;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.activityId !== undefined)
        updateValues.activityId = patch.activityId;
      if (patch.activityNodeId !== undefined)
        updateValues.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(itemDefinitions)
          .set(updateValues)
          .where(
            and(
              eq(itemDefinitions.id, existing.id),
              eq(itemDefinitions.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new ItemDefinitionNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new ItemDefinitionAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteDefinition(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(itemDefinitions)
        .where(
          and(
            eq(itemDefinitions.id, id),
            eq(itemDefinitions.organizationId, organizationId),
          ),
        )
        .returning({ id: itemDefinitions.id });
      if (deleted.length === 0) throw new ItemDefinitionNotFound(id);
    },

    async listDefinitions(
      organizationId: string,
      opts: PageParams & { categoryId?: string; activityId?: string | null } = {},
    ): Promise<Page<ItemDefinition>> {
      const limit = clampLimit(opts.limit);
      // Routes pass the parsed query through as `Record<string, unknown>`;
      // legacy callers may still pass `activityId: null` to mean
      // "permanent only". Normalise so the DSL sees the canonical
      // "null" sentinel string.
      const filterInput = {
        ...opts,
        activityId:
          opts.activityId === null
            ? "null"
            : opts.activityId === undefined
              ? undefined
              : opts.activityId,
      } as Record<string, unknown>;
      const where = and(
        eq(itemDefinitions.organizationId, organizationId),
        itemDefinitionFilters.where(filterInput),
        cursorWhere(
          opts.cursor,
          itemDefinitions.createdAt,
          itemDefinitions.id,
        ),
      );
      const rows = await db
        .select()
        .from(itemDefinitions)
        .where(where)
        .orderBy(desc(itemDefinitions.createdAt), desc(itemDefinitions.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getDefinition(
      organizationId: string,
      idOrAlias: string,
    ): Promise<ItemDefinition> {
      return loadDefinitionByKey(organizationId, idOrAlias);
    },

    // ─── Inventory operations ───────────────────────────────────

    /**
     * Grant items to a user — the unified reward center entry point.
     *
     * Handles all stacking logic internally. Each grant entry is processed
     * sequentially (order matters for hold-limit checks). A grant log entry
     * is written for each definition.
     */
    async grantItems(params: {
      organizationId: string;
      endUserId: string;
      grants: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
      source: string;
      sourceId?: string;
    }): Promise<GrantResult> {
      const results: GrantResult["grants"] = [];

      for (const raw of params.grants) {
        // Support both RewardEntry { id, count } and legacy { definitionId, quantity }
        const definitionId = "id" in raw ? raw.id : raw.definitionId;
        const quantity = "count" in raw ? raw.count : raw.quantity;

        if (quantity <= 0) {
          throw new ItemInvalidInput("grant quantity must be positive");
        }
        const def = await loadDefinitionByKey(
          params.organizationId,
          definitionId,
        );

        const { quantityBefore, quantityAfter } = await grantSingleItem(
          params.organizationId,
          params.endUserId,
          def,
          quantity,
        );

        // Write grant log
        await db.insert(itemGrantLogs).values({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          definitionId: def.id,
          delta: quantity,
          source: params.source,
          sourceId: params.sourceId ?? null,
          quantityBefore,
          quantityAfter,
        });

        results.push({
          definitionId: def.id,
          quantityBefore,
          quantityAfter,
          delta: quantity,
        });
      }

      // Fire the post-grant hook (collection unlocks, future behavior
      // log, etc.). Swallow failures — the hook must never break the
      // main grant path.
      if (grantHook) {
        try {
          await grantHook(params);
        } catch (err) {
           
          logger.error("[item] grant hook failed", { err, source: params.source });
        }
      }

      return { grants: results };
    },

    /**
     * Register a post-grant hook. Called by the collection module
     * during its barrel init to wire up unlock propagation.
     */
    setGrantHook(fn: GrantHook): void {
      grantHook = fn;
    },

    /**
     * Deduct items from a user.
     *
     * Throws ItemInsufficientBalance if the user doesn't have enough.
     * Throws ItemConcurrencyConflict if a concurrent modification is detected.
     */
    async deductItems(params: {
      organizationId: string;
      endUserId: string;
      deductions: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
      source: string;
      sourceId?: string;
    }): Promise<DeductResult> {
      const results: DeductResult["deductions"] = [];

      for (const raw of params.deductions) {
        // Support both RewardEntry { id, count } and legacy { definitionId, quantity }
        const definitionId = "id" in raw ? raw.id : raw.definitionId;
        const quantity = "count" in raw ? raw.count : raw.quantity;

        if (quantity <= 0) {
          throw new ItemInvalidInput("deduction quantity must be positive");
        }
        const def = await loadDefinitionByKey(
          params.organizationId,
          definitionId,
        );

        const { quantityBefore, quantityAfter } = await deductSingleItem(
          params.organizationId,
          params.endUserId,
          def,
          quantity,
        );

        // Write grant log (negative delta)
        await db.insert(itemGrantLogs).values({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          definitionId: def.id,
          delta: -quantity,
          source: params.source,
          sourceId: params.sourceId ?? null,
          quantityBefore,
          quantityAfter,
        });

        results.push({
          definitionId: def.id,
          quantityBefore,
          quantityAfter,
          delta: -quantity,
        });
      }

      return { deductions: results };
    },

    /**
     * Get a user's inventory, optionally filtered by definition.
     * Groups stacks by definition for a clean view.
     */
    async getInventory(params: {
      organizationId: string;
      endUserId: string;
      definitionId?: string;
    }): Promise<InventoryView[]> {
      const conditions = [
        eq(itemInventories.organizationId, params.organizationId),
        eq(itemInventories.endUserId, params.endUserId),
      ];
      if (params.definitionId) {
        conditions.push(eq(itemInventories.definitionId, params.definitionId));
      }

      const rows = await db
        .select({
          inventory: itemInventories,
          defAlias: itemDefinitions.alias,
          defName: itemDefinitions.name,
          defIcon: itemDefinitions.icon,
          defStackable: itemDefinitions.stackable,
        })
        .from(itemInventories)
        .innerJoin(
          itemDefinitions,
          eq(itemInventories.definitionId, itemDefinitions.id),
        )
        .where(and(...conditions))
        .orderBy(itemDefinitions.name, itemInventories.createdAt);

      // Group by definition
      const grouped = new Map<string, InventoryView>();
      for (const row of rows) {
        const defId = row.inventory.definitionId;
        let view = grouped.get(defId);
        if (!view) {
          view = {
            definitionId: defId,
            definitionAlias: row.defAlias,
            definitionName: row.defName,
            icon: row.defIcon,
            stackable: row.defStackable,
            totalQuantity: 0,
            stacks: [],
          };
          grouped.set(defId, view);
        }
        view.totalQuantity += row.inventory.quantity;
        view.stacks.push({
          id: row.inventory.id,
          quantity: row.inventory.quantity,
          instanceData: row.inventory.instanceData ?? null,
        });
      }

      return Array.from(grouped.values());
    },

    /**
     * Get total balance for a specific item type.
     */
    async getBalance(params: {
      organizationId: string;
      endUserId: string;
      definitionId: string;
    }): Promise<number> {
      return totalBalance(
        params.organizationId,
        params.endUserId,
        params.definitionId,
      );
    },
  };
}

export type ItemService = ReturnType<typeof createItemService>;

