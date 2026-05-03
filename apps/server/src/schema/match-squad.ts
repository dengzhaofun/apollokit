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

import { team } from "./auth";

/**
 * Match-squad configs — per-organization squad-mode configurations.
 *
 * Different game modes (2v2, 3v3, 5v5) need different squad sizes, so
 * this uses the multi-config pattern with alias-based publish gate.
 *
 * NOTE: this is the *game match-making squad* concept (short-lived
 * player groups during a session), not a tenant project. Better Auth's
 * `team` table — which means "project" in our admin UI — lives in
 * schema/auth.ts.
 */
export const matchSquadConfigs = pgTable(
  "match_squad_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
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
    index("match_squad_configs_tenant_idx").on(table.tenantId),
    uniqueIndex("match_squad_configs_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Match squads — ephemeral squads created by end users.
 *
 * Squads are short-lived (dissolve after game/session ends).
 * `memberCount` is a denormalized counter updated atomically via
 * version-guarded writes.
 *
 * Status: 'open' (accepting joins) → 'closed' | 'in_game' → 'dissolved'.
 */
export const matchSquads = pgTable(
  "match_squads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    configId: uuid("config_id")
      .notNull()
      .references(() => matchSquadConfigs.id, { onDelete: "cascade" }),
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
    index("match_squads_tenant_config_status_idx").on(
      table.tenantId,
      table.configId,
      table.status,
    ),
    index("match_squads_tenant_leader_idx").on(
      table.tenantId,
      table.configId,
      table.leaderUserId,
    ),
  ],
);

/**
 * Match-squad members — membership records. One-squad-at-a-time per
 * configId is enforced at the service layer.
 */
export const matchSquadMembers = pgTable(
  "match_squad_members",
  {
    squadId: uuid("squad_id")
      .notNull()
      .references(() => matchSquads.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.squadId, table.endUserId],
      name: "match_squad_members_pk",
    }),
    index("match_squad_members_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
  ],
);

/**
 * Match-squad invitations — invitations to join a squad.
 *
 * Short-lived (60s expiry typical). Partial unique index prevents
 * duplicate pending invitations to the same user for the same squad.
 */
export const matchSquadInvitations = pgTable(
  "match_squad_invitations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    squadId: uuid("squad_id")
      .notNull()
      .references(() => matchSquads.id, { onDelete: "cascade" }),
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
    index("match_squad_invitations_squad_status_idx").on(
      table.squadId,
      table.status,
    ),
    index("match_squad_invitations_tenant_to_status_idx").on(
      table.tenantId,
      table.toUserId,
      table.status,
    ),
    uniqueIndex("match_squad_invitations_pending_uidx")
      .on(table.squadId, table.toUserId)
      .where(sql`${table.status} = 'pending'`),
  ],
);
