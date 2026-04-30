/**
 * Friend service — protocol-agnostic business logic.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Its only bridge to the outside world is the typed `AppDeps` object.
 *
 * ---------------------------------------------------------------------
 * Why NO db.transaction()
 * ---------------------------------------------------------------------
 *
 * Hot-path writes are single atomic SQL statements. For operations that
 * logically span multiple tables (e.g. accept request + insert
 * relationship) we accept the small window of inconsistency rather than
 * pinning a Hyperdrive pooled connection inside `db.transaction()`. The
 * version guard on friend_requests prevents double processing, and the
 * unique index on friend_relationships prevents duplicate friendships.
 *
 * ---------------------------------------------------------------------
 * Friend pair ordering invariant
 * ---------------------------------------------------------------------
 *
 * friendRelationships stores each friendship as a single row with
 * userA < userB (string comparison). The `orderPair` helper enforces
 * this everywhere a pair is inserted or queried.
 */

import { and, count, eq, or, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  friendBlocks,
  friendRelationships,
  friendRequests,
  friendSettings,
} from "../../schema/friend";
import {
  FriendAlreadyExists,
  FriendBlockLimitReached,
  FriendBlockedUser,
  FriendConcurrencyConflict,
  FriendLimitReached,
  FriendNotFound,
  FriendPendingLimitReached,
  FriendRequestAlreadyExists,
  FriendRequestNotFound,
  FriendSelfAction,
} from "./errors";
import type { UpsertSettingsInput } from "./validators";

// `events` optional to keep `createFriendService({ db })` test sites
// compiling. Production wiring hands it in via `deps`.
type FriendDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with friend-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "friend.request_sent": {
      organizationId: string;
      // `endUserId` = acting session user (the sender).
      endUserId: string;
      requestId: string;
      toUserId: string;
    };
    "friend.request_accepted": {
      organizationId: string;
      // `endUserId` = acting session user (the accepter).
      endUserId: string;
      requestId: string;
      fromUserId: string;
    };
  }
}

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function createFriendService(d: FriendDeps) {
  const { db, events } = d;

  async function getSettingsOrDefaults(orgId: string) {
    const rows = await db
      .select()
      .from(friendSettings)
      .where(eq(friendSettings.organizationId, orgId))
      .limit(1);
    return rows[0] ?? { maxFriends: 50, maxBlocked: 50, maxPendingRequests: 20 };
  }

  async function countFriends(orgId: string, endUserId: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(friendRelationships)
      .where(
        and(
          eq(friendRelationships.organizationId, orgId),
          or(
            eq(friendRelationships.userA, endUserId),
            eq(friendRelationships.userB, endUserId),
          ),
        ),
      );
    return result?.value ?? 0;
  }

  async function countPendingOutgoing(orgId: string, endUserId: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.organizationId, orgId),
          eq(friendRequests.fromUserId, endUserId),
          eq(friendRequests.status, "pending"),
        ),
      );
    return result?.value ?? 0;
  }

  async function countBlocks(orgId: string, endUserId: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(friendBlocks)
      .where(
        and(
          eq(friendBlocks.organizationId, orgId),
          eq(friendBlocks.blockerUserId, endUserId),
        ),
      );
    return result?.value ?? 0;
  }

  async function hasBlock(orgId: string, userX: string, userY: string): Promise<boolean> {
    const rows = await db
      .select({ blockerUserId: friendBlocks.blockerUserId })
      .from(friendBlocks)
      .where(
        and(
          eq(friendBlocks.organizationId, orgId),
          or(
            and(
              eq(friendBlocks.blockerUserId, userX),
              eq(friendBlocks.blockedUserId, userY),
            ),
            and(
              eq(friendBlocks.blockerUserId, userY),
              eq(friendBlocks.blockedUserId, userX),
            ),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async function existingFriendship(orgId: string, userX: string, userY: string) {
    const [a, b] = orderPair(userX, userY);
    const rows = await db
      .select()
      .from(friendRelationships)
      .where(
        and(
          eq(friendRelationships.organizationId, orgId),
          eq(friendRelationships.userA, a),
          eq(friendRelationships.userB, b),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    async getSettings(orgId: string) {
      const rows = await db
        .select()
        .from(friendSettings)
        .where(eq(friendSettings.organizationId, orgId))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertSettings(orgId: string, input: UpsertSettingsInput) {
      const [row] = await db
        .insert(friendSettings)
        .values({
          organizationId: orgId,
          maxFriends: input.maxFriends ?? 50,
          maxBlocked: input.maxBlocked ?? 50,
          maxPendingRequests: input.maxPendingRequests ?? 20,
          metadata: input.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [friendSettings.organizationId],
          set: {
            maxFriends: input.maxFriends ?? 50,
            maxBlocked: input.maxBlocked ?? 50,
            maxPendingRequests: input.maxPendingRequests ?? 20,
            metadata: input.metadata ?? null,
          },
        })
        .returning();
      if (!row) throw new Error("upsert returned no row");
      return row;
    },

    async sendRequest(
      orgId: string,
      fromUserId: string,
      toUserId: string,
      message?: string | null,
    ) {
      if (fromUserId === toUserId) throw new FriendSelfAction();

      if (await hasBlock(orgId, fromUserId, toUserId)) {
        throw new FriendBlockedUser();
      }

      if (await existingFriendship(orgId, fromUserId, toUserId)) {
        throw new FriendAlreadyExists();
      }

      const settings = await getSettingsOrDefaults(orgId);

      const pendingCount = await countPendingOutgoing(orgId, fromUserId);
      if (pendingCount >= settings.maxPendingRequests) {
        throw new FriendPendingLimitReached();
      }

      const friendCount = await countFriends(orgId, fromUserId);
      if (friendCount >= settings.maxFriends) {
        throw new FriendLimitReached();
      }

      try {
        const [row] = await db
          .insert(friendRequests)
          .values({
            organizationId: orgId,
            fromUserId,
            toUserId,
            message: message ?? null,
            status: "pending",
          })
          .returning();
        if (!row) throw new Error("insert returned no row");

        if (events) {
          await events.emit("friend.request_sent", {
            organizationId: orgId,
            endUserId: fromUserId,
            requestId: row.id,
            toUserId,
          });
        }

        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new FriendRequestAlreadyExists();
        }
        throw err;
      }
    },

    async acceptRequest(orgId: string, requestId: string, endUserId: string) {
      // Load request and verify the endUserId is the recipient
      const rows = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.organizationId, orgId),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new FriendRequestNotFound(requestId);
      if (req.toUserId !== endUserId) throw new FriendRequestNotFound(requestId);
      if (req.status !== "pending") throw new FriendRequestNotFound(requestId);

      // Check friend limits for both users
      const settings = await getSettingsOrDefaults(orgId);
      const [countA, countB] = await Promise.all([
        countFriends(orgId, req.fromUserId),
        countFriends(orgId, req.toUserId),
      ]);
      if (countA >= settings.maxFriends || countB >= settings.maxFriends) {
        throw new FriendLimitReached();
      }

      // Version-guarded status update
      const updated = await db
        .update(friendRequests)
        .set({
          status: "accepted",
          respondedAt: new Date(),
          version: sql`${friendRequests.version} + 1`,
        })
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.version, req.version),
            eq(friendRequests.status, "pending"),
          ),
        )
        .returning();

      if (updated.length === 0) throw new FriendConcurrencyConflict();

      // Insert the relationship (unique index prevents duplicates)
      const [a, b] = orderPair(req.fromUserId, req.toUserId);
      try {
        await db
          .insert(friendRelationships)
          .values({
            organizationId: orgId,
            userA: a,
            userB: b,
          })
          .onConflictDoNothing();
      } catch {
        // If somehow both exist, the friendship is still created — no-op is fine
      }

      if (events) {
        await events.emit("friend.request_accepted", {
          organizationId: orgId,
          endUserId,
          requestId,
          fromUserId: req.fromUserId,
        });
      }

      return updated[0]!;
    },

    async rejectRequest(orgId: string, requestId: string, endUserId: string) {
      const rows = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.organizationId, orgId),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new FriendRequestNotFound(requestId);
      if (req.toUserId !== endUserId) throw new FriendRequestNotFound(requestId);
      if (req.status !== "pending") throw new FriendRequestNotFound(requestId);

      const updated = await db
        .update(friendRequests)
        .set({
          status: "rejected",
          respondedAt: new Date(),
          version: sql`${friendRequests.version} + 1`,
        })
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.version, req.version),
            eq(friendRequests.status, "pending"),
          ),
        )
        .returning();

      if (updated.length === 0) throw new FriendConcurrencyConflict();
      return updated[0]!;
    },

    async cancelRequest(orgId: string, requestId: string, endUserId: string) {
      const rows = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.organizationId, orgId),
          ),
        )
        .limit(1);
      const req = rows[0];
      if (!req) throw new FriendRequestNotFound(requestId);
      // Only the sender can cancel
      if (req.fromUserId !== endUserId) throw new FriendRequestNotFound(requestId);
      if (req.status !== "pending") throw new FriendRequestNotFound(requestId);

      const updated = await db
        .update(friendRequests)
        .set({
          status: "cancelled",
          respondedAt: new Date(),
          version: sql`${friendRequests.version} + 1`,
        })
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.version, req.version),
            eq(friendRequests.status, "pending"),
          ),
        )
        .returning();

      if (updated.length === 0) throw new FriendConcurrencyConflict();
      return updated[0]!;
    },

    async listIncomingRequests(orgId: string, endUserId: string) {
      return db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.organizationId, orgId),
            eq(friendRequests.toUserId, endUserId),
            eq(friendRequests.status, "pending"),
          ),
        )
        .orderBy(friendRequests.createdAt);
    },

    async listOutgoingRequests(orgId: string, endUserId: string) {
      return db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.organizationId, orgId),
            eq(friendRequests.fromUserId, endUserId),
            eq(friendRequests.status, "pending"),
          ),
        )
        .orderBy(friendRequests.createdAt);
    },

    async listFriends(
      orgId: string,
      endUserId: string,
      opts?: { limit?: number; offset?: number },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;
      return db
        .select()
        .from(friendRelationships)
        .where(
          and(
            eq(friendRelationships.organizationId, orgId),
            or(
              eq(friendRelationships.userA, endUserId),
              eq(friendRelationships.userB, endUserId),
            ),
          ),
        )
        .orderBy(friendRelationships.createdAt)
        .limit(limit)
        .offset(offset);
    },

    async removeFriend(orgId: string, relationshipId: string) {
      const deleted = await db
        .delete(friendRelationships)
        .where(
          and(
            eq(friendRelationships.id, relationshipId),
            eq(friendRelationships.organizationId, orgId),
          ),
        )
        .returning({ id: friendRelationships.id });
      if (deleted.length === 0) throw new FriendNotFound(relationshipId);
    },

    async getMutualFriends(orgId: string, userX: string, userY: string) {
      // Find all friends of userX, then intersect with friends of userY.
      // Uses a single SQL query with a subquery approach.
      const result = await db.execute(sql`
        SELECT r1.id, r1.organization_id, r1.user_a, r1.user_b, r1.metadata, r1.created_at
        FROM friend_relationships r1
        WHERE r1.organization_id = ${orgId}
          AND (r1.user_a = ${userX} OR r1.user_b = ${userX})
          AND EXISTS (
            SELECT 1 FROM friend_relationships r2
            WHERE r2.organization_id = ${orgId}
              AND (r2.user_a = ${userY} OR r2.user_b = ${userY})
              AND (
                CASE WHEN r1.user_a = ${userX} THEN r1.user_b ELSE r1.user_a END
                =
                CASE WHEN r2.user_a = ${userY} THEN r2.user_b ELSE r2.user_a END
              )
          )
      `);
      return result.rows as Array<{
        id: string;
        organization_id: string;
        user_a: string;
        user_b: string;
        metadata: unknown;
        created_at: string;
      }>;
    },

    async blockUser(orgId: string, blockerUserId: string, blockedUserId: string) {
      if (blockerUserId === blockedUserId) throw new FriendSelfAction();

      const settings = await getSettingsOrDefaults(orgId);
      const blockCount = await countBlocks(orgId, blockerUserId);
      if (blockCount >= settings.maxBlocked) {
        throw new FriendBlockLimitReached();
      }

      // Insert the block (composite PK prevents duplicates)
      try {
        await db
          .insert(friendBlocks)
          .values({
            organizationId: orgId,
            blockerUserId,
            blockedUserId,
          })
          .onConflictDoNothing();
      } catch {
        // Already blocked — no-op
      }

      // Remove existing friendship if any
      const [a, b] = orderPair(blockerUserId, blockedUserId);
      await db
        .delete(friendRelationships)
        .where(
          and(
            eq(friendRelationships.organizationId, orgId),
            eq(friendRelationships.userA, a),
            eq(friendRelationships.userB, b),
          ),
        );

      // Cancel any pending requests in either direction
      await db
        .update(friendRequests)
        .set({
          status: "cancelled",
          respondedAt: new Date(),
          version: sql`${friendRequests.version} + 1`,
        })
        .where(
          and(
            eq(friendRequests.organizationId, orgId),
            eq(friendRequests.status, "pending"),
            or(
              and(
                eq(friendRequests.fromUserId, blockerUserId),
                eq(friendRequests.toUserId, blockedUserId),
              ),
              and(
                eq(friendRequests.fromUserId, blockedUserId),
                eq(friendRequests.toUserId, blockerUserId),
              ),
            ),
          ),
        );
    },

    async unblockUser(orgId: string, blockerUserId: string, blockedUserId: string) {
      await db
        .delete(friendBlocks)
        .where(
          and(
            eq(friendBlocks.organizationId, orgId),
            eq(friendBlocks.blockerUserId, blockerUserId),
            eq(friendBlocks.blockedUserId, blockedUserId),
          ),
        );
    },

    async listBlocks(orgId: string, endUserId: string) {
      return db
        .select()
        .from(friendBlocks)
        .where(
          and(
            eq(friendBlocks.organizationId, orgId),
            eq(friendBlocks.blockerUserId, endUserId),
          ),
        )
        .orderBy(friendBlocks.createdAt);
    },

    /**
     * Check if two users are friends (relationship exists).
     * Used by cross-module callers like friend-gift.
     */
    async areFriends(
      orgId: string,
      userA: string,
      userB: string,
    ): Promise<boolean> {
      const rel = await existingFriendship(orgId, userA, userB);
      return rel !== null;
    },

    /**
     * Check if blockerUserId has blocked blockedUserId.
     * Used by cross-module callers like friend-gift.
     */
    async isBlocked(
      orgId: string,
      blockerUserId: string,
      blockedUserId: string,
    ): Promise<boolean> {
      const rows = await db
        .select({ blockerUserId: friendBlocks.blockerUserId })
        .from(friendBlocks)
        .where(
          and(
            eq(friendBlocks.organizationId, orgId),
            eq(friendBlocks.blockerUserId, blockerUserId),
            eq(friendBlocks.blockedUserId, blockedUserId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async listRelationships(
      orgId: string,
      opts?: { limit?: number; offset?: number },
    ) {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;

      const items = await db
        .select()
        .from(friendRelationships)
        .where(eq(friendRelationships.organizationId, orgId))
        .orderBy(friendRelationships.createdAt)
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ value: count() })
        .from(friendRelationships)
        .where(eq(friendRelationships.organizationId, orgId));

      return { items, total: totalResult?.value ?? 0 };
    },

    async deleteRelationship(orgId: string, id: string) {
      const deleted = await db
        .delete(friendRelationships)
        .where(
          and(
            eq(friendRelationships.id, id),
            eq(friendRelationships.organizationId, orgId),
          ),
        )
        .returning({ id: friendRelationships.id });
      if (deleted.length === 0) throw new FriendNotFound(id);
    },
  };
}

export type FriendService = ReturnType<typeof createFriendService>;

