/**
 * CDKey / redemption-code schema.
 *
 * Four tables, semantics recap:
 *
 * - cdkey_batches           — one row per activity (universal or unique)
 * - cdkey_codes             — the actual code strings
 *                             universal batch: exactly 1 row per batch
 *                             unique batch:    N rows (one per generated code)
 * - cdkey_user_states       — per-(batch, endUser) counter used to enforce
 *                             perUserLimit on universal batches (unique batches
 *                             don't populate this)
 * - cdkey_redemption_logs   — immutable audit trail + idempotency guard via
 *                             UNIQUE (organization_id, source, source_id)
 *
 * Atomic-SQL/no-transactions conventions follow the check-in / exchange
 * modules — see apps/server/CLAUDE.md.
 */

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

import type { RewardEntry } from "../lib/rewards";
import { organization } from "./auth";

/**
 * cdkey_batches — a redemption-code activity.
 *
 * `codeType` drives all downstream behavior:
 *   - 'universal': one shared code string; can be redeemed by many users,
 *                  capped by `totalLimit` and `perUserLimit`.
 *   - 'unique'   : one code per row in cdkey_codes; each redeemable at most
 *                  once. `perUserLimit` is effectively 1 and is not enforced
 *                  across codes within the same batch (MVP).
 *
 * `reward` is a jsonb ItemEntry[] consumed by itemService.grantItems().
 */
export const cdkeyBatches = pgTable(
  "cdkey_batches",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    codeType: text("code_type").notNull(), // 'universal' | 'unique'
    reward: jsonb("reward").$type<RewardEntry[]>().notNull(),
    totalLimit: integer("total_limit"),
    perUserLimit: integer("per_user_limit").default(1).notNull(),
    totalRedeemed: integer("total_redeemed").default(0).notNull(),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("cdkey_batches_org_idx").on(table.organizationId),
    uniqueIndex("cdkey_batches_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * cdkey_codes — the actual redemption strings.
 *
 * Life-cycle differs by batch.codeType:
 *   - universal: status transitions 'active' → 'revoked'; `redeemedBy` /
 *                `redeemedAt` stay null. Exactly one row per batch.
 *   - unique   : status transitions 'pending' → 'redeemed' | 'revoked';
 *                on success `redeemedBy` / `redeemedAt` are set.
 *
 * `(organization_id, code)` is globally unique per tenant so lookup by
 * user-entered string is O(1) and the redeem path doesn't branch on codeType
 * until after the row is loaded.
 */
export const cdkeyCodes = pgTable(
  "cdkey_codes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => cdkeyBatches.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull(), // see life-cycle above
    redeemedBy: text("redeemed_by"),
    redeemedAt: timestamp("redeemed_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cdkey_codes_org_code_uidx").on(
      table.organizationId,
      table.code,
    ),
    index("cdkey_codes_batch_status_idx").on(table.batchId, table.status),
    index("cdkey_codes_redeemed_by_idx")
      .on(table.redeemedBy)
      .where(sql`${table.redeemedBy} IS NOT NULL`),
  ],
);

/**
 * cdkey_user_states — per-(batch, endUser) redemption counter.
 *
 * Only populated for universal batches. Enforces `perUserLimit` via an
 * atomic upsert with a conditional WHERE on `count < per_user_limit`.
 */
export const cdkeyUserStates = pgTable(
  "cdkey_user_states",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => cdkeyBatches.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    count: integer("count").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.batchId, table.endUserId],
      name: "cdkey_user_states_pk",
    }),
    index("cdkey_user_states_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);

/**
 * cdkey_redemption_logs — immutable audit + idempotency guard.
 *
 * One row per redeem attempt. `UNIQUE (organization_id, source, source_id)`
 * is the idempotency key — a repeated (source, sourceId) either hits a
 * pre-existing `success` row (return cached result) or `failed` row
 * (retry legitimate, since caller explicitly asked to retry).
 *
 * NOTE: we also rely on itemService's own grant_log idempotency keyed on
 * (source='cdkey', sourceId=<idempotencyKey>) as a second line of defense.
 */
export const cdkeyRedemptionLogs = pgTable(
  "cdkey_redemption_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    codeId: uuid("code_id"),
    code: text("code").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull(), // 'pending' | 'success' | 'failed'
    failReason: text("fail_reason"),
    reward: jsonb("reward").$type<RewardEntry[] | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cdkey_redemption_logs_source_uidx").on(
      table.organizationId,
      table.source,
      table.sourceId,
    ),
    index("cdkey_redemption_logs_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
    index("cdkey_redemption_logs_org_batch_idx").on(
      table.organizationId,
      table.batchId,
    ),
  ],
);
