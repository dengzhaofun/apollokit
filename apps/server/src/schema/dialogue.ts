import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  DialogueNode,
  DialogueTriggerCondition,
} from "../modules/dialogue/types";
import { team } from "./auth";

/**
 * Dialogue scripts — one row per authored dialogue "scene".
 *
 * The entire node graph is stored as jsonb. Node counts are typically
 * small (< 50) and the graph is read as a unit by the client on each
 * interaction, so normalizing into dialogue_nodes / dialogue_options
 * tables would add JOIN cost without operational payoff.
 *
 * Client API resolves scripts by alias only; scripts without an alias
 * are drafts (admins can author privately, publish by setting alias).
 * Mirrors the publish-gate pattern used by banner_groups.
 *
 * Graph validation (startNodeId exists, all `next` targets exist, node
 * ids unique, option rewards point to known item definitions) happens
 * in the service layer on every write.
 */
export const dialogueScripts = pgTable(
  "dialogue_scripts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    startNodeId: text("start_node_id").notNull(),
    nodes: jsonb("nodes").$type<DialogueNode[]>().notNull(),
    /**
     * Optional declarative trigger for when the client should auto-play
     * this script. Shape is reserved — service layer does not act on it
     * yet; clients may use it as a hint.
     */
    triggerCondition: jsonb("trigger_condition").$type<
      DialogueTriggerCondition
    >(),
    /**
     * When true, players may call /reset to replay. When false, calling
     * /reset returns 409. Unrelated scripts are always independent —
     * `repeatable` is per-script.
     */
    repeatable: boolean("repeatable").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("dialogue_scripts_tenant_idx").on(table.tenantId),
    uniqueIndex("dialogue_scripts_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Dialogue progress — one row per (organization, endUser, script) tuple.
 *
 * `currentNodeId` null + `completedAt` non-null = user finished the
 * script. `currentNodeId` non-null = in progress (the node the user is
 * currently viewing; last entry of `historyPath` equals currentNodeId).
 *
 * Reset (when `repeatable=true`) is an UPDATE that sets currentNodeId
 * back to startNodeId, clears historyPath, and nulls completedAt —
 * NOT a delete-then-insert, so the PK never changes and audit trails
 * (via item grant logs) remain attached to the same row.
 *
 * The unique constraint on (org, endUser, script) is what makes the
 * upsert in `start()` safe without transactions.
 */
export const dialogueProgress = pgTable(
  "dialogue_progress",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    endUserId: text("end_user_id").notNull(),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => dialogueScripts.id, { onDelete: "cascade" }),
    currentNodeId: text("current_node_id"),
    historyPath: jsonb("history_path")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("dialogue_progress_org_user_script_uidx").on(
      table.tenantId,
      table.endUserId,
      table.scriptId,
    ),
    index("dialogue_progress_tenant_user_idx").on(
      table.tenantId,
      table.endUserId,
    ),
  ],
);

