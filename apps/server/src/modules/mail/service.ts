/**
 * Mail service — protocol-agnostic business logic for the in-game mailbox.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or any HTTP concepts.
 * Cross-module dependencies (the item service for reward grants) are
 * injected via the factory; this keeps the service reusable from future
 * cron jobs, MCP servers, and internal RPC without HTTP coupling.
 *
 * ---------------------------------------------------------------------
 * Architecture — "virtual" mailbox, no fan-out
 * ---------------------------------------------------------------------
 *
 * `mail_messages` carries the canonical payload (title / content / rewards /
 * targeting). `mail_user_states` is written lazily — a row exists only once
 * a user has read or claimed. Inbox listing is a LEFT JOIN.
 *
 * We do NOT physically fan out broadcasts because:
 *   1. `endUserId` is opaque text with no registry (CLAUDE.md § "The two
 *      userIds"). The server literally can't enumerate "all players".
 *   2. A 1M-user broadcast would insert 1M rows for a single send; most of
 *      those users never read the mail and the state rows would never be
 *      touched again.
 *
 * New users not seeing historical broadcasts is handled client-side: the
 * tenant / game SDK passes `since = playerJoinedAt` to `listInbox`, and we
 * filter `m.sentAt >= since` on the broadcast branch. Zero server state
 * needed — no profile table.
 *
 * ---------------------------------------------------------------------
 * Claim concurrency — single conditional upsert
 * ---------------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` has no transactions. The claim path reduces to a
 * single atomic statement against `mail_user_states`:
 *
 *   INSERT INTO mail_user_states (...)
 *   VALUES (... claimed_at = now())
 *   ON CONFLICT (message_id, end_user_id) DO UPDATE SET claimed_at = now()
 *   WHERE mail_user_states.claimed_at IS NULL
 *     AND (NOT requireRead OR mail_user_states.read_at IS NOT NULL)
 *   RETURNING *, (xmax = 0) AS inserted;
 *
 * The `setWhere` serializes concurrent callers — losers get zero rows and
 * take a re-read branch (→ AlreadyClaimed or MustReadFirst).
 *
 * Winners then call `itemService.grantItems` with
 * `(source="mail_claim", sourceId="${messageId}:${endUserId}")`. The
 * existing `item_grant_logs` table is the ultimate dedup key — if the
 * caller retries after grantItems partially succeeded, the next round
 * short-circuits on "already in grant_log".
 */

import { and, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { mailMessages, mailUserStates } from "../../schema/mail";
import { itemGrantLogs } from "../../schema/item";
import type { ItemService } from "../item";
import type { RewardEntry } from "../../lib/rewards";
import {
  MailAlreadyClaimed,
  MailExpired,
  MailInvalidOrigin,
  MailInvalidTarget,
  MailMessageNotFound,
  MailMulticastTooLarge,
  MailMustReadFirst,
  MailNotTargeted,
  MailRevoked,
} from "./errors";
import {
  MAIL_MULTICAST_MAX,
  type ClaimResult,
  type InboxMessage,
  type MailMessage,
  type MailMessageWithStats,
  type MailTargetType,
  type MailUserState,
} from "./types";
import type {
  CreateMailInput,
  ProgrammaticCreateMailInput,
  UnicastInput,
} from "./validators";

type MailDeps = Pick<AppDeps, "db">;

const CLAIM_SOURCE = "mail_claim";

function grantSourceId(messageId: string, endUserId: string): string {
  return `${messageId}:${endUserId}`;
}

function validateCreateTargeting(input: {
  targetType: MailTargetType;
  targetUserIds?: string[] | null | undefined;
}): void {
  if (input.targetType === "broadcast") {
    if (input.targetUserIds && input.targetUserIds.length > 0) {
      throw new MailInvalidTarget(
        "targetUserIds must be empty when targetType='broadcast'",
      );
    }
  } else {
    // multicast (includes len=1 unicast)
    const list = input.targetUserIds;
    if (!list || list.length === 0) {
      throw new MailInvalidTarget(
        "targetUserIds must contain at least one id when targetType='multicast'",
      );
    }
    if (list.length > MAIL_MULTICAST_MAX) {
      throw new MailMulticastTooLarge(list.length, MAIL_MULTICAST_MAX);
    }
  }
}

function validateOriginPair(input: {
  originSource?: string | null;
  originSourceId?: string | null;
}): void {
  const hasSource = !!input.originSource;
  const hasId = !!input.originSourceId;
  if (hasSource !== hasId) {
    throw new MailInvalidOrigin(
      "originSource and originSourceId must be both set or both omitted",
    );
  }
}

export function createMailService(d: MailDeps, itemSvc: ItemService) {
  const { db } = d;

  async function loadMessageById(
    organizationId: string,
    id: string,
  ): Promise<MailMessage> {
    const rows = await db
      .select()
      .from(mailMessages)
      .where(
        and(
          eq(mailMessages.id, id),
          eq(mailMessages.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new MailMessageNotFound(id);
    return rows[0];
  }

  function assertVisible(msg: MailMessage, now: Date): void {
    if (msg.revokedAt) throw new MailRevoked(msg.id);
    if (msg.expiresAt && msg.expiresAt.getTime() <= now.getTime()) {
      throw new MailExpired(msg.id);
    }
  }

  function assertTargeted(msg: MailMessage, endUserId: string): void {
    if (msg.targetType === "broadcast") return;
    const list = msg.targetUserIds ?? [];
    if (!list.includes(endUserId)) throw new MailNotTargeted(msg.id);
  }

  async function loadStats(
    messageId: string,
  ): Promise<{ readCount: number; claimCount: number }> {
    const [stats] = await db
      .select({
        readCount: sql<number>`count(*) filter (where ${mailUserStates.readAt} is not null)`.mapWith(
          Number,
        ),
        claimCount: sql<number>`count(*) filter (where ${mailUserStates.claimedAt} is not null)`.mapWith(
          Number,
        ),
      })
      .from(mailUserStates)
      .where(eq(mailUserStates.messageId, messageId));
    return {
      readCount: stats?.readCount ?? 0,
      claimCount: stats?.claimCount ?? 0,
    };
  }

  return {
    // ─── Admin / programmatic — create ─────────────────────────

    /**
     * Create a mail message (broadcast or multicast).
     *
     * When `originSource` / `originSourceId` are provided the call becomes
     * idempotent against the partial unique index
     * `(organizationId, origin_source, origin_source_id)`: retried calls
     * return the existing row instead of inserting a second one.
     *
     * `senderAdminId` is optional audit metadata — null for system-triggered
     * sends (task completion, activity settlement, order refund…).
     */
    async createMessage(
      organizationId: string,
      input: ProgrammaticCreateMailInput,
    ): Promise<MailMessage> {
      validateCreateTargeting(input);
      validateOriginPair(input);

      const rewards: RewardEntry[] = input.rewards ?? [];
      const targetUserIds =
        input.targetType === "multicast" ? input.targetUserIds! : null;
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

      // Idempotency path: if origin pair is provided, return the existing
      // row for retries. The partial unique index is the ultimate gate, but
      // checking first lets us return the already-created mail without a
      // constraint-violation round-trip.
      if (input.originSource && input.originSourceId) {
        const existing = await db
          .select()
          .from(mailMessages)
          .where(
            and(
              eq(mailMessages.organizationId, organizationId),
              eq(mailMessages.originSource, input.originSource),
              eq(mailMessages.originSourceId, input.originSourceId),
            ),
          )
          .limit(1);
        if (existing[0]) return existing[0];
      }

      try {
        const [row] = await db
          .insert(mailMessages)
          .values({
            organizationId,
            title: input.title,
            content: input.content,
            rewards,
            targetType: input.targetType,
            targetUserIds,
            requireRead: input.requireRead ?? false,
            senderAdminId: input.senderAdminId ?? null,
            expiresAt,
            originSource: input.originSource ?? null,
            originSourceId: input.originSourceId ?? null,
          })
          .returning();
        if (!row) throw new Error("mail insert returned no row");
        return row;
      } catch (err) {
        // Lost a race with a concurrent programmatic send that had the same
        // origin pair. Re-read and return.
        if (
          isUniqueViolation(err) &&
          input.originSource &&
          input.originSourceId
        ) {
          const existing = await db
            .select()
            .from(mailMessages)
            .where(
              and(
                eq(mailMessages.organizationId, organizationId),
                eq(mailMessages.originSource, input.originSource),
                eq(mailMessages.originSourceId, input.originSourceId),
              ),
            )
            .limit(1);
          if (existing[0]) return existing[0];
        }
        throw err;
      }
    },

    /**
     * Shorthand for a single-recipient mail. `originSource` and
     * `originSourceId` are required — unicast is almost always driven by an
     * external event (task completion, order refund…) and needs idempotency.
     */
    async sendUnicast(
      organizationId: string,
      endUserId: string,
      input: UnicastInput,
    ): Promise<MailMessage> {
      return this.createMessage(organizationId, {
        ...input,
        targetType: "multicast",
        targetUserIds: [endUserId],
      });
    },

    // ─── Admin — list / get / revoke / delete ──────────────────

    async listMessages(
      organizationId: string,
      query: { limit?: number; cursor?: string; targetType?: MailTargetType },
    ): Promise<{ items: MailMessage[]; nextCursor: string | null }> {
      const limit = query.limit ?? 50;
      const cursorDate = query.cursor ? new Date(query.cursor) : null;

      const conditions = [eq(mailMessages.organizationId, organizationId)];
      if (query.targetType) {
        conditions.push(eq(mailMessages.targetType, query.targetType));
      }
      if (cursorDate) {
        conditions.push(sql`${mailMessages.sentAt} < ${cursorDate}`);
      }

      const rows = await db
        .select()
        .from(mailMessages)
        .where(and(...conditions))
        .orderBy(desc(mailMessages.sentAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore
        ? items[items.length - 1]!.sentAt.toISOString()
        : null;

      return { items, nextCursor };
    },

    async getMessage(
      organizationId: string,
      id: string,
    ): Promise<MailMessageWithStats> {
      const msg = await loadMessageById(organizationId, id);
      const stats = await loadStats(id);
      return {
        ...msg,
        readCount: stats.readCount,
        claimCount: stats.claimCount,
        targetCount:
          msg.targetType === "multicast" ? msg.targetUserIds?.length ?? 0 : null,
      };
    },

    /** Soft delete — hides from inboxes, preserves audit trail. */
    async revokeMessage(organizationId: string, id: string): Promise<void> {
      const [row] = await db
        .update(mailMessages)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(mailMessages.id, id),
            eq(mailMessages.organizationId, organizationId),
            isNull(mailMessages.revokedAt),
          ),
        )
        .returning({ id: mailMessages.id });
      if (!row) {
        // Either the message doesn't exist, doesn't belong to the org, or is
        // already revoked. Distinguish by re-reading.
        await loadMessageById(organizationId, id);
        // exists → already revoked; make that idempotent by succeeding silently
      }
    },

    async deleteMessage(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(mailMessages)
        .where(
          and(
            eq(mailMessages.id, id),
            eq(mailMessages.organizationId, organizationId),
          ),
        )
        .returning({ id: mailMessages.id });
      if (deleted.length === 0) throw new MailMessageNotFound(id);
    },

    // ─── Client — inbox + interactions ────────────────────────

    /**
     * List the user's inbox.
     *
     * Filters:
     *   - not revoked
     *   - not expired (or expiresAt null)
     *   - broadcast: `m.sentAt >= since` if `since` supplied
     *   - multicast: `targetUserIds @> [endUserId]` (GIN index accelerates)
     *
     * Returns messages in reverse-chronological `sentAt` order, joined with
     * this user's read/claim state (nulls when no state row exists yet).
     */
    async listInbox(
      organizationId: string,
      endUserId: string,
      query: { since?: Date; limit?: number },
    ): Promise<{ items: InboxMessage[] }> {
      const limit = query.limit ?? 50;
      const now = new Date();

      const rows = await db
        .select({
          id: mailMessages.id,
          title: mailMessages.title,
          content: mailMessages.content,
          rewards: mailMessages.rewards,
          requireRead: mailMessages.requireRead,
          sentAt: mailMessages.sentAt,
          expiresAt: mailMessages.expiresAt,
          readAt: mailUserStates.readAt,
          claimedAt: mailUserStates.claimedAt,
        })
        .from(mailMessages)
        .leftJoin(
          mailUserStates,
          and(
            eq(mailUserStates.messageId, mailMessages.id),
            eq(mailUserStates.endUserId, endUserId),
          ),
        )
        .where(
          and(
            eq(mailMessages.organizationId, organizationId),
            isNull(mailMessages.revokedAt),
            or(isNull(mailMessages.expiresAt), gt(mailMessages.expiresAt, now)),
            or(
              // broadcast branch
              and(
                eq(mailMessages.targetType, "broadcast"),
                query.since
                  ? gte(mailMessages.sentAt, query.since)
                  : sql`true`,
              ),
              // multicast branch: GIN-accelerated jsonb containment
              and(
                eq(mailMessages.targetType, "multicast"),
                sql`${mailMessages.targetUserIds} @> ${JSON.stringify([endUserId])}::jsonb`,
              ),
            ),
          ),
        )
        .orderBy(desc(mailMessages.sentAt))
        .limit(limit);

      return { items: rows };
    },

    /**
     * Fetch a single inbox message — does NOT auto-mark as read.
     * Frontends that want read-on-open call POST /read explicitly.
     */
    async getInboxMessage(
      organizationId: string,
      endUserId: string,
      id: string,
    ): Promise<InboxMessage> {
      const msg = await loadMessageById(organizationId, id);
      assertVisible(msg, new Date());
      assertTargeted(msg, endUserId);

      const states = await db
        .select()
        .from(mailUserStates)
        .where(
          and(
            eq(mailUserStates.messageId, id),
            eq(mailUserStates.endUserId, endUserId),
          ),
        )
        .limit(1);

      const state = states[0];
      return {
        id: msg.id,
        title: msg.title,
        content: msg.content,
        rewards: msg.rewards,
        requireRead: msg.requireRead,
        sentAt: msg.sentAt,
        expiresAt: msg.expiresAt,
        readAt: state?.readAt ?? null,
        claimedAt: state?.claimedAt ?? null,
      };
    },

    /**
     * Mark the mail as read. Idempotent — only the first call sets `readAt`;
     * subsequent calls return the existing row unchanged.
     */
    async markRead(
      organizationId: string,
      endUserId: string,
      messageId: string,
    ): Promise<MailUserState> {
      const msg = await loadMessageById(organizationId, messageId);
      assertVisible(msg, new Date());
      assertTargeted(msg, endUserId);

      const now = new Date();
      const upserted = await db
        .insert(mailUserStates)
        .values({
          messageId,
          endUserId,
          organizationId,
          readAt: now,
        })
        .onConflictDoUpdate({
          target: [mailUserStates.messageId, mailUserStates.endUserId],
          set: { readAt: now },
          setWhere: isNull(mailUserStates.readAt),
        })
        .returning();

      if (upserted[0]) return upserted[0];

      // setWhere failed (already read). Re-read to return current state.
      const rows = await db
        .select()
        .from(mailUserStates)
        .where(
          and(
            eq(mailUserStates.messageId, messageId),
            eq(mailUserStates.endUserId, endUserId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new Error(
          "mail markRead upsert returned 0 rows but row is also missing on refetch",
        );
      }
      return rows[0];
    },

    /**
     * Claim rewards. See file-header claim-concurrency note.
     *
     * Short-circuits if `item_grant_logs` already has a row for
     * `("mail_claim", "${messageId}:${endUserId}")` — protects against the
     * case where a previous claim marked `claimedAt` and granted items, and
     * the user retries; we surface the cached rewards without re-granting.
     */
    async claim(
      organizationId: string,
      endUserId: string,
      messageId: string,
    ): Promise<ClaimResult> {
      const msg = await loadMessageById(organizationId, messageId);
      assertVisible(msg, new Date());
      assertTargeted(msg, endUserId);

      const sourceId = grantSourceId(messageId, endUserId);

      // Idempotency short-circuit: if a grant_log already exists we've
      // already granted. Pair it with the existing mail_user_states row to
      // return a consistent ClaimResult.
      const priorGrant = await db
        .select({ id: itemGrantLogs.id })
        .from(itemGrantLogs)
        .where(
          and(
            eq(itemGrantLogs.organizationId, organizationId),
            eq(itemGrantLogs.endUserId, endUserId),
            eq(itemGrantLogs.source, CLAIM_SOURCE),
            eq(itemGrantLogs.sourceId, sourceId),
          ),
        )
        .limit(1);

      if (priorGrant.length > 0) {
        // Whether this call or a prior one wrote the state row, the user
        // has already been credited. Throw the structured "already" error
        // so the client doesn't double-count UI feedback.
        throw new MailAlreadyClaimed(messageId);
      }

      const now = new Date();

      // Conditional upsert: winner sets claimedAt now, loser gets 0 rows.
      // For requireRead mails, we ALSO require readAt to be non-null.
      const setWhere = msg.requireRead
        ? and(
            isNull(mailUserStates.claimedAt),
            sql`${mailUserStates.readAt} IS NOT NULL`,
          )
        : isNull(mailUserStates.claimedAt);

      // On fresh insert for a requireRead mail, we cannot claim unless the
      // row already exists with a readAt — a brand-new state row has
      // readAt=null. So for requireRead, INSERT values must NOT set
      // claimedAt (it'd succeed without having been read). Instead, the
      // INSERT just creates a claimed-but-unread row? No — that would bypass
      // the gate. Fix: for requireRead, ONLY the ON CONFLICT DO UPDATE
      // branch can set claimedAt (row must already exist from markRead).
      // We achieve this by inserting with claimedAt = null when requireRead,
      // then letting the setWhere above decide the UPDATE path.
      const insertClaimedAt = msg.requireRead ? null : now;

      const upserted = await db
        .insert(mailUserStates)
        .values({
          messageId,
          endUserId,
          organizationId,
          readAt: null,
          claimedAt: insertClaimedAt,
        })
        .onConflictDoUpdate({
          target: [mailUserStates.messageId, mailUserStates.endUserId],
          set: { claimedAt: now },
          setWhere,
        })
        .returning();

      let state: MailUserState | undefined = upserted[0];

      // Three cases to disambiguate when setWhere yielded 0 rows on conflict:
      //   a) INSERT succeeded (no conflict) AND we're on a non-requireRead
      //      mail → claimedAt=now, state exists.
      //   b) INSERT succeeded for a requireRead mail → claimedAt=null, we
      //      shouldn't have granted; treat as MustReadFirst.
      //   c) INSERT conflicted AND setWhere failed → already claimed or
      //      not-yet-read. Re-read to distinguish.
      if (state && state.claimedAt === null) {
        // Case (b): requireRead path created a fresh state row without
        // marking claim. Leave that row in place (effectively pre-populates
        // so a follow-up markRead+claim works) and report MustReadFirst.
        throw new MailMustReadFirst(messageId);
      }

      if (!state) {
        // Case (c): re-read to decide.
        const rows = await db
          .select()
          .from(mailUserStates)
          .where(
            and(
              eq(mailUserStates.messageId, messageId),
              eq(mailUserStates.endUserId, endUserId),
            ),
          )
          .limit(1);
        const current = rows[0];
        if (!current) {
          throw new Error(
            "mail claim upsert returned 0 rows but row is also missing on refetch",
          );
        }
        if (current.claimedAt) throw new MailAlreadyClaimed(messageId);
        if (msg.requireRead && !current.readAt) {
          throw new MailMustReadFirst(messageId);
        }
        // Shouldn't reach here — setWhere would have matched.
        throw new MailAlreadyClaimed(messageId);
      }

      // We won the claim. Grant rewards.
      if (msg.rewards.length > 0) {
        await itemSvc.grantItems({
          organizationId,
          endUserId,
          grants: msg.rewards,
          source: CLAIM_SOURCE,
          sourceId,
        });
      }

      return {
        messageId,
        endUserId,
        rewards: msg.rewards,
        claimedAt: state.claimedAt!,
        readAt: state.readAt,
      };
    },
  };
}

export type MailService = ReturnType<typeof createMailService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
