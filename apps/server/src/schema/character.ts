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

import { team } from "./auth";

/**
 * Character definitions — the master catalog of NPC / dialogue speakers
 * that an org owns.
 *
 * Referenced by `dialogue_scripts.nodes[*].speaker.characterId` (soft
 * reference from inside jsonb — no FK). The dialogue service validates
 * the reference on every write and re-reads the character row at request
 * time so that renaming a character or swapping its avatar takes effect
 * on the next `/start` / `/advance` call without any script-level edit.
 *
 * `alias` is an optional human-readable handle for import/export flows;
 * internal references (dialogue speakers, future mail senders, etc.) all
 * use the uuid `id`. Pattern mirrors `item_definitions` and
 * `dialogue_scripts`: partial unique index on (org, alias) WHERE alias
 * IS NOT NULL lets multiple characters coexist without an alias.
 *
 * No C-end client routes — characters are authored in admin and surface
 * to the client only indirectly, flattened into the dialogue response
 * payload.
 */
export const characterDefinitions = pgTable(
  "character_definitions",
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
    /** Small headshot shown beside dialogue bubbles. */
    avatarUrl: text("avatar_url"),
    /** Optional full-body portrait / standing image, for cut-in shots. */
    portraitUrl: text("portrait_url"),
    /**
     * Suggested side ("left"/"right") for authoring defaults. The
     * dialogue speaker still carries its own `side`; this column is a
     * convenience hint for admin UIs that want to pre-fill one.
     */
    defaultSide: text("default_side"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("character_definitions_tenant_idx").on(table.tenantId),
    uniqueIndex("character_definitions_tenant_alias_uidx")
      .on(table.tenantId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);
