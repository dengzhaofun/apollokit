import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * Friend settings — per-organization configuration for the friend system.
 *
 * Each organization has at most one row. Settings control friend limits,
 * block limits, and pending request caps. The unique index on organizationId
 * enforces the one-row-per-org invariant.
 */
export const friendSettings = pgTable(
  "friend_settings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    maxFriends: integer("max_friends").default(50).notNull(),
    maxBlocked: integer("max_blocked").default(50).notNull(),
    maxPendingRequests: integer("max_pending_requests").default(20).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("friend_settings_org_uidx").on(table.organizationId),
  ],
);

/**
 * Friend relationships — accepted friendships between two end users.
 *
 * Each friendship is stored as a SINGLE row with a lexicographic invariant:
 * userA < userB (string comparison). This avoids double-row storage and
 * simplifies mutual-friend queries. The unique index on (org, userA, userB)
 * prevents duplicate friendships.
 */
export const friendRelationships = pgTable(
  "friend_relationships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    userA: text("user_a").notNull(),
    userB: text("user_b").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_relationships_org_pair_uidx").on(
      table.organizationId,
      table.userA,
      table.userB,
    ),
    index("friend_relationships_org_user_a_idx").on(
      table.organizationId,
      table.userA,
    ),
    index("friend_relationships_org_user_b_idx").on(
      table.organizationId,
      table.userB,
    ),
  ],
);

/**
 * Friend requests — pending, accepted, rejected, or cancelled friend requests.
 *
 * State machine: pending → accepted | rejected | cancelled.
 * The partial unique index on (org, from, to) WHERE status='pending' prevents
 * duplicate pending requests between the same pair.
 */
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    status: text("status").default("pending").notNull(),
    message: text("message"),
    respondedAt: timestamp("responded_at"),
    expiresAt: timestamp("expires_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("friend_requests_org_to_status_idx").on(
      table.organizationId,
      table.toUserId,
      table.status,
    ),
    index("friend_requests_org_from_status_idx").on(
      table.organizationId,
      table.fromUserId,
      table.status,
    ),
    uniqueIndex("friend_requests_pending_pair_uidx")
      .on(table.organizationId, table.fromUserId, table.toUserId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Friend blocks — unidirectional block list.
 *
 * When user A blocks user B, A cannot receive requests from B, and any
 * existing friendship is removed. Blocking is one-way: A blocking B does
 * not mean B blocks A.
 */
export const friendBlocks = pgTable(
  "friend_blocks",
  {
    organizationId: text("organization_id").notNull(),
    blockerUserId: text("blocker_user_id").notNull(),
    blockedUserId: text("blocked_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.blockerUserId, table.blockedUserId],
      name: "friend_blocks_pk",
    }),
    index("friend_blocks_org_blocker_idx").on(
      table.organizationId,
      table.blockerUserId,
    ),
    index("friend_blocks_org_blocked_idx").on(
      table.organizationId,
      table.blockedUserId,
    ),
  ],
);
