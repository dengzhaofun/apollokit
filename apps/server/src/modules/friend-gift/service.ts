/**
 * Friend gift service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 *
 * ---------------------------------------------------------------------
 * Why atomic SQL instead of transactions
 * ---------------------------------------------------------------------
 *
 * Hot paths express writes as single atomic SQL statements. We avoid
 * `db.transaction()` here because each request would pin a Hyperdrive
 * pooled connection across the round-trip, which trades latency for
 * very little benefit when a single UPSERT already serializes correctly.
 *
 * For daily state counters, we use INSERT … ON CONFLICT DO UPDATE with
 * a WHERE guard on the counter limit:
 *
 *   INSERT INTO friend_gift_daily_states (org, user, date_key, send_count, version)
 *   VALUES (?, ?, ?, 1, 1)
 *   ON CONFLICT (organization_id, end_user_id, date_key)
 *   DO UPDATE SET send_count = send_count + 1, version = version + 1
 *   WHERE friend_gift_daily_states.send_count < ?
 *   RETURNING *
 *
 * If 0 rows returned, the limit is exceeded. Postgres serializes
 * concurrent callers via row-level lock on conflict — no double-counting.
 *
 * For gift claiming, we use:
 *   UPDATE friend_gift_sends SET status='claimed' WHERE id=? AND status='pending'
 *   RETURNING *
 * Zero rows means the gift was already claimed, expired, or cancelled.
 *
 * ---------------------------------------------------------------------
 * Cross-module dependencies
 * ---------------------------------------------------------------------
 *
 * The friend service (friendship checks) and item service (grant/deduct)
 * are injected via the factory function, NOT imported as singletons.
 * This keeps the service testable and avoids circular import issues.
 */

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  friendGiftDailyStates,
  friendGiftPackages,
  friendGiftSends,
  friendGiftSettings,
} from "../../schema/friend-gift";
import {
  FriendGiftAlreadyClaimed,
  FriendGiftBlockedUser,
  FriendGiftConcurrencyConflict,
  FriendGiftDailyReceiveLimitReached,
  FriendGiftDailySendLimitReached,
  FriendGiftExpired,
  FriendGiftNotFound,
  FriendGiftNotFriends,
  FriendGiftPackageAliasConflict,
  FriendGiftPackageInactive,
  FriendGiftPackageNotFound,
  FriendGiftSettingsNotFound,
} from "./errors";
import type {
  FriendGiftPackage,
  FriendGiftSend,
  FriendGiftSettings,
} from "./types";
import type {
  CreatePackageInput,
  SendGiftInput,
  UpdatePackageInput,
  UpsertSettingsInput,
} from "./validators";

// `events` optional to keep `createFriendGiftService({ db }, ...)` test
// sites compiling. Production wiring hands it in via `deps`.
type FriendGiftDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with friend-gift-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "friend_gift.sent": {
      organizationId: string;
      // `endUserId` = sender (the acting session user).
      endUserId: string;
      sendId: string;
      receiverUserId: string;
      packageId: string;
    };
    "friend_gift.claimed": {
      organizationId: string;
      // `endUserId` = claimer (receiver acting in-session).
      endUserId: string;
      sendId: string;
      senderUserId: string;
    };
  }
}

/**
 * Minimal interface for the friend service methods this module needs.
 * The actual FriendService may have many more methods — we only depend
 * on the friendship/block checks.
 */
export type FriendServiceDep = {
  areFriends(
    organizationId: string,
    userA: string,
    userB: string,
  ): Promise<boolean>;
  isBlocked(
    organizationId: string,
    blockerUserId: string,
    blockedUserId: string,
  ): Promise<boolean>;
};

/**
 * Minimal interface for the item service methods this module needs.
 */
export type ItemServiceDep = {
  grantItems(params: {
    organizationId: string;
    endUserId: string;
    grants: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }): Promise<unknown>;
  deductItems(params: {
    organizationId: string;
    endUserId: string;
    deductions: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }): Promise<unknown>;
};

/**
 * Compute today's date key (YYYY-MM-DD) in the given IANA timezone.
 * Uses Intl.DateTimeFormat to resolve the wall-clock date.
 */
function computeDateKey(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD
  return formatter.format(new Date());
}

export function createFriendGiftService(
  d: FriendGiftDeps,
  friendSvc: FriendServiceDep,
  itemSvc: ItemServiceDep,
) {
  const { db, events } = d;

  // ─── Settings ──────────────────────────────────────────────────

  async function loadSettings(
    organizationId: string,
  ): Promise<FriendGiftSettings> {
    const rows = await db
      .select()
      .from(friendGiftSettings)
      .where(eq(friendGiftSettings.organizationId, organizationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new FriendGiftSettingsNotFound();
    return row;
  }

  return {
    async getSettings(
      organizationId: string,
    ): Promise<FriendGiftSettings | null> {
      const rows = await db
        .select()
        .from(friendGiftSettings)
        .where(eq(friendGiftSettings.organizationId, organizationId))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertSettings(
      organizationId: string,
      input: UpsertSettingsInput,
    ): Promise<FriendGiftSettings> {
      const [row] = await db
        .insert(friendGiftSettings)
        .values({
          organizationId,
          dailySendLimit: input.dailySendLimit ?? 5,
          dailyReceiveLimit: input.dailyReceiveLimit ?? 10,
          timezone: input.timezone ?? "UTC",
          metadata: input.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [friendGiftSettings.organizationId],
          set: {
            dailySendLimit: input.dailySendLimit ?? 5,
            dailyReceiveLimit: input.dailyReceiveLimit ?? 10,
            timezone: input.timezone ?? "UTC",
            metadata: input.metadata ?? null,
          },
        })
        .returning();
      if (!row) throw new Error("upsert returned no row");
      return row;
    },

    // ─── Package CRUD ──────────────────────────────────────────────

    async createPackage(
      organizationId: string,
      input: CreatePackageInput,
    ): Promise<FriendGiftPackage> {
      try {
        const [row] = await db
          .insert(friendGiftPackages)
          .values({
            organizationId,
            alias: input.alias ?? null,
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
            giftItems: input.giftItems,
            isActive: input.isActive ?? true,
            sortOrder: input.sortOrder ?? 0,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new FriendGiftPackageAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async getPackage(
      organizationId: string,
      id: string,
    ): Promise<FriendGiftPackage> {
      const rows = await db
        .select()
        .from(friendGiftPackages)
        .where(
          and(
            eq(friendGiftPackages.organizationId, organizationId),
            eq(friendGiftPackages.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new FriendGiftPackageNotFound(id);
      return row;
    },

    async listPackages(
      organizationId: string,
      opts: PageParams & { activeOnly?: boolean } = {},
    ): Promise<Page<FriendGiftPackage>> {
      const limit = clampLimit(opts.limit);
      const conditions: SQL[] = [eq(friendGiftPackages.organizationId, organizationId)];
      if (opts.activeOnly) {
        conditions.push(eq(friendGiftPackages.isActive, true));
      }
      const seek = cursorWhere(opts.cursor, friendGiftPackages.createdAt, friendGiftPackages.id);
      if (seek) conditions.push(seek);
      if (opts.q) {
        const pat = `%${opts.q}%`;
        const search = or(ilike(friendGiftPackages.name, pat), ilike(friendGiftPackages.alias, pat));
        if (search) conditions.push(search);
      }
      const rows = await db
        .select()
        .from(friendGiftPackages)
        .where(and(...conditions))
        .orderBy(desc(friendGiftPackages.createdAt), desc(friendGiftPackages.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async updatePackage(
      organizationId: string,
      id: string,
      patch: UpdatePackageInput,
    ): Promise<FriendGiftPackage> {
      const updateValues: Partial<typeof friendGiftPackages.$inferInsert> = {};
      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.alias !== undefined) updateValues.alias = patch.alias;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.giftItems !== undefined) updateValues.giftItems = patch.giftItems;
      if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
      if (patch.sortOrder !== undefined) updateValues.sortOrder = patch.sortOrder;
      if (patch.metadata !== undefined) updateValues.metadata = patch.metadata;

      if (Object.keys(updateValues).length === 0) {
        // No changes — return existing
        const rows = await db
          .select()
          .from(friendGiftPackages)
          .where(
            and(
              eq(friendGiftPackages.id, id),
              eq(friendGiftPackages.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new FriendGiftPackageNotFound(id);
        return rows[0];
      }

      try {
        const [row] = await db
          .update(friendGiftPackages)
          .set(updateValues)
          .where(
            and(
              eq(friendGiftPackages.id, id),
              eq(friendGiftPackages.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new FriendGiftPackageNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && patch.alias) {
          throw new FriendGiftPackageAliasConflict(patch.alias);
        }
        throw err;
      }
    },

    async deletePackage(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(friendGiftPackages)
        .where(
          and(
            eq(friendGiftPackages.id, id),
            eq(friendGiftPackages.organizationId, organizationId),
          ),
        )
        .returning({ id: friendGiftPackages.id });
      if (deleted.length === 0) throw new FriendGiftPackageNotFound(id);
    },

    // ─── Send gift ───────────────────────────────────────────────

    async sendGift(
      organizationId: string,
      senderUserId: string,
      input: SendGiftInput,
    ): Promise<FriendGiftSend> {
      // 1. Validate friendship
      const areFriends = await friendSvc.areFriends(
        organizationId,
        senderUserId,
        input.receiverUserId,
      );
      if (!areFriends) throw new FriendGiftNotFriends();

      // Check blocks in both directions
      const senderBlocked = await friendSvc.isBlocked(
        organizationId,
        senderUserId,
        input.receiverUserId,
      );
      const receiverBlocked = await friendSvc.isBlocked(
        organizationId,
        input.receiverUserId,
        senderUserId,
      );
      if (senderBlocked || receiverBlocked) throw new FriendGiftBlockedUser();

      // 2. Load settings and package
      const settings = await loadSettings(organizationId);
      const dateKey = computeDateKey(settings.timezone);

      const pkgRows = await db
        .select()
        .from(friendGiftPackages)
        .where(
          and(
            eq(friendGiftPackages.id, input.packageId),
            eq(friendGiftPackages.organizationId, organizationId),
          ),
        )
        .limit(1);
      const pkg = pkgRows[0];
      if (!pkg) throw new FriendGiftPackageNotFound(input.packageId);
      if (!pkg.isActive) throw new FriendGiftPackageInactive(input.packageId);

      // 3. Atomic UPSERT: increment sender's daily send count
      const senderUpsert = await db.execute(sql`
        INSERT INTO friend_gift_daily_states (organization_id, end_user_id, date_key, send_count, receive_count, version, created_at, updated_at)
        VALUES (${organizationId}, ${senderUserId}, ${dateKey}, 1, 0, 1, NOW(), NOW())
        ON CONFLICT (organization_id, end_user_id, date_key)
        DO UPDATE SET
          send_count = friend_gift_daily_states.send_count + 1,
          version = friend_gift_daily_states.version + 1,
          updated_at = NOW()
        WHERE friend_gift_daily_states.send_count < ${settings.dailySendLimit}
        RETURNING *
      `);
      if (senderUpsert.rows.length === 0) {
        throw new FriendGiftDailySendLimitReached();
      }

      // 4. Atomic UPSERT: increment receiver's daily receive count
      const receiverUpsert = await db.execute(sql`
        INSERT INTO friend_gift_daily_states (organization_id, end_user_id, date_key, send_count, receive_count, version, created_at, updated_at)
        VALUES (${organizationId}, ${input.receiverUserId}, ${dateKey}, 0, 1, 1, NOW(), NOW())
        ON CONFLICT (organization_id, end_user_id, date_key)
        DO UPDATE SET
          receive_count = friend_gift_daily_states.receive_count + 1,
          version = friend_gift_daily_states.version + 1,
          updated_at = NOW()
        WHERE friend_gift_daily_states.receive_count < ${settings.dailyReceiveLimit}
        RETURNING *
      `);
      if (receiverUpsert.rows.length === 0) {
        // Rollback sender's counter: decrement send_count
        // Since we can't use transactions, we do a compensating write.
        await db.execute(sql`
          UPDATE friend_gift_daily_states
          SET send_count = friend_gift_daily_states.send_count - 1,
              version = friend_gift_daily_states.version + 1,
              updated_at = NOW()
          WHERE organization_id = ${organizationId}
            AND end_user_id = ${senderUserId}
            AND date_key = ${dateKey}
            AND send_count > 0
        `);
        throw new FriendGiftDailyReceiveLimitReached();
      }

      // 5. Deduct items from sender
      try {
        await itemSvc.deductItems({
          organizationId,
          endUserId: senderUserId,
          deductions: pkg.giftItems,
          source: "friend_gift_send",
          sourceId: input.packageId,
        });
      } catch (err) {
        // Compensating writes for daily counters on deduction failure
        await db.execute(sql`
          UPDATE friend_gift_daily_states
          SET send_count = friend_gift_daily_states.send_count - 1,
              version = friend_gift_daily_states.version + 1,
              updated_at = NOW()
          WHERE organization_id = ${organizationId}
            AND end_user_id = ${senderUserId}
            AND date_key = ${dateKey}
            AND send_count > 0
        `);
        await db.execute(sql`
          UPDATE friend_gift_daily_states
          SET receive_count = friend_gift_daily_states.receive_count - 1,
              version = friend_gift_daily_states.version + 1,
              updated_at = NOW()
          WHERE organization_id = ${organizationId}
            AND end_user_id = ${input.receiverUserId}
            AND date_key = ${dateKey}
            AND receive_count > 0
        `);
        throw err;
      }

      // 6. Insert gift send record (snapshot giftItems from the package)
      const [send] = await db
        .insert(friendGiftSends)
        .values({
          organizationId,
          packageId: pkg.id,
          senderUserId,
          receiverUserId: input.receiverUserId,
          giftItems: pkg.giftItems,
          status: "pending",
          message: input.message ?? null,
        })
        .returning();
      if (!send) throw new Error("insert returned no row");

      if (events) {
        await events.emit("friend_gift.sent", {
          organizationId,
          endUserId: senderUserId,
          sendId: send.id,
          receiverUserId: input.receiverUserId,
          packageId: pkg.id,
        });
      }

      return send;
    },

    // ─── Claim gift ──────────────────────────────────────────────

    async claimGift(
      organizationId: string,
      giftId: string,
      endUserId: string,
    ): Promise<FriendGiftSend> {
      // Atomic UPDATE: SET status='claimed' WHERE status='pending'
      const [claimed] = await db
        .update(friendGiftSends)
        .set({
          status: "claimed",
          claimedAt: new Date(),
          version: sql`${friendGiftSends.version} + 1`,
        })
        .where(
          and(
            eq(friendGiftSends.id, giftId),
            eq(friendGiftSends.organizationId, organizationId),
            eq(friendGiftSends.receiverUserId, endUserId),
            eq(friendGiftSends.status, "pending"),
          ),
        )
        .returning();

      if (!claimed) {
        // Distinguish between not-found, already-claimed, expired
        const rows = await db
          .select()
          .from(friendGiftSends)
          .where(
            and(
              eq(friendGiftSends.id, giftId),
              eq(friendGiftSends.organizationId, organizationId),
            ),
          )
          .limit(1);
        const existing = rows[0];
        if (!existing) throw new FriendGiftNotFound(giftId);
        if (existing.status === "claimed")
          throw new FriendGiftAlreadyClaimed(giftId);
        if (existing.status === "expired") throw new FriendGiftExpired(giftId);
        throw new FriendGiftConcurrencyConflict();
      }

      // Grant items to receiver
      await itemSvc.grantItems({
        organizationId,
        endUserId,
        grants: claimed.giftItems,
        source: "friend_gift_claim",
        sourceId: giftId,
      });

      if (events) {
        await events.emit("friend_gift.claimed", {
          organizationId,
          endUserId,
          sendId: claimed.id,
          senderUserId: claimed.senderUserId,
        });
      }

      return claimed;
    },

    // ─── Inbox / Sent queries ────────────────────────────────────

    async listInbox(
      organizationId: string,
      endUserId: string,
    ): Promise<FriendGiftSend[]> {
      return db
        .select()
        .from(friendGiftSends)
        .where(
          and(
            eq(friendGiftSends.organizationId, organizationId),
            eq(friendGiftSends.receiverUserId, endUserId),
            eq(friendGiftSends.status, "pending"),
          ),
        )
        .orderBy(desc(friendGiftSends.createdAt));
    },

    async listSent(
      organizationId: string,
      endUserId: string,
    ): Promise<FriendGiftSend[]> {
      return db
        .select()
        .from(friendGiftSends)
        .where(
          and(
            eq(friendGiftSends.organizationId, organizationId),
            eq(friendGiftSends.senderUserId, endUserId),
          ),
        )
        .orderBy(desc(friendGiftSends.createdAt));
    },

    // ─── Daily status ────────────────────────────────────────────

    async getDailyStatus(
      organizationId: string,
      endUserId: string,
    ): Promise<{
      dateKey: string;
      sendCount: number;
      receiveCount: number;
      dailySendLimit: number;
      dailyReceiveLimit: number;
    }> {
      const settings = await loadSettings(organizationId);
      const dateKey = computeDateKey(settings.timezone);

      const rows = await db
        .select()
        .from(friendGiftDailyStates)
        .where(
          and(
            eq(friendGiftDailyStates.organizationId, organizationId),
            eq(friendGiftDailyStates.endUserId, endUserId),
            eq(friendGiftDailyStates.dateKey, dateKey),
          ),
        )
        .limit(1);

      const state = rows[0];
      return {
        dateKey,
        sendCount: state?.sendCount ?? 0,
        receiveCount: state?.receiveCount ?? 0,
        dailySendLimit: settings.dailySendLimit,
        dailyReceiveLimit: settings.dailyReceiveLimit,
      };
    },

    // ─── Admin: browse sends ─────────────────────────────────────

    async listSends(
      organizationId: string,
      opts: PageParams = {},
    ): Promise<Page<FriendGiftSend>> {
      const limit = clampLimit(opts.limit);
      const conds: SQL[] = [eq(friendGiftSends.organizationId, organizationId)];
      const seek = cursorWhere(opts.cursor, friendGiftSends.createdAt, friendGiftSends.id);
      if (seek) conds.push(seek);
      const rows = await db
        .select()
        .from(friendGiftSends)
        .where(and(...conds))
        .orderBy(desc(friendGiftSends.createdAt), desc(friendGiftSends.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getSend(
      organizationId: string,
      sendId: string,
    ): Promise<FriendGiftSend> {
      const rows = await db
        .select()
        .from(friendGiftSends)
        .where(
          and(
            eq(friendGiftSends.id, sendId),
            eq(friendGiftSends.organizationId, organizationId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new FriendGiftNotFound(sendId);
      return row;
    },
  };
}

export type FriendGiftService = ReturnType<typeof createFriendGiftService>;
