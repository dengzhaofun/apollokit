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
 * Team configs — per-organization team configurations (multiple allowed).
 *
 * Different game modes (2v2, 3v3, 5v5) need different team sizes, so
 * this uses the multi-config pattern with alias-based publish gate.
 */
export const teamConfigs = pgTable(
  "team_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    maxMembers: integer("max_members").default(4).notNull(),
    autoDissolveOnLeaderLeave: boolean("auto_dissolve_on_leader_leave")
      .default(false)
      .notNull(),
    allowQuickMatch: boolean("allow_quick_match").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("team_configs_org_idx").on(table.organizationId),
    uniqueIndex("team_configs_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Team instances — ephemeral teams created by end users.
 *
 * Teams are short-lived (dissolve after game/session ends). `memberCount`
 * is a denormalized counter updated atomically via version-guarded writes.
 *
 * Status: 'open' (accepting joins) → 'closed' | 'in_game' → 'dissolved'.
 */
export const teamTeams = pgTable(
  "team_teams",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    configId: uuid("config_id")
      .notNull()
      .references(() => teamConfigs.id, { onDelete: "cascade" }),
    leaderUserId: text("leader_user_id").notNull(),
    status: text("status").default("open").notNull(),
    memberCount: integer("member_count").default(1).notNull(),
    dissolvedAt: timestamp("dissolved_at"),
    version: integer("version").default(1).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("team_teams_org_config_status_idx").on(
      table.organizationId,
      table.configId,
      table.status,
    ),
    index("team_teams_org_leader_idx").on(
      table.organizationId,
      table.configId,
      table.leaderUserId,
    ),
  ],
);

/**
 * Team members — membership records. One-team-at-a-time per configId
 * is enforced at the service layer.
 */
export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teamTeams.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.teamId, table.endUserId],
      name: "team_members_pk",
    }),
    index("team_members_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * Team invitations — invitations to join a team.
 *
 * Short-lived (60s expiry typical). Partial unique index prevents
 * duplicate pending invitations to the same user for the same team.
 */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teamTeams.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("team_invitations_team_status_idx").on(
      table.teamId,
      table.status,
    ),
    index("team_invitations_org_to_status_idx").on(
      table.organizationId,
      table.toUserId,
      table.status,
    ),
    uniqueIndex("team_invitations_pending_uidx")
      .on(table.teamId, table.toUserId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
