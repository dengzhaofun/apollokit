import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * Mail messages — one row per mail send (broadcast / multicast / unicast).
 *
 * A "message" is the canonical mail payload. It carries title, content,
 * an optional reward list (`ItemEntry[]`, same canonical shape as check-in
 * and exchange rewards), and targeting metadata. Individual per-user
 * interaction state (read / claimed) is stored in `mail_user_states`,
 * written lazily only when a user actually interacts — this avoids the
 * fan-out write amplification of materializing one row per user per
 * broadcast.
 *
 * Targeting model:
 *   - `target_type = 'broadcast'` → visible to every endUserId in the org.
 *     `target_user_ids` MUST be null.
 *     Clients may pass a `since` query param to filter out broadcasts
 *     sent before the player's join time (the service layer enforces
 *     this — no state is kept here).
 *   - `target_type = 'multicast'` → visible only to the listed endUserIds.
 *     `target_user_ids` is a jsonb text[]; length 1..=5000 (5000 enforced
 *     at the validator layer, not the DB). Unicast is multicast with len=1.
 *     GIN index (`mail_messages_multicast_gin_idx`) accelerates the
 *     `@>` containment query used in inbox listing.
 *
 * Lifecycle:
 *   - `expires_at` (nullable) → after this timestamp the message is
 *     hidden from inboxes and cannot be claimed. null = never expires.
 *   - `revoked_at` (nullable) → soft delete; non-null immediately hides
 *     the message from unclaimed recipients while preserving audit
 *     records in `item_grant_logs` for users that already claimed.
 *
 * Programmatic-send idempotency:
 *   Other modules (activity settlement, task completion, order refund…)
 *   call `mailService.createMessage(...)` or `sendUnicast(...)` with an
 *   `(origin_source, origin_source_id)` pair. A partial unique index
 *   ensures the same external event never produces two mails — retried
 *   webhooks / queue redeliveries are safe. Admin-initiated sends leave
 *   both columns null and bypass this constraint.
 *
 * Reward redemption idempotency:
 *   Reuses `itemService.grantItems` with `(source, sourceId) =
 *   ("mail_claim", "${messageId}:${endUserId}")`. The existing
 *   `item_grant_logs` table is the ultimate dedup key across both
 *   modules — no mail-specific grant log needed.
 */
export const mailMessages = pgTable(
  "mail_messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    rewards: jsonb("rewards").$type<RewardEntry[]>().notNull(),
    // 'broadcast' | 'multicast' — Zod enum at validator layer
    targetType: text("target_type").notNull(),
    // text[] serialized as jsonb; null for broadcasts
    targetUserIds: jsonb("target_user_ids").$type<string[]>(),
    requireRead: boolean("require_read").default(false).notNull(),
    // Better Auth admin user.id — null when system-triggered
    senderAdminId: text("sender_admin_id"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    // Programmatic-send idempotency pair; both must be non-null together
    originSource: text("origin_source"),
    originSourceId: text("origin_source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("mail_messages_org_sent_idx").on(
      table.organizationId,
      table.sentAt,
    ),
    index("mail_messages_org_expires_idx").on(
      table.organizationId,
      table.expiresAt,
    ),
    // GIN on jsonb targetUserIds — accelerates `@>` containment lookups
    // for multicast inbox queries. Partial so broadcast rows (null) don't
    // bloat the index.
    index("mail_messages_multicast_gin_idx")
      .using("gin", table.targetUserIds)
      .where(sql`${table.targetType} = 'multicast'`),
    // Programmatic-send idempotency — partial unique. admin manual sends
    // have NULL origin_source and bypass this constraint.
    uniqueIndex("mail_messages_origin_uidx")
      .on(table.organizationId, table.originSource, table.originSourceId)
      .where(sql`${table.originSource} IS NOT NULL`),
  ],
);

/**
 * Mail user states — (message × endUser) interaction rows, written lazily.
 *
 * A row exists only once the user has actually read or claimed. Absent
 * row == not read, not claimed. Composite PK (message_id, end_user_id).
 *
 * `end_user_id` is the SaaS customer's business user id — opaque text,
 * NOT a foreign key. See apps/server/CLAUDE.md § "The two userIds".
 *
 * Concurrency for the /claim path is handled by a single atomic
 * `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE claimed_at IS NULL`
 * in `mailService.claim`. The conditional WHERE serializes concurrent
 * callers — losers get zero rows returned and branch to a re-read to
 * distinguish "already claimed" vs "must read first".
 */
export const mailUserStates = pgTable(
  "mail_user_states",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => mailMessages.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    readAt: timestamp("read_at"),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.messageId, table.endUserId],
      name: "mail_user_states_pk",
    }),
    index("mail_user_states_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);
