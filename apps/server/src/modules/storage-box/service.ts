/**
 * Storage-box service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Key design decisions:
 *
 * 1. All currency movement delegates to itemService.grantItems /
 *    deductItems. Item inventories + item_grant_logs remain the single
 *    source of truth for "how many coins does this user hold". The
 *    storage-box tables only hold deposit-specific state (principal,
 *    accrued interest, maturity).
 *
 * 2. Interest is simple (non-compounding), projected lazily from
 *    `lastAccrualAt` → `now` whenever a row is read or mutated. No cron.
 *
 * 3. Demand deposits merge into a single row per (org, user, box,
 *    currency) via a partial unique index + ON CONFLICT DO UPDATE.
 *    Fixed-term deposits are one row per deposit.
 *
 * 4. A deposit requires two writes: (a) itemService.deductItems (atomic),
 *    (b) upsert the deposit row. If (b) fails after (a) succeeds, currency
 *    is stranded. We do not wrap them in `db.transaction()` because that
 *    would pin a Hyperdrive pooled connection across the deduct fan-out.
 *    Mitigation: the caller supplies an `idempotencyKey` which is passed
 *    to itemService as `sourceId` so reconciliation can detect this case
 *    by looking for deducts without matching storage_box_logs. This is
 *    the same trade-off exchange.ts documents.
 *
 * 5. All reads that return a deposit to callers project live interest
 *    WITHOUT writing back — `projectedInterest` is computed from
 *    `accruedInterest + projectInterest(...)`.
 */

import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

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
import { getTraceId } from "../../lib/request-context";
import { currencies } from "../../schema/currency";
import {
  storageBoxConfigs,
  storageBoxDeposits,
  storageBoxLogs,
} from "../../schema/storage-box";
import type { CurrencyService } from "../currency";
import {
  StorageBoxAliasConflict,
  StorageBoxConcurrencyConflict,
  StorageBoxConfigInactive,
  StorageBoxConfigNotFound,
  StorageBoxCurrencyNotAccepted,
  StorageBoxDepositNotFound,
  StorageBoxDepositOutOfRange,
  StorageBoxInsufficientBalance,
  StorageBoxInvalidCurrency,
  StorageBoxInvalidInput,
  StorageBoxLockupNotMatured,
} from "./errors";
import { projectInterest } from "./interest";
import type {
  DepositResult,
  StorageBoxConfig,
  StorageBoxDeposit,
  StorageBoxDepositView,
  WithdrawResult,
} from "./types";
import type {
  CreateConfigInput,
  DepositInput,
  UpdateConfigInput,
  WithdrawInput,
} from "./validators";

// `analytics` optional — used to write pure observational events
// (`storage_box.deposited` / `storage_box.withdrawn`) direct-to-writer,
// bypassing event-bus because no business module consumes them.
type StorageBoxDeps = Pick<AppDeps, "db"> &
  Partial<Pick<AppDeps, "analytics">>;

function toView(
  row: StorageBoxDeposit,
  rateBps: number,
  periodDays: number,
  now: Date,
): StorageBoxDepositView {
  const extra = projectInterest(
    row.principal,
    rateBps,
    periodDays,
    row.lastAccrualAt,
    now,
  );
  return {
    ...row,
    projectedInterest: row.accruedInterest + extra,
    isMatured: row.maturesAt != null && row.maturesAt.getTime() <= now.getTime(),
  };
}

export function createStorageBoxService(
  d: StorageBoxDeps,
  currencySvc: CurrencyService,
) {
  const { db, analytics } = d;

  async function loadConfigByKey(
    organizationId: string,
    key: string,
  ): Promise<StorageBoxConfig> {
    const where = looksLikeId(key)
      ? and(
          eq(storageBoxConfigs.organizationId, organizationId),
          eq(storageBoxConfigs.id, key),
        )
      : and(
          eq(storageBoxConfigs.organizationId, organizationId),
          eq(storageBoxConfigs.alias, key),
        );
    const rows = await db
      .select()
      .from(storageBoxConfigs)
      .where(where)
      .limit(1);
    if (!rows[0]) throw new StorageBoxConfigNotFound(key);
    return rows[0];
  }

  async function validateAcceptedCurrencies(
    organizationId: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) {
      throw new StorageBoxInvalidInput("acceptedCurrencyIds must not be empty");
    }
    const uniqueIds = Array.from(new Set(ids));
    // Every id must resolve to a row in the dedicated `currencies` table
    // (items are no longer a currency carrier).
    const rows = await db
      .select({ id: currencies.id })
      .from(currencies)
      .where(
        and(
          eq(currencies.organizationId, organizationId),
          inArray(currencies.id, uniqueIds),
        ),
      );
    const found = new Set(rows.map((r) => r.id));
    for (const id of uniqueIds) {
      if (!found.has(id)) {
        throw new StorageBoxInvalidCurrency(id);
      }
    }
  }

  function validateFixedConfigInput(
    type: "demand" | "fixed" | undefined,
    lockupDays: number | null | undefined,
  ): void {
    if (type === "fixed" && (lockupDays == null || lockupDays <= 0)) {
      throw new StorageBoxInvalidInput(
        "lockupDays is required and must be positive for fixed-term boxes",
      );
    }
  }

  function validateDepositAmount(
    config: StorageBoxConfig,
    amount: number,
  ): void {
    if (config.minDeposit != null && amount < config.minDeposit) {
      throw new StorageBoxDepositOutOfRange(
        `amount ${amount} is below minDeposit ${config.minDeposit}`,
      );
    }
    if (config.maxDeposit != null && amount > config.maxDeposit) {
      throw new StorageBoxDepositOutOfRange(
        `amount ${amount} exceeds maxDeposit ${config.maxDeposit}`,
      );
    }
  }

  return {
    // ─── Config CRUD ──────────────────────────────────────────────

    async createConfig(
      organizationId: string,
      input: CreateConfigInput,
    ): Promise<StorageBoxConfig> {
      validateFixedConfigInput(input.type, input.lockupDays ?? null);
      await validateAcceptedCurrencies(organizationId, input.acceptedCurrencyIds);

      try {
        const [row] = await db
          .insert(storageBoxConfigs)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            icon: input.icon ?? null,
            type: input.type,
            lockupDays: input.type === "fixed" ? (input.lockupDays ?? null) : null,
            interestRateBps: input.interestRateBps ?? 0,
            interestPeriodDays: input.interestPeriodDays ?? 365,
            acceptedCurrencyIds: input.acceptedCurrencyIds,
            minDeposit: input.minDeposit ?? null,
            maxDeposit: input.maxDeposit ?? null,
            allowEarlyWithdraw: input.allowEarlyWithdraw ?? false,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new StorageBoxAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateConfig(
      organizationId: string,
      id: string,
      patch: UpdateConfigInput,
    ): Promise<StorageBoxConfig> {
      const existing = await loadConfigByKey(organizationId, id);

      const nextType = patch.type ?? existing.type;
      const nextLockup =
        patch.lockupDays !== undefined ? patch.lockupDays : existing.lockupDays;
      validateFixedConfigInput(
        nextType as "demand" | "fixed",
        nextLockup ?? null,
      );

      if (patch.acceptedCurrencyIds !== undefined) {
        await validateAcceptedCurrencies(
          organizationId,
          patch.acceptedCurrencyIds,
        );
      }

      const updateValues: Partial<typeof storageBoxConfigs.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.type !== undefined) updateValues.type = patch.type;
      if (patch.lockupDays !== undefined)
        updateValues.lockupDays = patch.lockupDays;
      if (patch.interestRateBps !== undefined)
        updateValues.interestRateBps = patch.interestRateBps;
      if (patch.interestPeriodDays !== undefined)
        updateValues.interestPeriodDays = patch.interestPeriodDays;
      if (patch.acceptedCurrencyIds !== undefined)
        updateValues.acceptedCurrencyIds = patch.acceptedCurrencyIds;
      if (patch.minDeposit !== undefined)
        updateValues.minDeposit = patch.minDeposit;
      if (patch.maxDeposit !== undefined)
        updateValues.maxDeposit = patch.maxDeposit;
      if (patch.allowEarlyWithdraw !== undefined)
        updateValues.allowEarlyWithdraw = patch.allowEarlyWithdraw;
      if (patch.sortOrder !== undefined)
        updateValues.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) return existing;

      try {
        const [row] = await db
          .update(storageBoxConfigs)
          .set(updateValues)
          .where(
            and(
              eq(storageBoxConfigs.id, existing.id),
              eq(storageBoxConfigs.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new StorageBoxConfigNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new StorageBoxAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteConfig(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(storageBoxConfigs)
        .where(
          and(
            eq(storageBoxConfigs.id, id),
            eq(storageBoxConfigs.organizationId, organizationId),
          ),
        )
        .returning({ id: storageBoxConfigs.id });
      if (deleted.length === 0) throw new StorageBoxConfigNotFound(id);
    },

    async listConfigs(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<StorageBoxConfig>> {
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(storageBoxConfigs.organizationId, organizationId)];
      const seek = cursorWhere(params.cursor, storageBoxConfigs.createdAt, storageBoxConfigs.id);
      if (seek) conds.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(storageBoxConfigs.name, pat), ilike(storageBoxConfigs.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(storageBoxConfigs)
        .where(and(...conds))
        .orderBy(desc(storageBoxConfigs.createdAt), desc(storageBoxConfigs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getConfig(
      organizationId: string,
      idOrAlias: string,
    ): Promise<StorageBoxConfig> {
      return loadConfigByKey(organizationId, idOrAlias);
    },

    // ─── Deposit / Withdraw ────────────────────────────────────────

    async deposit(params: {
      organizationId: string;
      input: DepositInput;
      now?: Date;
    }): Promise<DepositResult> {
      const now = params.now ?? new Date();
      const { organizationId, input } = params;
      const config = await loadConfigByKey(organizationId, input.boxConfigId);
      if (!config.isActive) throw new StorageBoxConfigInactive(config.id);
      if (!config.acceptedCurrencyIds.includes(input.currencyDefinitionId)) {
        throw new StorageBoxCurrencyNotAccepted(
          input.currencyDefinitionId,
          config.id,
        );
      }
      validateDepositAmount(config, input.amount);

      // Step 1: deduct currency from user's wallet. Idempotency key
      // flows to currency_ledger.source_id.
      const idempotencyKey =
        input.idempotencyKey ?? `storage-box-deposit:${crypto.randomUUID()}`;
      await currencySvc.deduct({
        organizationId,
        endUserId: input.endUserId,
        deductions: [
          { currencyId: input.currencyDefinitionId, amount: input.amount },
        ],
        source: "storage-box-deposit",
        sourceId: idempotencyKey,
      });

      // Step 2: insert / update deposit row.
      let deposit: StorageBoxDeposit;
      if (config.type === "demand") {
        // Merge into the single active demand row if it exists, else
        // insert a fresh one. Two statements instead of ON CONFLICT
        // DO UPDATE so we can project interest in JS and keep optimistic
        // locking via `version`.
        const existing = await db
          .select()
          .from(storageBoxDeposits)
          .where(
            and(
              eq(storageBoxDeposits.organizationId, organizationId),
              eq(storageBoxDeposits.endUserId, input.endUserId),
              eq(storageBoxDeposits.boxConfigId, config.id),
              eq(
                storageBoxDeposits.currencyDefinitionId,
                input.currencyDefinitionId,
              ),
              eq(storageBoxDeposits.isSingleton, true),
              eq(storageBoxDeposits.status, "active"),
            ),
          )
          .limit(1);

        if (existing[0]) {
          const prev = existing[0];
          const flushedInterest =
            prev.accruedInterest +
            projectInterest(
              prev.principal,
              config.interestRateBps,
              config.interestPeriodDays,
              prev.lastAccrualAt,
              now,
            );
          const updated = await db
            .update(storageBoxDeposits)
            .set({
              principal: prev.principal + input.amount,
              accruedInterest: flushedInterest,
              lastAccrualAt: now,
              version: sql`${storageBoxDeposits.version} + 1`,
            })
            .where(
              and(
                eq(storageBoxDeposits.id, prev.id),
                eq(storageBoxDeposits.version, prev.version),
              ),
            )
            .returning();
          if (updated.length === 0) throw new StorageBoxConcurrencyConflict();
          deposit = updated[0]!;
        } else {
          try {
            const [row] = await db
              .insert(storageBoxDeposits)
              .values({
                organizationId,
                endUserId: input.endUserId,
                boxConfigId: config.id,
                currencyDefinitionId: input.currencyDefinitionId,
                principal: input.amount,
                accruedInterest: 0,
                status: "active",
                isSingleton: true,
                depositedAt: now,
                lastAccrualAt: now,
                maturesAt: null,
                version: 1,
              })
              .returning();
            if (!row) throw new Error("insert returned no row");
            deposit = row;
          } catch (err) {
            if (isUniqueViolation(err)) {
              throw new StorageBoxConcurrencyConflict();
            }
            throw err;
          }
        }
      } else {
        const lockupDays = config.lockupDays ?? 0;
        const maturesAt = new Date(
          now.getTime() + lockupDays * 24 * 60 * 60 * 1000,
        );
        const [row] = await db
          .insert(storageBoxDeposits)
          .values({
            organizationId,
            endUserId: input.endUserId,
            boxConfigId: config.id,
            currencyDefinitionId: input.currencyDefinitionId,
            principal: input.amount,
            accruedInterest: 0,
            status: "active",
            isSingleton: false,
            depositedAt: now,
            lastAccrualAt: now,
            maturesAt,
            version: 1,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        deposit = row;
      }

      // Step 3: audit log.
      await db.insert(storageBoxLogs).values({
        organizationId,
        endUserId: input.endUserId,
        depositId: deposit.id,
        boxConfigId: config.id,
        currencyDefinitionId: input.currencyDefinitionId,
        action: "deposit",
        principalDelta: input.amount,
        interestDelta: 0,
        principalAfter: deposit.principal,
        interestAfter: deposit.accruedInterest,
        metadata: { idempotencyKey },
      });

      if (analytics) {
        void analytics.writer.logEvent({
          ts: new Date(),
          orgId: organizationId,
          endUserId: input.endUserId,
          traceId: getTraceId(),
          event: "storage_box.deposited",
          source: "storage-box",
          amount: input.amount,
          eventData: {
            depositId: deposit.id,
            boxConfigId: config.id,
            currencyDefinitionId: input.currencyDefinitionId,
            principalAfter: deposit.principal,
          },
        });
      }

      return { deposit, currencyDeducted: input.amount };
    },

    async withdraw(params: {
      organizationId: string;
      input: WithdrawInput;
      now?: Date;
    }): Promise<WithdrawResult> {
      const now = params.now ?? new Date();
      const { organizationId, input } = params;

      // Locate the target deposit row.
      let deposit: StorageBoxDeposit;
      if (input.depositId) {
        const rows = await db
          .select()
          .from(storageBoxDeposits)
          .where(
            and(
              eq(storageBoxDeposits.organizationId, organizationId),
              eq(storageBoxDeposits.id, input.depositId),
              eq(storageBoxDeposits.endUserId, input.endUserId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new StorageBoxDepositNotFound(input.depositId);
        deposit = rows[0];
      } else {
        if (!input.boxConfigId || !input.currencyDefinitionId) {
          throw new StorageBoxInvalidInput(
            "either depositId or (boxConfigId + currencyDefinitionId) is required",
          );
        }
        const rows = await db
          .select()
          .from(storageBoxDeposits)
          .where(
            and(
              eq(storageBoxDeposits.organizationId, organizationId),
              eq(storageBoxDeposits.endUserId, input.endUserId),
              eq(storageBoxDeposits.boxConfigId, input.boxConfigId),
              eq(
                storageBoxDeposits.currencyDefinitionId,
                input.currencyDefinitionId,
              ),
              eq(storageBoxDeposits.isSingleton, true),
              eq(storageBoxDeposits.status, "active"),
            ),
          )
          .limit(1);
        if (!rows[0]) {
          throw new StorageBoxDepositNotFound(
            `${input.boxConfigId}/${input.currencyDefinitionId}`,
          );
        }
        deposit = rows[0];
      }

      if (deposit.status !== "active") {
        throw new StorageBoxDepositNotFound(deposit.id);
      }

      const config = await loadConfigByKey(organizationId, deposit.boxConfigId);

      // Compute interest up to `now` and decide payout.
      const newInterest = projectInterest(
        deposit.principal,
        config.interestRateBps,
        config.interestPeriodDays,
        deposit.lastAccrualAt,
        now,
      );
      let availableInterest = deposit.accruedInterest + newInterest;
      const matured =
        deposit.maturesAt == null ||
        deposit.maturesAt.getTime() <= now.getTime();

      if (config.type === "fixed" && !matured) {
        if (!config.allowEarlyWithdraw) {
          throw new StorageBoxLockupNotMatured(deposit.id);
        }
        // Early withdrawal: forfeit interest.
        availableInterest = 0;
      }

      // Fixed: always withdraw full principal; partial is not supported.
      // Demand: optional `amount` — omitted means "everything".
      let principalPaid: number;
      let interestPaid: number;
      let fullyWithdrawn: boolean;

      if (config.type === "fixed") {
        principalPaid = deposit.principal;
        interestPaid = availableInterest;
        fullyWithdrawn = true;
      } else {
        const requested = input.amount ?? deposit.principal + availableInterest;
        if (requested <= 0) {
          throw new StorageBoxInvalidInput("amount must be positive");
        }
        if (requested > deposit.principal + availableInterest) {
          throw new StorageBoxInsufficientBalance(deposit.id);
        }
        // Pay interest first, then principal.
        interestPaid = Math.min(availableInterest, requested);
        principalPaid = requested - interestPaid;
        fullyWithdrawn = requested === deposit.principal + availableInterest;
      }

      // Step 1: mutate the deposit row with optimistic locking.
      const nextPrincipal = deposit.principal - principalPaid;
      const nextInterest = availableInterest - interestPaid;
      const nextStatus = fullyWithdrawn ? "withdrawn" : "active";

      const updated = await db
        .update(storageBoxDeposits)
        .set({
          principal: nextPrincipal,
          accruedInterest: nextInterest,
          lastAccrualAt: now,
          status: nextStatus,
          withdrawnAt: fullyWithdrawn ? now : deposit.withdrawnAt,
          version: sql`${storageBoxDeposits.version} + 1`,
        })
        .where(
          and(
            eq(storageBoxDeposits.id, deposit.id),
            eq(storageBoxDeposits.version, deposit.version),
          ),
        )
        .returning();
      if (updated.length === 0) throw new StorageBoxConcurrencyConflict();
      const updatedDeposit = updated[0]!;

      // Step 2: return currency to user's wallet.
      const totalPayout = principalPaid + interestPaid;
      if (totalPayout > 0) {
        const grantKey =
          input.idempotencyKey ??
          `storage-box-withdraw:${deposit.id}:${now.getTime()}`;
        await currencySvc.grant({
          organizationId,
          endUserId: input.endUserId,
          grants: [
            {
              currencyId: deposit.currencyDefinitionId,
              amount: totalPayout,
            },
          ],
          source: "storage-box-withdraw",
          sourceId: grantKey,
        });
      }

      // Step 3: audit log.
      await db.insert(storageBoxLogs).values({
        organizationId,
        endUserId: input.endUserId,
        depositId: deposit.id,
        boxConfigId: config.id,
        currencyDefinitionId: deposit.currencyDefinitionId,
        action: "withdraw",
        principalDelta: -principalPaid,
        interestDelta: -interestPaid,
        principalAfter: updatedDeposit.principal,
        interestAfter: updatedDeposit.accruedInterest,
      });

      if (analytics) {
        void analytics.writer.logEvent({
          ts: new Date(),
          orgId: organizationId,
          endUserId: input.endUserId,
          traceId: getTraceId(),
          event: "storage_box.withdrawn",
          source: "storage-box",
          amount: totalPayout,
          eventData: {
            depositId: deposit.id,
            boxConfigId: config.id,
            currencyDefinitionId: deposit.currencyDefinitionId,
            principalPaid,
            interestPaid,
          },
        });
      }

      return {
        deposit: updatedDeposit,
        principalPaid,
        interestPaid,
        currencyGranted: totalPayout,
      };
    },

    async listDepositsForUser(params: {
      organizationId: string;
      endUserId: string;
      now?: Date;
    }): Promise<StorageBoxDepositView[]> {
      const now = params.now ?? new Date();
      const rows = await db
        .select({
          deposit: storageBoxDeposits,
          rateBps: storageBoxConfigs.interestRateBps,
          periodDays: storageBoxConfigs.interestPeriodDays,
        })
        .from(storageBoxDeposits)
        .innerJoin(
          storageBoxConfigs,
          eq(storageBoxDeposits.boxConfigId, storageBoxConfigs.id),
        )
        .where(
          and(
            eq(storageBoxDeposits.organizationId, params.organizationId),
            eq(storageBoxDeposits.endUserId, params.endUserId),
            eq(storageBoxDeposits.status, "active"),
          ),
        )
        .orderBy(desc(storageBoxDeposits.depositedAt));

      return rows.map((r) => toView(r.deposit, r.rateBps, r.periodDays, now));
    },

    async getDeposit(params: {
      organizationId: string;
      id: string;
      now?: Date;
    }): Promise<StorageBoxDepositView> {
      const now = params.now ?? new Date();
      const rows = await db
        .select({
          deposit: storageBoxDeposits,
          rateBps: storageBoxConfigs.interestRateBps,
          periodDays: storageBoxConfigs.interestPeriodDays,
        })
        .from(storageBoxDeposits)
        .innerJoin(
          storageBoxConfigs,
          eq(storageBoxDeposits.boxConfigId, storageBoxConfigs.id),
        )
        .where(
          and(
            eq(storageBoxDeposits.organizationId, params.organizationId),
            eq(storageBoxDeposits.id, params.id),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new StorageBoxDepositNotFound(params.id);
      return toView(rows[0].deposit, rows[0].rateBps, rows[0].periodDays, now);
    },
  };
}

export type StorageBoxService = ReturnType<typeof createStorageBoxService>;
