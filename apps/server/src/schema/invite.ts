import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/**
 * 邀请系统租户级配置。每个 org 至多一行；没有行时 service 层返回默认值。
 */
export const inviteSettings = pgTable(
  "invite_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    codeLength: integer("code_length").default(8).notNull(),
    allowSelfInvite: boolean("allow_self_invite").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // codeLength ∈ {4, 8, 12, 16, 20, 24}
    check(
      "invite_settings_code_length_check",
      sql`${table.codeLength} >= 4 AND ${table.codeLength} <= 24 AND ${table.codeLength} % 4 = 0`,
    ),
  ],
);

/**
 * 邀请码 —— 一人一码，仅存当前 active。
 *
 * reset 语义 = UPDATE code + rotated_at；不保留历史。
 * 已存在的 invite_relationships 通过 inviter_code_snapshot 保留绑定时的码。
 */
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    code: text("code").notNull(),
    rotatedAt: timestamp("rotated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 一人一码
    uniqueIndex("invite_codes_org_user_uidx").on(
      table.organizationId,
      table.endUserId,
    ),
    // 码在租户内唯一（跨租户可重）
    uniqueIndex("invite_codes_org_code_uidx").on(
      table.organizationId,
      table.code,
    ),
  ],
);

/**
 * 邀请关系 —— bind 建立、qualify 推进。
 *
 * UNIQUE (org, invitee_end_user_id) 是强约束：一个被邀人全租户内只能被邀一次。
 * 自邀防护完全放 service 层（因为 settings.allowSelfInvite=true 时需要允许
 * inviter === invitee，DB 层 CHECK 会硬挡）。
 */
export const inviteRelationships = pgTable(
  "invite_relationships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    inviterEndUserId: text("inviter_end_user_id").notNull(),
    inviteeEndUserId: text("invitee_end_user_id").notNull(),
    inviterCodeSnapshot: text("inviter_code_snapshot").notNull(),
    boundAt: timestamp("bound_at").defaultNow().notNull(),
    qualifiedAt: timestamp("qualified_at"),
    qualifiedReason: text("qualified_reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("invite_relationships_org_invitee_uidx").on(
      table.organizationId,
      table.inviteeEndUserId,
    ),
    index("invite_relationships_org_inviter_bound_idx").on(
      table.organizationId,
      table.inviterEndUserId,
      table.boundAt,
    ),
  ],
);
