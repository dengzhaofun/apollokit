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

import type { ItemEntry } from "../modules/item/types";
import { organization } from "./auth";
import { itemDefinitions } from "./item";

/**
 * Collection (图鉴) module — tenant-configurable "Pokedex"-style galleries.
 *
 * Hierarchy:
 *   Album    (a compendium, e.g. "Hero Book")
 *     └─ Group  (optional chapter/subdivision)
 *           └─ Entry  (one card, what a player unlocks)
 *
 *   Milestone  (reward node, attaches at any of album/group/entry scope)
 *
 * Per-player state:
 *   collection_user_entries      — which entries this endUser has unlocked
 *   collection_user_milestones   — which milestone rewards have been claimed
 *
 * Design notes:
 *
 * 1. Unlock is event-driven: `itemService.grantItems` emits a hook that
 *    maps granted item definitions → matching entries → inserts into
 *    collection_user_entries with `ON CONFLICT DO NOTHING`. A client
 *    `sync` endpoint provides fallback reconciliation from inventory.
 *
 * 2. A single item can unlock multiple entries (N:M via the
 *    triggerItemDefinitionId column + reverse index). "Fire Dragon" may
 *    appear in both "Dragons" and "Fire Element" albums.
 *
 * 3. Milestones unify three reward layers in one table keyed by `scope`:
 *      - 'entry'  + threshold=1  → per-entry first-unlock reward
 *      - 'group'  + threshold=N  → collect N entries within a group
 *      - 'album'  + threshold=N  → collect N entries across the album
 *
 * 4. Reward delivery:
 *      - autoClaim=false → player taps "claim" in the app → `grantItems`
 *        writes directly into inventory, keyed idempotently by
 *        (milestoneId, endUserId) in collection_user_milestones.
 *      - autoClaim=true  → threshold-reached triggers `mailService.sendUnicast`
 *        with origin=('collection.milestone', milestoneId + ':' + endUserId)
 *        as the mail-layer idempotency key; the player claims rewards from
 *        the inbox. We do NOT recursively call grantItems inside the
 *        grantItems hook.
 *
 * 5. No season/activity window fields for MVP — if that's later required,
 *    we'll add start_at / end_at with a migration.
 *
 * 6. `collection_user_entries` is NOT pre-populated for every user×entry
 *    pair. Rows appear only on unlock, so table size is O(total unlocks).
 */

/**
 * Albums — the top-level gallery. One org owns many albums.
 *
 * `alias` is an optional human-readable key, unique per org (partial index
 * — NULL aliases don't conflict with each other).
 *
 * `scope` is a free-form classification tag ('hero' / 'monster' /
 * 'equipment' / 'custom') used by the UI; it does not drive any server
 * behavior.
 */
export const collectionAlbums = pgTable(
  "collection_albums",
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
    coverImage: text("cover_image"),
    icon: text("icon"),
    scope: text("scope").default("custom").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("collection_albums_org_idx").on(table.organizationId),
    uniqueIndex("collection_albums_org_alias_uidx")
      .on(table.organizationId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Groups — optional chapters inside an album.
 *
 * `organizationId` is denormalized here (and on other child tables) so
 * the admin UI can filter by tenant without traversing back to the
 * album row. ON DELETE CASCADE from the album keeps it consistent.
 */
export const collectionGroups = pgTable(
  "collection_groups",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    albumId: uuid("album_id")
      .notNull()
      .references(() => collectionAlbums.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("collection_groups_album_idx").on(table.albumId, table.sortOrder),
    index("collection_groups_org_idx").on(table.organizationId),
  ],
);

/**
 * Entries — the cards a player unlocks.
 *
 * `groupId` is nullable — entries may sit directly under an album with
 * no grouping.
 *
 * `triggerType` is currently only 'item' (MVP). The enum is retained so
 * a future 'event' type (behavior-log-driven unlocks, e.g. "defeat boss
 * N times") can be added without a migration. When triggerType='item',
 * `triggerItemDefinitionId` is required; `triggerQuantity` is the
 * minimum quantity the player must own (inventory aggregate) to unlock.
 *
 * `hiddenUntilUnlocked` drives server-side redaction in the client API —
 * unlocked readers see full details; locked readers see '???'.
 *
 * The `(organizationId, triggerItemDefinitionId)` index supports the
 * hot reverse lookup performed by `collectionService.onItemGranted`:
 * given a set of newly-granted definition IDs, fetch all entries that
 * should light up.
 */
export const collectionEntries = pgTable(
  "collection_entries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    albumId: uuid("album_id")
      .notNull()
      .references(() => collectionAlbums.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => collectionGroups.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").notNull(),
    alias: text("alias"),
    name: text("name").notNull(),
    description: text("description"),
    image: text("image"),
    rarity: text("rarity"),
    sortOrder: integer("sort_order").default(0).notNull(),
    hiddenUntilUnlocked: boolean("hidden_until_unlocked")
      .default(false)
      .notNull(),
    triggerType: text("trigger_type").default("item").notNull(),
    triggerItemDefinitionId: uuid("trigger_item_definition_id").references(
      () => itemDefinitions.id,
      { onDelete: "set null" },
    ),
    triggerQuantity: integer("trigger_quantity").default(1).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("collection_entries_album_group_idx").on(
      table.albumId,
      table.groupId,
      table.sortOrder,
    ),
    index("collection_entries_org_trigger_idx").on(
      table.organizationId,
      table.triggerItemDefinitionId,
    ),
    uniqueIndex("collection_entries_album_alias_uidx")
      .on(table.albumId, table.alias)
      .where(sql`${table.alias} IS NOT NULL`),
  ],
);

/**
 * Milestones — unified reward nodes across three scopes.
 *
 * `scope='entry'`  → grant on first unlock of a specific entry (threshold=1)
 * `scope='group'`  → grant when N entries unlocked in a group
 * `scope='album'`  → grant when N entries unlocked across the album
 *
 * Foreign-key consistency: `groupId` must be set iff scope='group';
 * `entryId` must be set iff scope='entry'. Enforced in the service layer
 * (cross-column CHECK constraints in Postgres are verbose and awkward
 * to maintain via drizzle-kit).
 *
 * `rewardItems` reuses the canonical `ItemEntry[]` shape already used by
 * check-in, exchange, and mail rewards — same validator, same renderer.
 *
 * `autoClaim`:
 *   - false (default) → player must tap "claim" → writes to
 *     collection_user_milestones + grantItems directly to inventory.
 *   - true            → threshold-reached path sends a mail unicast with
 *     rewardItems attached; player claims via the mail inbox.
 */
export const collectionMilestones = pgTable(
  "collection_milestones",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => collectionAlbums.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    groupId: uuid("group_id").references(() => collectionGroups.id, {
      onDelete: "cascade",
    }),
    entryId: uuid("entry_id").references(() => collectionEntries.id, {
      onDelete: "cascade",
    }),
    threshold: integer("threshold").default(1).notNull(),
    label: text("label"),
    rewardItems: jsonb("reward_items").$type<ItemEntry[]>().notNull(),
    autoClaim: boolean("auto_claim").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("collection_milestones_album_scope_idx").on(
      table.albumId,
      table.scope,
      table.threshold,
    ),
    index("collection_milestones_org_idx").on(table.organizationId),
  ],
);

/**
 * Per-user entry unlock state — one row per (entry, endUser) tuple.
 *
 * Only rows for unlocked entries exist; "locked" state is the absence of
 * a row. This avoids a user × entry Cartesian product in storage.
 *
 * `albumId` is denormalized so the "list of unlocked entries for this
 * user in this album" query is a single-table scan with an index hit.
 *
 * `endUserId` is the SaaS customer's business user id — opaque text,
 * NOT a foreign key, never named `user_id`. See apps/server/CLAUDE.md.
 */
export const collectionUserEntries = pgTable(
  "collection_user_entries",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => collectionEntries.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    albumId: uuid("album_id").notNull(),
    unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
    source: text("source"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.entryId, table.endUserId],
      name: "collection_user_entries_pk",
    }),
    index("collection_user_entries_org_user_album_idx").on(
      table.organizationId,
      table.endUserId,
      table.albumId,
    ),
  ],
);

/**
 * Per-user milestone claim state — one row per (milestone, endUser)
 * when the milestone has been claimed (manual) or dispatched to mail
 * (autoClaim). Presence of a row means "this milestone has been
 * processed for this user".
 *
 * Inserted with `ON CONFLICT DO NOTHING` as the idempotency gate for
 * both manual claim and autoClaim mail dispatch.
 */
export const collectionUserMilestones = pgTable(
  "collection_user_milestones",
  {
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => collectionMilestones.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    albumId: uuid("album_id").notNull(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
    deliveryMode: text("delivery_mode").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.milestoneId, table.endUserId],
      name: "collection_user_milestones_pk",
    }),
    index("collection_user_milestones_org_user_idx").on(
      table.organizationId,
      table.endUserId,
    ),
  ],
);
