/**
 * Currency service — protocol-agnostic business logic for the unified
 * currency subsystem (definitions + wallets + ledger).
 *
 * This file MUST NOT import Hono or any HTTP concepts, and MUST NOT
 * import the concrete `db` instance — it only receives its deps via
 * the `Pick<AppDeps, "db">` factory parameter.
 *
 * Key design decisions:
 *
 * 1. `currency_wallets` has a unique index on
 *    `(organizationId, endUserId, currencyId)`. Grants use
 *    `INSERT ... ON CONFLICT DO UPDATE` so a single atomic SQL
 *    statement handles both "new wallet" and "existing wallet" cases
 *    — required because neon-http does not support transactions.
 *
 * 2. Deducts use a conditional `UPDATE ... WHERE balance >= amount`.
 *    The SQL returns zero rows when the user cannot afford it; the
 *    service translates that into `CurrencyInsufficientBalance`.
 *
 * 3. `version` is an optimistic-concurrency counter mirroring
 *    `item_inventories.version`. Bumped on every mutation; callers
 *    needing compare-and-set semantics can extend the `WHERE`.
 */

import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  currencies,
  currencyLedger,
  currencyWallets,
} from "../../schema/currency";
import {
  CurrencyAliasConflict,
  CurrencyInsufficientBalance,
  CurrencyInvalidInput,
  CurrencyNotFound,
} from "./errors";
import type {
  CurrencyDefinition,
  CurrencyDeductResult,
  CurrencyGrantResult,
  CurrencyLedgerEntry,
  LedgerPage,
  LedgerQuery,
  WalletView,
} from "./types";
import {
  currencyDefinitionFilters,
  type CreateCurrencyInput,
  type UpdateCurrencyInput,
} from "./validators";

type CurrencyDeps = Pick<AppDeps, "db">;

export function createCurrencyService(d: CurrencyDeps) {
  const { db } = d;

  // ─── Definition helpers ─────────────────────────────────────────

  async function loadByKey(
    organizationId: string,
    key: string,
  ): Promise<CurrencyDefinition> {
    const where = looksLikeId(key)
      ? and(
          eq(currencies.organizationId, organizationId),
          eq(currencies.id, key),
        )
      : and(
          eq(currencies.organizationId, organizationId),
          eq(currencies.alias, key),
        );
    const rows = await db.select().from(currencies).where(where).limit(1);
    if (!rows[0]) throw new CurrencyNotFound(key);
    return rows[0];
  }

  async function readBalance(
    organizationId: string,
    endUserId: string,
    currencyId: string,
  ): Promise<number> {
    const [row] = await db
      .select({ balance: currencyWallets.balance })
      .from(currencyWallets)
      .where(
        and(
          eq(currencyWallets.organizationId, organizationId),
          eq(currencyWallets.endUserId, endUserId),
          eq(currencyWallets.currencyId, currencyId),
        ),
      )
      .limit(1);
    return row?.balance ?? 0;
  }

  return {
    // ─── Definition CRUD ──────────────────────────────────────────

    async createDefinition(
      organizationId: string,
      input: CreateCurrencyInput,
    ): Promise<CurrencyDefinition> {
      try {
        const [row] = await db
          .insert(currencies)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            icon: input.icon ?? null,
            sortOrder: input.sortOrder ?? 0,
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
          throw new CurrencyAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateDefinition(
      organizationId: string,
      id: string,
      patch: UpdateCurrencyInput,
    ): Promise<CurrencyDefinition> {
      const existing = await loadByKey(organizationId, id);
      const updateValues: Partial<typeof currencies.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.sortOrder !== undefined)
        updateValues.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.activityId !== undefined)
        updateValues.activityId = patch.activityId;
      if (patch.activityNodeId !== undefined)
        updateValues.activityNodeId = patch.activityNodeId;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(currencies)
          .set(updateValues)
          .where(
            and(
              eq(currencies.id, existing.id),
              eq(currencies.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new CurrencyNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new CurrencyAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteDefinition(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(currencies)
        .where(
          and(
            eq(currencies.id, id),
            eq(currencies.organizationId, organizationId),
          ),
        )
        .returning({ id: currencies.id });
      if (deleted.length === 0) throw new CurrencyNotFound(id);
    },

    async listDefinitions(
      organizationId: string,
      opts: PageParams & { activityId?: string | null; isActive?: boolean } = {},
    ): Promise<Page<CurrencyDefinition>> {
      const limit = clampLimit(opts.limit);
      // Normalise legacy `activityId: null` callers to the DSL's
      // canonical "null" sentinel so the same WHERE branch fires.
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
        eq(currencies.organizationId, organizationId),
        currencyDefinitionFilters.where(filterInput),
        cursorWhere(opts.cursor, currencies.createdAt, currencies.id),
      );
      const rows = await db
        .select()
        .from(currencies)
        .where(where)
        .orderBy(desc(currencies.createdAt), desc(currencies.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getDefinition(
      organizationId: string,
      idOrAlias: string,
    ): Promise<CurrencyDefinition> {
      return loadByKey(organizationId, idOrAlias);
    },

    // ─── Wallet & balance ────────────────────────────────────────

    async getBalance(
      organizationId: string,
      endUserId: string,
      currencyId: string,
    ): Promise<number> {
      return readBalance(organizationId, endUserId, currencyId);
    },

    async getWallets(
      organizationId: string,
      endUserId: string,
    ): Promise<WalletView[]> {
      const rows = await db
        .select({
          currencyId: currencyWallets.currencyId,
          balance: currencyWallets.balance,
          currencyName: currencies.name,
          currencyAlias: currencies.alias,
          icon: currencies.icon,
        })
        .from(currencyWallets)
        .innerJoin(currencies, eq(currencies.id, currencyWallets.currencyId))
        .where(
          and(
            eq(currencyWallets.organizationId, organizationId),
            eq(currencyWallets.endUserId, endUserId),
          ),
        )
        .orderBy(desc(currencies.sortOrder), desc(currencies.createdAt));

      return rows.map((r) => ({
        currencyId: r.currencyId,
        currencyAlias: r.currencyAlias,
        currencyName: r.currencyName,
        icon: r.icon,
        balance: r.balance,
      }));
    },

    // ─── Grant / Deduct ──────────────────────────────────────────

    async grant(params: {
      organizationId: string;
      endUserId: string;
      grants: Array<{ currencyId: string; amount: number }>;
      source: string;
      sourceId?: string;
    }): Promise<CurrencyGrantResult> {
      const results: CurrencyGrantResult["grants"] = [];

      for (const g of params.grants) {
        if (g.amount <= 0) {
          throw new CurrencyInvalidInput("grant amount must be positive");
        }
        // Existence check (throws if the currency id is unknown in this org).
        const def = await loadByKey(params.organizationId, g.currencyId);

        const before = await readBalance(
          params.organizationId,
          params.endUserId,
          def.id,
        );

        // Single atomic upsert — ON CONFLICT DO UPDATE relies on the unique
        // index (org, user, currencyId).
        await db
          .insert(currencyWallets)
          .values({
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            currencyId: def.id,
            balance: g.amount,
            version: 1,
          })
          .onConflictDoUpdate({
            target: [
              currencyWallets.organizationId,
              currencyWallets.endUserId,
              currencyWallets.currencyId,
            ],
            set: {
              balance: sql`${currencyWallets.balance} + ${g.amount}`,
              version: sql`${currencyWallets.version} + 1`,
              updatedAt: sql`now()`,
            },
          });

        const after = before + g.amount;

        await db.insert(currencyLedger).values({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          currencyId: def.id,
          delta: g.amount,
          source: params.source,
          sourceId: params.sourceId ?? null,
          balanceBefore: before,
          balanceAfter: after,
        });

        results.push({
          currencyId: def.id,
          balanceBefore: before,
          balanceAfter: after,
          delta: g.amount,
        });
      }

      return { grants: results };
    },

    async deduct(params: {
      organizationId: string;
      endUserId: string;
      deductions: Array<{ currencyId: string; amount: number }>;
      source: string;
      sourceId?: string;
    }): Promise<CurrencyDeductResult> {
      const results: CurrencyDeductResult["deductions"] = [];

      for (const d of params.deductions) {
        if (d.amount <= 0) {
          throw new CurrencyInvalidInput("deduct amount must be positive");
        }
        const def = await loadByKey(params.organizationId, d.currencyId);

        const before = await readBalance(
          params.organizationId,
          params.endUserId,
          def.id,
        );

        // Conditional UPDATE: the balance >= amount predicate is what makes
        // overdrafts impossible under concurrency — losers get 0 rows and
        // take the insufficient-balance branch.
        const updated = await db
          .update(currencyWallets)
          .set({
            balance: sql`${currencyWallets.balance} - ${d.amount}`,
            version: sql`${currencyWallets.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(currencyWallets.organizationId, params.organizationId),
              eq(currencyWallets.endUserId, params.endUserId),
              eq(currencyWallets.currencyId, def.id),
              gte(currencyWallets.balance, d.amount),
            ),
          )
          .returning({ balance: currencyWallets.balance });

        if (updated.length === 0) {
          throw new CurrencyInsufficientBalance(def.id, d.amount, before);
        }

        const after = updated[0]!.balance;

        await db.insert(currencyLedger).values({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          currencyId: def.id,
          delta: -d.amount,
          source: params.source,
          sourceId: params.sourceId ?? null,
          balanceBefore: before,
          balanceAfter: after,
        });

        results.push({
          currencyId: def.id,
          balanceBefore: before,
          balanceAfter: after,
          delta: -d.amount,
        });
      }

      return { deductions: results };
    },

    // ─── Ledger query ────────────────────────────────────────────

    async listLedger(
      organizationId: string,
      filter: LedgerQuery = {},
    ): Promise<LedgerPage> {
      const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
      const conditions = [eq(currencyLedger.organizationId, organizationId)];
      if (filter.endUserId)
        conditions.push(eq(currencyLedger.endUserId, filter.endUserId));
      if (filter.currencyId)
        conditions.push(eq(currencyLedger.currencyId, filter.currencyId));
      if (filter.source)
        conditions.push(eq(currencyLedger.source, filter.source));
      if (filter.sourceId)
        conditions.push(eq(currencyLedger.sourceId, filter.sourceId));
      if (filter.cursor) {
        // Cursor is the createdAt ISO string of the last row seen; we page
        // by "strictly older than cursor" because the ordering is desc.
        conditions.push(lt(currencyLedger.createdAt, new Date(filter.cursor)));
      }

      const items: CurrencyLedgerEntry[] = await db
        .select()
        .from(currencyLedger)
        .where(and(...conditions))
        .orderBy(desc(currencyLedger.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore
        ? page[page.length - 1]!.createdAt.toISOString()
        : undefined;

      return { items: page, nextCursor };
    },

    // ─── Convenience: batch existence check for other modules ────

    async assertAllExist(
      organizationId: string,
      currencyIds: string[],
    ): Promise<void> {
      if (currencyIds.length === 0) return;
      const unique = Array.from(new Set(currencyIds));
      const rows = await db
        .select({ id: currencies.id })
        .from(currencies)
        .where(
          and(
            eq(currencies.organizationId, organizationId),
            inArray(currencies.id, unique),
          ),
        );
      const found = new Set(rows.map((r) => r.id));
      for (const id of unique) {
        if (!found.has(id)) throw new CurrencyNotFound(id);
      }
    },
  };
}

export type CurrencyService = ReturnType<typeof createCurrencyService>;
