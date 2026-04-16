import { sql } from "drizzle-orm";
import {
  boolean,
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
 * Friend gift settings — per-organization gifting configuration.
 *
 * Each organization has at most one row. Controls daily send/receive
 * limits and the timezone for daily reset boundary.
 */
export const friendGiftSettings = pgTable(
  "friend_gift_settings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    dailySendLimit: integer("daily_send_limit").default(5).notNull(),
    dailyReceiveLimit: integer("daily_receive_limit").default(10).notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("friend_gift_settings_org_uidx").on(table.organizationId),
  ],
);

/**
 * Friend gift packages — predefined gift templates configured by admins.
 *
 * Each package defines what items are deducted from the sender when gifted.
 * Uses the alias pattern for publish gate.
 */
export const friendGiftPackages = pgTable(
  "friend_gift_packages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    giftItems: jsonb("gift_items")
      .$type<{ definitionId: string; quantity: number }[]>()
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("friend_gift_packages_org_idx").on(table.organizationId),
    uniqueIndex("friend_gift_packages_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Friend gift sends — individual gift send records.
 *
 * State machine: pending → claimed | expired | cancelled.
 * `giftItems` is a snapshot of what was gifted (in case the package
 * definition changes after sending).
 */
export const friendGiftSends = pgTable(
  "friend_gift_sends",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    packageId: uuid("package_id").references(() => friendGiftPackages.id, {
      onDelete: "set null",
    }),
    senderUserId: text("sender_user_id").notNull(),
    receiverUserId: text("receiver_user_id").notNull(),
    giftItems: jsonb("gift_items")
      .$type<{ definitionId: string; quantity: number }[]>()
      .notNull(),
    status: text("status").default("pending").notNull(),
    claimedAt: timestamp("claimed_at"),
    expiresAt: timestamp("expires_at"),
    message: text("message"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("friend_gift_sends_org_sender_idx").on(
      table.organizationId,
      table.senderUserId,
      table.createdAt,
    ),
    index("friend_gift_sends_org_receiver_status_idx").on(
      table.organizationId,
      table.receiverUserId,
      table.status,
    ),
  ],
);

/**
 * Friend gift daily states — per-user daily send/receive counters.
 *
 * `dateKey` is 'YYYY-MM-DD' in the settings timezone. The composite PK
 * ensures one row per (org, user, day). Version column supports atomic
 * increment with optimistic concurrency.
 */
export const friendGiftDailyStates = pgTable(
  "friend_gift_daily_states",
  {
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    dateKey: text("date_key").notNull(),
    sendCount: integer("send_count").default(0).notNull(),
    receiveCount: integer("receive_count").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.endUserId, table.dateKey],
      name: "friend_gift_daily_states_pk",
    }),
  ],
);
