/**
 * CDKey service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono or any HTTP concepts.
 *
 * Cross-module dependency: the item service is injected at the factory so
 * rewards can be granted through the unified item grant pipeline.
 *
 * Redeem concurrency model (no transactions — neon-http limitation):
 *
 *   1. Write a pending row in cdkey_redemption_logs keyed by
 *      UNIQUE (organizationId, source, sourceId). If the insert conflicts,
 *      the request is a retry; return the cached result (success) or re-throw
 *      the failure reason.
 *   2. Load the (code, batch) pair via a single JOIN. Reject on invalid /
 *      revoked / not-started / expired / inactive / already-redeemed.
 *   3a. Universal: atomically increment batch.totalRedeemed under
 *       `totalRedeemed < totalLimit`, then atomically upsert
 *       cdkey_user_states under `count < per_user_limit`. Any 0-row result
 *       triggers a compensating rollback UPDATE.
 *   3b. Unique: atomically flip cdkey_codes.status pending → redeemed under
 *       `WHERE status = 'pending'`, then bump batch.totalRedeemed.
 *   4. Grant items via itemService.grantItems (itself idempotent on
 *      source+sourceId).
 *   5. Finalise the redemption log row with status='success' + reward snapshot.
 *
 * Failure paths write status='failed' to the log and, where applicable,
 * undo the counter/code-state step they applied. If step 4 fails *after*
 * step 3 succeeded we leave the batch/code state as "consumed" and mark
 * the log failed — this is consistent with the item grant log (which will
 * also be recorded idempotently); operator picks it up from failed logs.
 */

import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { getTraceId } from "../../lib/request-context";
import {
  generateCdkeyCode,
  isWellFormedCdkeyCode,
  normalizeCdkeyCode,
} from "../../lib/cdkey-code";
import {
  cdkeyBatches,
  cdkeyCodes,
  cdkeyRedemptionLogs,
  cdkeyUserStates,
} from "../../schema/cdkey";
import {
  CdkeyBatchAliasConflict,
  CdkeyBatchExpired,
  CdkeyBatchInactive,
  CdkeyBatchNotFound,
  CdkeyBatchNotStarted,
  CdkeyCodeAlreadyRedeemed,
  CdkeyCodeNotFound,
  CdkeyCodeRevoked,
  CdkeyGenerateCountExceeded,
  CdkeyInvalidCode,
  CdkeyInvalidInput,
  CdkeyTotalLimitReached,
  CdkeyUniversalCodeConflict,
  CdkeyUserLimitReached,
} from "./errors";
import type {
  CdkeyBatch,
  CdkeyCode,
  CdkeyRedeemResult,
  CdkeyRedemptionLog,
} from "./types";
import type { ItemService } from "../item";
import type {
  CreateBatchInput,
  GenerateCodesInput,
  UpdateBatchInput,
} from "./validators";

// `analytics` optional — used to emit the pure observational
// `cdkey.redeemed` event direct-to-writer (no business module consumes
// cdkey redemptions).
type CdkeyDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "analytics">>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_GENERATE_PER_REQUEST = 10_000;
const GENERATE_CHUNK_SIZE = 500;

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

function parseIsoDate(v: string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new CdkeyInvalidInput(`invalid date: ${v}`);
  return d;
}

function assertBatchWindow(batch: CdkeyBatch, now: Date): void {
  if (!batch.isActive) throw new CdkeyBatchInactive(batch.id);
  if (batch.startsAt && batch.startsAt > now)
    throw new CdkeyBatchNotStarted(batch.id);
  if (batch.endsAt && batch.endsAt <= now) throw new CdkeyBatchExpired(batch.id);
}

export function createCdkeyService(d: CdkeyDeps, itemSvc: ItemService) {
  const { db, analytics } = d;

  async function loadBatchByKey(
    organizationId: string,
    key: string,
  ): Promise<CdkeyBatch> {
    const where = looksLikeId(key)
      ? and(
          eq(cdkeyBatches.organizationId, organizationId),
          eq(cdkeyBatches.id, key),
        )
      : and(
          eq(cdkeyBatches.organizationId, organizationId),
          eq(cdkeyBatches.alias, key),
        );
    const rows = await db.select().from(cdkeyBatches).where(where).limit(1);
    if (!rows[0]) throw new CdkeyBatchNotFound(key);
    return rows[0];
  }

  async function insertCodesForUniqueBatch(
    organizationId: string,
    batchId: string,
    count: number,
  ): Promise<number> {
    if (count <= 0) return 0;
    if (count > MAX_GENERATE_PER_REQUEST)
      throw new CdkeyGenerateCountExceeded(MAX_GENERATE_PER_REQUEST);

    let remaining = count;
    let generated = 0;
    while (remaining > 0) {
      const chunk = Math.min(remaining, GENERATE_CHUNK_SIZE);
      // Build chunk of unique rows. Collisions on the (org, code) unique
      // index simply retry with a fresh string.
      const rows: Array<typeof cdkeyCodes.$inferInsert> = [];
      const seen = new Set<string>();
      while (rows.length < chunk) {
        const code = generateCdkeyCode();
        if (seen.has(code)) continue;
        seen.add(code);
        rows.push({
          organizationId,
          batchId,
          code,
          status: "pending",
        });
      }
      try {
        await db.insert(cdkeyCodes).values(rows);
        generated += rows.length;
        remaining -= rows.length;
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Retry this chunk with fresh strings.
          continue;
        }
        throw err;
      }
    }
    return generated;
  }

  return {
    // ─── Batch CRUD ────────────────────────────────────────────

    async createBatch(
      organizationId: string,
      input: CreateBatchInput,
    ): Promise<CdkeyBatch> {
      if (input.codeType === "unique" && input.universalCode) {
        throw new CdkeyInvalidInput(
          "universalCode must not be provided for unique batches",
        );
      }
      if (input.codeType === "universal" && input.initialCount) {
        throw new CdkeyInvalidInput(
          "initialCount must not be provided for universal batches",
        );
      }
      if (input.codeType === "unique" && !input.initialCount) {
        throw new CdkeyInvalidInput(
          "initialCount is required for unique batches",
        );
      }

      const startsAt = parseIsoDate(input.startsAt);
      const endsAt = parseIsoDate(input.endsAt);
      if (startsAt && endsAt && endsAt <= startsAt) {
        throw new CdkeyInvalidInput("endsAt must be after startsAt");
      }

      let batch: CdkeyBatch;
      try {
        const [row] = await db
          .insert(cdkeyBatches)
          .values({
            organizationId,
            name: input.name,
            alias: input.alias ?? null,
            description: input.description ?? null,
            codeType: input.codeType,
            reward: input.reward,
            totalLimit: input.totalLimit ?? null,
            perUserLimit: input.perUserLimit ?? 1,
            startsAt: startsAt ?? null,
            endsAt: endsAt ?? null,
            isActive: input.isActive ?? true,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        batch = row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new CdkeyBatchAliasConflict(input.alias);
        }
        throw err;
      }

      // Populate cdkey_codes for the batch.
      if (input.codeType === "universal") {
        const code = input.universalCode
          ? normalizeCdkeyCode(input.universalCode)
          : generateCdkeyCode();
        if (!isWellFormedCdkeyCode(code) && input.universalCode) {
          // User gave a custom code — accept any printable characters,
          // but still enforce (org, code) uniqueness below. We skip the
          // well-formed check for admin-supplied custom codes.
        }
        try {
          await db.insert(cdkeyCodes).values({
            organizationId,
            batchId: batch.id,
            code,
            status: "active",
          });
        } catch (err) {
          // Roll back the batch insert so the caller can retry with a
          // different universalCode.
          await db.delete(cdkeyBatches).where(eq(cdkeyBatches.id, batch.id));
          if (isUniqueViolation(err)) {
            throw new CdkeyUniversalCodeConflict(code);
          }
          throw err;
        }
      } else {
        // unique
        await insertCodesForUniqueBatch(
          organizationId,
          batch.id,
          input.initialCount!,
        );
      }

      return batch;
    },

    async updateBatch(
      organizationId: string,
      key: string,
      patch: UpdateBatchInput,
    ): Promise<CdkeyBatch> {
      const existing = await loadBatchByKey(organizationId, key);
      const updates: Partial<typeof cdkeyBatches.$inferInsert> = {};
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.alias !== undefined) updates.alias = patch.alias;
      if (patch.description !== undefined) updates.description = patch.description;
      if (patch.reward !== undefined) updates.reward = patch.reward;
      if (patch.totalLimit !== undefined) updates.totalLimit = patch.totalLimit;
      if (patch.perUserLimit !== undefined)
        updates.perUserLimit = patch.perUserLimit;
      if (patch.startsAt !== undefined)
        updates.startsAt = parseIsoDate(patch.startsAt);
      if (patch.endsAt !== undefined) updates.endsAt = parseIsoDate(patch.endsAt);
      if (patch.isActive !== undefined) updates.isActive = patch.isActive;
      if (patch.metadata !== undefined) updates.metadata = patch.metadata;

      if (Object.keys(updates).length === 0) return existing;

      if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
        throw new CdkeyInvalidInput("endsAt must be after startsAt");
      }

      try {
        const [row] = await db
          .update(cdkeyBatches)
          .set(updates)
          .where(
            and(
              eq(cdkeyBatches.id, existing.id),
              eq(cdkeyBatches.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new CdkeyBatchNotFound(key);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new CdkeyBatchAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deleteBatch(organizationId: string, key: string): Promise<void> {
      const existing = await loadBatchByKey(organizationId, key);
      const deleted = await db
        .delete(cdkeyBatches)
        .where(
          and(
            eq(cdkeyBatches.id, existing.id),
            eq(cdkeyBatches.organizationId, organizationId),
          ),
        )
        .returning({ id: cdkeyBatches.id });
      if (deleted.length === 0) throw new CdkeyBatchNotFound(key);
    },

    async listBatches(
      organizationId: string,
      params: PageParams = {},
    ): Promise<Page<CdkeyBatch>> {
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [eq(cdkeyBatches.organizationId, organizationId)];
      const seek = cursorWhere(params.cursor, cdkeyBatches.createdAt, cdkeyBatches.id);
      if (seek) conds.push(seek);
      if (params.q) {
        const pat = `%${params.q}%`;
        const search = or(ilike(cdkeyBatches.name, pat), ilike(cdkeyBatches.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(cdkeyBatches)
        .where(and(...conds))
        .orderBy(desc(cdkeyBatches.createdAt), desc(cdkeyBatches.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getBatch(organizationId: string, key: string): Promise<CdkeyBatch> {
      return loadBatchByKey(organizationId, key);
    },

    /**
     * For universal batches, returns the single code row (so admin UI can
     * show the shared string). For unique batches, returns an empty array
     * — use listCodes() for pagination.
     */
    async getBatchUniversalCode(
      organizationId: string,
      batchId: string,
    ): Promise<CdkeyCode | null> {
      const [row] = await db
        .select()
        .from(cdkeyCodes)
        .where(
          and(
            eq(cdkeyCodes.organizationId, organizationId),
            eq(cdkeyCodes.batchId, batchId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    // ─── Codes ─────────────────────────────────────────────────

    async generateCodes(
      organizationId: string,
      batchId: string,
      input: GenerateCodesInput,
    ): Promise<{ generated: number }> {
      const batch = await loadBatchByKey(organizationId, batchId);
      if (batch.codeType !== "unique") {
        throw new CdkeyInvalidInput(
          "generateCodes is only valid for unique batches",
        );
      }
      if (input.count > MAX_GENERATE_PER_REQUEST)
        throw new CdkeyGenerateCountExceeded(MAX_GENERATE_PER_REQUEST);
      const generated = await insertCodesForUniqueBatch(
        organizationId,
        batch.id,
        input.count,
      );
      return { generated };
    },

    async listCodes(
      organizationId: string,
      batchId: string,
      opts: PageParams & { status?: string } = {},
    ): Promise<Page<CdkeyCode>> {
      const batch = await loadBatchByKey(organizationId, batchId);
      const limit = clampLimit(opts.limit);
      const conds: SQL[] = [
        eq(cdkeyCodes.organizationId, organizationId),
        eq(cdkeyCodes.batchId, batch.id),
      ];
      if (opts.status) conds.push(eq(cdkeyCodes.status, opts.status));
      const seek = cursorWhere(opts.cursor, cdkeyCodes.createdAt, cdkeyCodes.id);
      if (seek) conds.push(seek);
      if (opts.q) {
        conds.push(ilike(cdkeyCodes.code, `%${opts.q}%`));
      }
      const rows = await db
        .select()
        .from(cdkeyCodes)
        .where(and(...conds))
        .orderBy(desc(cdkeyCodes.createdAt), desc(cdkeyCodes.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async revokeCode(
      organizationId: string,
      codeId: string,
    ): Promise<CdkeyCode> {
      const [row] = await db
        .update(cdkeyCodes)
        .set({ status: "revoked", version: sql`${cdkeyCodes.version} + 1` })
        .where(
          and(
            eq(cdkeyCodes.id, codeId),
            eq(cdkeyCodes.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new CdkeyCodeNotFound(codeId);
      return row;
    },

    async listRedemptionLogs(
      organizationId: string,
      batchId: string,
      opts: PageParams & { status?: string } = {},
    ): Promise<Page<CdkeyRedemptionLog>> {
      const batch = await loadBatchByKey(organizationId, batchId);
      const limit = clampLimit(opts.limit);
      const conds: SQL[] = [
        eq(cdkeyRedemptionLogs.organizationId, organizationId),
        eq(cdkeyRedemptionLogs.batchId, batch.id),
      ];
      if (opts.status) conds.push(eq(cdkeyRedemptionLogs.status, opts.status));
      const seek = cursorWhere(
        opts.cursor,
        cdkeyRedemptionLogs.createdAt,
        cdkeyRedemptionLogs.id,
      );
      if (seek) conds.push(seek);
      if (opts.q) {
        conds.push(ilike(cdkeyRedemptionLogs.code, `%${opts.q}%`));
      }
      const rows = await db
        .select()
        .from(cdkeyRedemptionLogs)
        .where(and(...conds))
        .orderBy(desc(cdkeyRedemptionLogs.createdAt), desc(cdkeyRedemptionLogs.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Redeem ────────────────────────────────────────────────

    async redeem(params: {
      organizationId: string;
      endUserId: string;
      code: string;
      idempotencyKey: string;
      source?: string;
      now?: Date;
    }): Promise<CdkeyRedeemResult> {
      const source = params.source ?? "api";
      const now = params.now ?? new Date();
      const normalized = normalizeCdkeyCode(params.code);

      // 1. Idempotency pre-check: try to insert a pending log row.
      //    If it conflicts, we've seen this (source, sourceId) before.
      let pendingLogId: string;
      try {
        const [row] = await db
          .insert(cdkeyRedemptionLogs)
          .values({
            organizationId: params.organizationId,
            endUserId: params.endUserId,
            // Placeholder batchId; we update once we resolve the code. The
            // column is NOT NULL, so use a sentinel UUID. On success we
            // update to the real id.
            batchId: "00000000-0000-0000-0000-000000000000",
            codeId: null,
            code: normalized,
            source,
            sourceId: params.idempotencyKey,
            status: "pending",
          })
          .returning({ id: cdkeyRedemptionLogs.id });
        if (!row) throw new Error("pending log insert returned no row");
        pendingLogId = row.id;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Existing row — look it up and return cached result (or re-throw
        // the original failure reason).
        const [cached] = await db
          .select()
          .from(cdkeyRedemptionLogs)
          .where(
            and(
              eq(cdkeyRedemptionLogs.organizationId, params.organizationId),
              eq(cdkeyRedemptionLogs.source, source),
              eq(cdkeyRedemptionLogs.sourceId, params.idempotencyKey),
            ),
          )
          .limit(1);
        if (!cached) throw err;
        if (cached.status === "success") {
          return {
            status: "already_redeemed",
            batchId: cached.batchId,
            codeId: cached.codeId ?? "",
            code: cached.code,
            reward: cached.reward ?? [],
            logId: cached.id,
          };
        }
        // The previous attempt failed — re-map to the typed error we
        // recorded. For MVP, re-throw a generic error on the failReason.
        throw new CdkeyInvalidInput(
          `previous redemption with this idempotencyKey failed: ${cached.failReason ?? "unknown"}`,
        );
      }

      // 2. Load code + batch in one JOIN.
      // Track resolved IDs so the failed-log update below can backfill the
      // real batchId / codeId instead of leaving the sentinel.
      let resolvedBatchId: string | null = null;
      let resolvedCodeId: string | null = null;
      try {
        const [row] = await db
          .select({
            code: cdkeyCodes,
            batch: cdkeyBatches,
          })
          .from(cdkeyCodes)
          .innerJoin(cdkeyBatches, eq(cdkeyCodes.batchId, cdkeyBatches.id))
          .where(
            and(
              eq(cdkeyCodes.organizationId, params.organizationId),
              eq(cdkeyCodes.code, normalized),
            ),
          )
          .limit(1);
        if (!row) throw new CdkeyInvalidCode();

        const codeRow = row.code;
        const batch = row.batch;
        resolvedBatchId = batch.id;
        resolvedCodeId = codeRow.id;

        if (codeRow.status === "revoked") {
          throw new CdkeyCodeRevoked(codeRow.id);
        }
        if (batch.codeType === "unique" && codeRow.status === "redeemed") {
          throw new CdkeyCodeAlreadyRedeemed(codeRow.id);
        }
        assertBatchWindow(batch, now);

        // 3a / 3b. Atomic consumption.
        if (batch.codeType === "universal") {
          // Check totalLimit + atomic increment on batch.
          if (batch.totalLimit !== null) {
            const updated = await db
              .update(cdkeyBatches)
              .set({
                totalRedeemed: sql`${cdkeyBatches.totalRedeemed} + 1`,
              })
              .where(
                and(
                  eq(cdkeyBatches.id, batch.id),
                  sql`${cdkeyBatches.totalRedeemed} < ${batch.totalLimit}`,
                ),
              )
              .returning();
            if (updated.length === 0) {
              throw new CdkeyTotalLimitReached(batch.id);
            }
          } else {
            await db
              .update(cdkeyBatches)
              .set({ totalRedeemed: sql`${cdkeyBatches.totalRedeemed} + 1` })
              .where(eq(cdkeyBatches.id, batch.id));
          }

          // Atomic per-user upsert (bounded by perUserLimit).
          const upserted = await db
            .insert(cdkeyUserStates)
            .values({
              batchId: batch.id,
              endUserId: params.endUserId,
              organizationId: params.organizationId,
              count: 1,
            })
            .onConflictDoUpdate({
              target: [cdkeyUserStates.batchId, cdkeyUserStates.endUserId],
              set: {
                count: sql`${cdkeyUserStates.count} + 1`,
                version: sql`${cdkeyUserStates.version} + 1`,
              },
              setWhere: sql`${cdkeyUserStates.count} < ${batch.perUserLimit}`,
            })
            .returning();

          if (upserted.length === 0) {
            // Roll back totalRedeemed.
            await db
              .update(cdkeyBatches)
              .set({ totalRedeemed: sql`${cdkeyBatches.totalRedeemed} - 1` })
              .where(eq(cdkeyBatches.id, batch.id));
            throw new CdkeyUserLimitReached(batch.id);
          }
        } else {
          // unique: atomically flip the code's status.
          const claimed = await db
            .update(cdkeyCodes)
            .set({
              status: "redeemed",
              redeemedBy: params.endUserId,
              redeemedAt: now,
              version: sql`${cdkeyCodes.version} + 1`,
            })
            .where(
              and(
                eq(cdkeyCodes.id, codeRow.id),
                eq(cdkeyCodes.status, "pending"),
              ),
            )
            .returning();
          if (claimed.length === 0) {
            throw new CdkeyCodeAlreadyRedeemed(codeRow.id);
          }
          await db
            .update(cdkeyBatches)
            .set({ totalRedeemed: sql`${cdkeyBatches.totalRedeemed} + 1` })
            .where(eq(cdkeyBatches.id, batch.id));
        }

        // 4. Grant reward via item service (item's own idempotency layer
        //    dedups on (source='cdkey', sourceId=idempotencyKey)).
        await itemSvc.grantItems({
          organizationId: params.organizationId,
          endUserId: params.endUserId,
          grants: batch.reward,
          source: "cdkey",
          sourceId: params.idempotencyKey,
        });

        // 5. Finalise the log row.
        await db
          .update(cdkeyRedemptionLogs)
          .set({
            status: "success",
            batchId: batch.id,
            codeId: codeRow.id,
            reward: batch.reward,
          })
          .where(eq(cdkeyRedemptionLogs.id, pendingLogId));

        if (analytics) {
          void analytics.writer.logEvent({
            ts: new Date(),
            orgId: params.organizationId,
            endUserId: params.endUserId,
            traceId: getTraceId(),
            event: "cdkey.redeemed",
            source: "cdkey",
            amount: 1,
            eventData: {
              batchId: batch.id,
              codeId: codeRow.id,
              code: codeRow.code,
              codeType: batch.codeType,
              logId: pendingLogId,
            },
          });
        }

        return {
          status: "success",
          batchId: batch.id,
          codeId: codeRow.id,
          code: codeRow.code,
          reward: batch.reward,
          logId: pendingLogId,
        };
      } catch (err) {
        // Mark log failed so a retry with the same idempotencyKey short-circuits.
        // Backfill the real batchId/codeId if we got that far so the log is
        // queryable under the batch's logs tab.
        const reason = err instanceof Error ? err.message : String(err);
        const updates: Partial<typeof cdkeyRedemptionLogs.$inferInsert> = {
          status: "failed",
          failReason: reason,
        };
        if (resolvedBatchId) updates.batchId = resolvedBatchId;
        if (resolvedCodeId) updates.codeId = resolvedCodeId;
        await db
          .update(cdkeyRedemptionLogs)
          .set(updates)
          .where(eq(cdkeyRedemptionLogs.id, pendingLogId));
        throw err;
      }
    },

    // ─── Utility ───────────────────────────────────────────────

    async getUserState(
      organizationId: string,
      batchId: string,
      endUserId: string,
    ): Promise<{ batchId: string; endUserId: string; count: number }> {
      const rows = await db
        .select()
        .from(cdkeyUserStates)
        .where(
          and(
            eq(cdkeyUserStates.organizationId, organizationId),
            eq(cdkeyUserStates.batchId, batchId),
            eq(cdkeyUserStates.endUserId, endUserId),
          ),
        )
        .limit(1);
      return {
        batchId,
        endUserId,
        count: rows[0]?.count ?? 0,
      };
    },
  };
}

export type CdkeyService = ReturnType<typeof createCdkeyService>;
