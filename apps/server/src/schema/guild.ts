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
import { sql } from "drizzle-orm";

import { organization } from "./auth";

/**
 * Guild settings — per-organization configuration for the guild system.
 *
 * Each organization has at most one row. Controls default member caps,
 * officer limits, creation costs, level-up rules, and default join mode.
 */
export const guildSettings = pgTable(
  "guild_settings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    maxMembers: integer("max_members").default(50).notNull(),
    maxOfficers: integer("max_officers").default(5).notNull(),
    createCost: jsonb("create_cost").$type<{ definitionId: string; quantity: number }[]>().default([]).notNull(),
    levelUpRules: jsonb("level_up_rules").$type<{ level: number; expRequired: number; memberCapBonus: number }[]>(),
    joinMode: text("join_mode").default("request").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("guild_settings_org_uidx").on(table.organizationId),
  ],
);

/**
 * Guild instances — individual guilds created by end users.
 *
 * `memberCount` is a denormalized counter updated atomically via
 * version-guarded single statements. `maxMembers` starts at the
 * guild_settings default and can increase via level-up bonuses.
 */
export const guildGuilds = pgTable(
  "guild_guilds",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    announcement: text("announcement"),
    leaderUserId: text("leader_user_id").notNull(),
    level: integer("level").default(1).notNull(),
    experience: integer("experience").default(0).notNull(),
    memberCount: integer("member_count").default(1).notNull(),
    maxMembers: integer("max_members").default(50).notNull(),
    joinMode: text("join_mode").default("request").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    disbandedAt: timestamp("disbanded_at"),
    version: integer("version").default(1).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("guild_guilds_org_idx").on(table.organizationId),
    index("guild_guilds_org_leader_idx").on(
      table.organizationId,
      table.leaderUserId,
    ),
    index("guild_guilds_org_name_idx").on(
      table.organizationId,
      table.name,
    ),
  ],
);

/**
 * Guild members — membership records linking end users to guilds.
 *
 * Roles: 'leader', 'officer', 'member'. One-guild-per-user-per-org
 * is enforced at the service layer (not by a unique index, since
 * we need to check guild.isActive via a join).
 */
export const guildMembers = pgTable(
  "guild_members",
  {
    guildId: uuid("guild_id")
      .notNull()
      .references(() => guildGuilds.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: text("role").default("member").notNull(),
    contribution: integer("contribution").default(0).notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.guildId, table.endUserId],
      name: "guild_members_pk",
    }),
    index("guild_members_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Guild join requests — applications to join or invitations from officers/leader.
 *
 * `type`: 'application' (user applies) or 'invitation' (guild invites).
 * State machine: pending → accepted | rejected | cancelled.
 * Partial unique index prevents duplicate pending requests of the same type.
 */
export const guildJoinRequests = pgTable(
  "guild_join_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    guildId: uuid("guild_id")
      .notNull()
      .references(() => guildGuilds.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    type: text("type").notNull(),
    status: text("status").default("pending").notNull(),
    invitedBy: text("invited_by"),
    message: text("message"),
    respondedAt: timestamp("responded_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("guild_join_requests_guild_status_idx").on(
      table.guildId,
      table.status,
    ),
    index("guild_join_requests_org_user_status_idx").on(
      table.organizationId,
      table.endUserId,
      table.status,
    ),
    uniqueIndex("guild_join_requests_pending_uidx")
      .on(table.guildId, table.endUserId, table.type)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Guild contribution logs — audit trail for contribution and guild XP changes.
 *
 * `source` + `sourceId` pair enables idempotency checks.
 */
export const guildContributionLogs = pgTable(
  "guild_contribution_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    guildId: uuid("guild_id")
      .notNull()
      .references(() => guildGuilds.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    delta: integer("delta").notNull(),
    guildExpDelta: integer("guild_exp_delta").default(0).notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("guild_contribution_logs_guild_user_idx").on(
      table.guildId,
      table.endUserId,
    ),
    index("guild_contribution_logs_source_idx").on(
      table.source,
      table.sourceId,
    ),
  ],
);
