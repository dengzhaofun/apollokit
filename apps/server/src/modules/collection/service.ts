/**
 * Collection service — protocol-agnostic business logic for the "图鉴"
 * (Pokedex / compendium) module.
 *
 * This file MUST NOT import Hono or any HTTP concepts. Its only view of
 * the outside world is a typed `AppDeps` object. The service factory
 * declares what it needs with `Pick<AppDeps, ...>`.
 *
 * ---------------------------------------------------------------------
 * Unlock propagation: how `grantItems` lights up entries
 * ---------------------------------------------------------------------
 *
 * `itemService.grantItems` calls `onItemGranted(...)` at the tail of its
 * write path. We:
 *
 *   1. Short-circuit if the source itself is a collection milestone —
 *      preventing infinite recursion in the manual-claim path that goes
 *      grantItems → hook → milestone check → grantItems.
 *
 *   2. Fetch all collection_entries matching any granted definitionId,
 *      in a single IN query, scoped to this org.
 *
 *   3. For each candidate entry, ensure the player actually has enough
 *      quantity to satisfy `triggerQuantity` — most of the time this is
 *      1 and the grant itself suffices, but if triggerQuantity>1 we run
 *      a SUM over item_inventories. (Non-stackables are multi-row per
 *      def; stackables are a single singleton row — SUM handles both.)
 *
 *   4. Insert into collection_user_entries with `ON CONFLICT DO NOTHING`.
 *      Only the inserted ids are "newly unlocked" — that set drives the
 *      milestone check in step 5.
 *
 *   5. For each newly unlocked entry, evaluate the three possible
 *      milestone scopes:
 *         - 'entry'  pointing to this entry (threshold fixed at 1)
 *         - 'group'  pointing to this entry's group (if any)
 *         - 'album'  owning this entry
 *      Count unlocked rows and compare to threshold. For milestones that
 *      crossed the threshold AND have autoClaim=true, we go through the
 *      "autoClaim" pipeline in step 6.
 *
 *   6. autoClaim delivery is mail, not direct grant:
 *        a. INSERT into collection_user_milestones ON CONFLICT DO NOTHING
 *           — the primary idempotency gate. Only the inserter proceeds.
 *        b. mailService.sendUnicast with
 *           origin=('collection.milestone', milestoneId+':'+endUserId) —
 *           the mail module also has a partial unique index on the origin
 *           pair, so this is a second idempotency layer.
 *      We do NOT call `grantItems` here — the player receives rewards by
 *      claiming the mail, which goes through mail's own `grantItems(source=
 *      'mail_claim')`. That path is safe with respect to our source
 *      whitelist short-circuit in step 1.
 *
 *   7. Any failure inside onItemGranted is swallowed with a logger call.
 *      Collection hiccups must NEVER cause the main grantItems to roll
 *      back. The `sync` / `rescan` paths provide compensation.
 *
 * ---------------------------------------------------------------------
 * Single-statement writes
 * ---------------------------------------------------------------------
 *
 * Every write path is a single atomic SQL statement. Unlock writes and
 * milestone claim writes both use
 *   INSERT ... ON CONFLICT (pk) DO NOTHING RETURNING *, (xmax = 0) AS inserted
 * — the inserter takes the branch that sends mail / grants rewards, the
 * loser sees `inserted=false` and reports "already done".
 */

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import { type MoveBody, appendKey, moveAndReturn } from "../../lib/fractional-order";
import { looksLikeId } from "../../lib/key-resolver";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  collectionAlbums,
  collectionEntries,
  collectionGroups,
  collectionMilestones,
  collectionUserEntries,
  collectionUserMilestones,
} from "../../schema/collection";
import { itemDefinitions, itemInventories } from "../../schema/item";
import type { RewardEntry } from "../../lib/rewards";
import type { MailService } from "../mail/service";
import {
  CollectionAlbumNotFound,
  CollectionAliasConflict,
  CollectionEntryNotFound,
  CollectionGroupNotFound,
  CollectionInvalidInput,
  CollectionMilestoneAlreadyClaimed,
  CollectionMilestoneAutoOnly,
  CollectionMilestoneNotFound,
  CollectionMilestoneNotReached,
} from "./errors";
import type {
  CollectionAlbum,
  CollectionEntry,
  CollectionGroup,
  CollectionMilestone,
  CollectionUserEntry,
  CollectionUserMilestone,
  DeliveryMode,
} from "./types";
import { MILESTONE_SCOPES } from "./types";
import { logger } from "../../lib/logger";
import type {
  CreateAlbumInput,
  CreateEntryInput,
  CreateGroupInput,
  CreateMilestoneInput,
  UpdateAlbumInput,
  UpdateEntryInput,
  UpdateGroupInput,
  UpdateMilestoneInput,
} from "./validators";

// `events` optional to keep `createCollectionService({ db }, ...)` test
// sites compiling.
type CollectionDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with collection-domain events.
// Task / achievement systems can subscribe to react to new unlocks /
// milestone claims.
declare module "../../lib/event-bus" {
  interface EventMap {
    "collection.entry_unlocked": {
      tenantId: string;
      endUserId: string;
      albumId: string;
      entryIds: string[];
      source: string;
    };
    "collection.milestone_claimed": {
      tenantId: string;
      endUserId: string;
      albumId: string;
      milestoneId: string;
    };
  }
}

export type ItemSvc = {
  grantItems: (params: {
    tenantId: string;
    endUserId: string;
    grants: Array<{ type?: string; id: string; count: number } | { definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }) => Promise<unknown>;
};

/**
 * Origin prefix for any `source` that originates from this module. The
 * `onItemGranted` hook short-circuits on this prefix to avoid recursion
 * when a manual milestone claim calls `grantItems` which would otherwise
 * re-enter the hook.
 */
const SOURCE_PREFIX = "collection.";
const MILESTONE_SOURCE = `${SOURCE_PREFIX}milestone`;

type GrantHookEntry = { type?: string; id: string; count: number } | { definitionId: string; quantity: number };

export function createCollectionService(
  d: CollectionDeps,
  itemSvc: ItemSvc,
  mailSvcGetter: () => MailService | undefined,
) {
  const { events } = d;
  const { db } = d;

  // ─── Load helpers ─────────────────────────────────────────────

  async function loadAlbumByKey(
    tenantId: string,
    key: string,
  ): Promise<CollectionAlbum> {
    const where = looksLikeId(key)
      ? and(
          eq(collectionAlbums.tenantId, tenantId),
          eq(collectionAlbums.id, key),
        )
      : and(
          eq(collectionAlbums.tenantId, tenantId),
          eq(collectionAlbums.alias, key),
        );
    const rows = await db.select().from(collectionAlbums).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new CollectionAlbumNotFound(key);
    return row;
  }

  async function loadGroupById(
    tenantId: string,
    id: string,
  ): Promise<CollectionGroup> {
    const rows = await db
      .select()
      .from(collectionGroups)
      .where(
        and(
          eq(collectionGroups.tenantId, tenantId),
          eq(collectionGroups.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new CollectionGroupNotFound(id);
    return row;
  }

  async function loadEntryById(
    tenantId: string,
    id: string,
  ): Promise<CollectionEntry> {
    const rows = await db
      .select()
      .from(collectionEntries)
      .where(
        and(
          eq(collectionEntries.tenantId, tenantId),
          eq(collectionEntries.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new CollectionEntryNotFound(id);
    return row;
  }

  async function loadMilestoneById(
    tenantId: string,
    id: string,
  ): Promise<CollectionMilestone> {
    const rows = await db
      .select()
      .from(collectionMilestones)
      .where(
        and(
          eq(collectionMilestones.tenantId, tenantId),
          eq(collectionMilestones.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new CollectionMilestoneNotFound(id);
    return row;
  }

  // ─── Album CRUD ───────────────────────────────────────────────

  async function createAlbum(
    tenantId: string,
    input: CreateAlbumInput,
  ): Promise<CollectionAlbum> {
    try {
      const __sortKey = await appendKey(db, { table: collectionAlbums, sortColumn: collectionAlbums.sortOrder, scopeWhere: eq(collectionAlbums.tenantId, tenantId)! });
      const [row] = await db
        .insert(collectionAlbums)
        .values({
          tenantId,
          name: input.name,
          alias: input.alias ?? null,
          description: input.description ?? null,
          coverImage: input.coverImage ?? null,
          icon: input.icon ?? null,
          scope: input.scope ?? "custom",
          sortOrder: __sortKey,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new CollectionAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function updateAlbum(
    tenantId: string,
    id: string,
    patch: UpdateAlbumInput,
  ): Promise<CollectionAlbum> {
    const existing = await loadAlbumByKey(tenantId, id);
    const values: Partial<typeof collectionAlbums.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.coverImage !== undefined) values.coverImage = patch.coverImage;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.scope !== undefined) values.scope = patch.scope;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) return existing;

    try {
      const [row] = await db
        .update(collectionAlbums)
        .set(values)
        .where(
          and(
            eq(collectionAlbums.id, existing.id),
            eq(collectionAlbums.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new CollectionAlbumNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new CollectionAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function moveAlbum(
    tenantId: string,
    key: string,
    body: MoveBody,
  ): Promise<CollectionAlbum> {
    const existing = await loadAlbumByKey(tenantId, key);
    return moveAndReturn<CollectionAlbum>(db, {
      table: collectionAlbums,
      sortColumn: collectionAlbums.sortOrder,
      idColumn: collectionAlbums.id,
      partitionWhere: eq(collectionAlbums.tenantId, tenantId)!,
      id: existing.id,
      body,
      notFound: (sid) => new CollectionAlbumNotFound(sid),
    });
  }

  async function deleteAlbum(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(collectionAlbums)
      .where(
        and(
          eq(collectionAlbums.id, id),
          eq(collectionAlbums.tenantId, tenantId),
        ),
      )
      .returning({ id: collectionAlbums.id });
    if (deleted.length === 0) throw new CollectionAlbumNotFound(id);
  }

  async function listAlbums(
    tenantId: string,
    params: PageParams = {},
  ): Promise<Page<CollectionAlbum>> {
    const limit = clampLimit(params.limit);
    const conds: SQL[] = [eq(collectionAlbums.tenantId, tenantId)];
    const seek = cursorWhere(params.cursor, collectionAlbums.createdAt, collectionAlbums.id);
    if (seek) conds.push(seek);
    if (params.q) {
      const pat = `%${params.q}%`;
      const search = or(ilike(collectionAlbums.name, pat), ilike(collectionAlbums.alias, pat));
      if (search) conds.push(search);
    }
    const rows = await db
      .select()
      .from(collectionAlbums)
      .where(and(...conds))
      .orderBy(asc(collectionAlbums.sortOrder), asc(collectionAlbums.createdAt))
      .limit(limit + 1);
    return buildPage(rows, limit);
  }

  async function getAlbum(
    tenantId: string,
    key: string,
  ): Promise<CollectionAlbum> {
    return loadAlbumByKey(tenantId, key);
  }

  // ─── Group CRUD ───────────────────────────────────────────────

  async function createGroup(
    tenantId: string,
    albumKey: string,
    input: CreateGroupInput,
  ): Promise<CollectionGroup> {
    const album = await loadAlbumByKey(tenantId, albumKey);
    const __sortKey = await appendKey(db, { table: collectionGroups, sortColumn: collectionGroups.sortOrder, scopeWhere: eq(collectionGroups.tenantId, tenantId)! });
    const [row] = await db
      .insert(collectionGroups)
      .values({
        albumId: album.id,
        tenantId,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        sortOrder: __sortKey,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  async function updateGroup(
    tenantId: string,
    id: string,
    patch: UpdateGroupInput,
  ): Promise<CollectionGroup> {
    const values: Partial<typeof collectionGroups.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.icon !== undefined) values.icon = patch.icon;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) {
      return loadGroupById(tenantId, id);
    }

    const [row] = await db
      .update(collectionGroups)
      .set(values)
      .where(
        and(
          eq(collectionGroups.id, id),
          eq(collectionGroups.tenantId, tenantId),
        ),
      )
      .returning();
    if (!row) throw new CollectionGroupNotFound(id);
    return row;
  }

  async function moveGroup(
    tenantId: string,
    id: string,
    body: MoveBody,
  ): Promise<CollectionGroup> {
    const existing = await loadGroupById(tenantId, id);
    return moveAndReturn<CollectionGroup>(db, {
      table: collectionGroups,
      sortColumn: collectionGroups.sortOrder,
      idColumn: collectionGroups.id,
      partitionWhere: and(
        eq(collectionGroups.tenantId, tenantId),
        eq(collectionGroups.albumId, existing.albumId),
      )!,
      id: existing.id,
      body,
      notFound: (sid) => new CollectionGroupNotFound(sid),
    });
  }

  async function deleteGroup(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(collectionGroups)
      .where(
        and(
          eq(collectionGroups.id, id),
          eq(collectionGroups.tenantId, tenantId),
        ),
      )
      .returning({ id: collectionGroups.id });
    if (deleted.length === 0) throw new CollectionGroupNotFound(id);
  }

  async function listGroups(
    tenantId: string,
    albumKey: string,
  ): Promise<CollectionGroup[]> {
    const album = await loadAlbumByKey(tenantId, albumKey);
    return db
      .select()
      .from(collectionGroups)
      .where(eq(collectionGroups.albumId, album.id))
      .orderBy(collectionGroups.sortOrder, desc(collectionGroups.createdAt));
  }

  // ─── Entry CRUD ───────────────────────────────────────────────

  async function assertGroupInAlbum(
    tenantId: string,
    albumId: string,
    groupId: string,
  ): Promise<void> {
    const g = await loadGroupById(tenantId, groupId);
    if (g.albumId !== albumId) {
      throw new CollectionInvalidInput(
        `group ${groupId} does not belong to album ${albumId}`,
      );
    }
  }

  async function assertItemDefinitionInOrg(
    tenantId: string,
    defId: string,
  ): Promise<void> {
    const rows = await db
      .select({ id: itemDefinitions.id })
      .from(itemDefinitions)
      .where(
        and(
          eq(itemDefinitions.id, defId),
          eq(itemDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new CollectionInvalidInput(
        `item definition not found in this project: ${defId}`,
      );
    }
  }

  async function createEntry(
    tenantId: string,
    albumKey: string,
    input: CreateEntryInput,
  ): Promise<CollectionEntry> {
    const album = await loadAlbumByKey(tenantId, albumKey);
    if (input.groupId) {
      await assertGroupInAlbum(tenantId, album.id, input.groupId);
    }
    if (input.triggerItemDefinitionId) {
      await assertItemDefinitionInOrg(
        tenantId,
        input.triggerItemDefinitionId,
      );
    }

    try {
      const __sortKey = await appendKey(db, { table: collectionEntries, sortColumn: collectionEntries.sortOrder, scopeWhere: eq(collectionEntries.tenantId, tenantId)! });
      const [row] = await db
        .insert(collectionEntries)
        .values({
          albumId: album.id,
          groupId: input.groupId ?? null,
          tenantId,
          alias: input.alias ?? null,
          name: input.name,
          description: input.description ?? null,
          image: input.image ?? null,
          rarity: input.rarity ?? null,
          sortOrder: __sortKey,
          hiddenUntilUnlocked: input.hiddenUntilUnlocked ?? false,
          triggerType: input.triggerType ?? "item",
          triggerItemDefinitionId: input.triggerItemDefinitionId ?? null,
          triggerQuantity: input.triggerQuantity ?? 1,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && input.alias) {
        throw new CollectionAliasConflict(input.alias);
      }
      throw err;
    }
  }

  async function bulkCreateEntries(
    tenantId: string,
    albumKey: string,
    inputs: CreateEntryInput[],
  ): Promise<CollectionEntry[]> {
    // Simple sequential approach to preserve per-row validation + alias
    // conflict reporting. 500-entry cap is enforced in the zod schema.
    const result: CollectionEntry[] = [];
    for (const input of inputs) {
      result.push(await createEntry(tenantId, albumKey, input));
    }
    return result;
  }

  async function updateEntry(
    tenantId: string,
    id: string,
    patch: UpdateEntryInput,
  ): Promise<CollectionEntry> {
    const existing = await loadEntryById(tenantId, id);
    if (patch.groupId !== undefined && patch.groupId !== null) {
      await assertGroupInAlbum(tenantId, existing.albumId, patch.groupId);
    }
    if (patch.triggerItemDefinitionId) {
      await assertItemDefinitionInOrg(
        tenantId,
        patch.triggerItemDefinitionId,
      );
    }

    const values: Partial<typeof collectionEntries.$inferInsert> = {};
    if (patch.groupId !== undefined) values.groupId = patch.groupId;
    if (patch.alias !== undefined) values.alias = patch.alias;
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.image !== undefined) values.image = patch.image;
    if (patch.rarity !== undefined) values.rarity = patch.rarity;
    if (patch.hiddenUntilUnlocked !== undefined)
      values.hiddenUntilUnlocked = patch.hiddenUntilUnlocked;
    if (patch.triggerType !== undefined) values.triggerType = patch.triggerType;
    if (patch.triggerItemDefinitionId !== undefined)
      values.triggerItemDefinitionId = patch.triggerItemDefinitionId;
    if (patch.triggerQuantity !== undefined)
      values.triggerQuantity = patch.triggerQuantity;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) return existing;

    try {
      const [row] = await db
        .update(collectionEntries)
        .set(values)
        .where(
          and(
            eq(collectionEntries.id, existing.id),
            eq(collectionEntries.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) throw new CollectionEntryNotFound(id);
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && patch.alias) {
        throw new CollectionAliasConflict(patch.alias);
      }
      throw err;
    }
  }

  async function moveEntry(
    tenantId: string,
    id: string,
    body: MoveBody,
  ): Promise<CollectionEntry> {
    const existing = await loadEntryById(tenantId, id);
    // Scope by (albumId, groupId) — entries can sit directly under an album
    // (groupId = null) or in a specific group, both are independent partitions.
    const partitionWhere = existing.groupId
      ? and(
          eq(collectionEntries.tenantId, tenantId),
          eq(collectionEntries.albumId, existing.albumId),
          eq(collectionEntries.groupId, existing.groupId),
        )!
      : and(
          eq(collectionEntries.tenantId, tenantId),
          eq(collectionEntries.albumId, existing.albumId),
          isNull(collectionEntries.groupId),
        )!;
    return moveAndReturn<CollectionEntry>(db, {
      table: collectionEntries,
      sortColumn: collectionEntries.sortOrder,
      idColumn: collectionEntries.id,
      partitionWhere,
      id: existing.id,
      body,
      notFound: (sid) => new CollectionEntryNotFound(sid),
    });
  }

  async function deleteEntry(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(collectionEntries)
      .where(
        and(
          eq(collectionEntries.id, id),
          eq(collectionEntries.tenantId, tenantId),
        ),
      )
      .returning({ id: collectionEntries.id });
    if (deleted.length === 0) throw new CollectionEntryNotFound(id);
  }

  async function listEntries(
    tenantId: string,
    albumKey: string,
    filter?: { groupId?: string | null },
  ): Promise<CollectionEntry[]> {
    const album = await loadAlbumByKey(tenantId, albumKey);
    const where = [eq(collectionEntries.albumId, album.id)];
    if (filter?.groupId === null) {
      where.push(isNull(collectionEntries.groupId));
    } else if (filter?.groupId) {
      where.push(eq(collectionEntries.groupId, filter.groupId));
    }
    return db
      .select()
      .from(collectionEntries)
      .where(and(...where))
      .orderBy(collectionEntries.sortOrder, desc(collectionEntries.createdAt));
  }

  // ─── Milestone CRUD ───────────────────────────────────────────

  async function createMilestone(
    tenantId: string,
    albumKey: string,
    input: CreateMilestoneInput,
  ): Promise<CollectionMilestone> {
    const album = await loadAlbumByKey(tenantId, albumKey);

    // Scope-level FK consistency (zod already checked which field must be
    // present/absent; we additionally verify the referenced row is in the
    // same album + org).
    if (input.scope === "entry") {
      const entry = await loadEntryById(tenantId, input.entryId!);
      if (entry.albumId !== album.id) {
        throw new CollectionInvalidInput(
          "milestone entry must belong to the album",
        );
      }
    } else if (input.scope === "group") {
      const group = await loadGroupById(tenantId, input.groupId!);
      if (group.albumId !== album.id) {
        throw new CollectionInvalidInput(
          "milestone group must belong to the album",
        );
      }
    }

    // Entry-scope milestones have an implicit threshold of 1 — collecting
    // a specific entry once is the event. For group/album we default to 1
    // if the caller omitted it but clamp to positive (zod already does).
    const threshold =
      input.scope === "entry" ? 1 : Math.max(1, input.threshold ?? 1);

    const __sortKey = await appendKey(db, { table: collectionMilestones, sortColumn: collectionMilestones.sortOrder, scopeWhere: eq(collectionMilestones.tenantId, tenantId)! });
    const [row] = await db
      .insert(collectionMilestones)
      .values({
        tenantId,
        albumId: album.id,
        scope: input.scope,
        groupId: input.scope === "group" ? input.groupId! : null,
        entryId: input.scope === "entry" ? input.entryId! : null,
        threshold,
        label: input.label ?? null,
        rewardItems: input.rewardItems,
        autoClaim: input.autoClaim ?? false,
        sortOrder: __sortKey,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  async function updateMilestone(
    tenantId: string,
    id: string,
    patch: UpdateMilestoneInput,
  ): Promise<CollectionMilestone> {
    const existing = await loadMilestoneById(tenantId, id);
    const values: Partial<typeof collectionMilestones.$inferInsert> = {};
    if (patch.threshold !== undefined) {
      // 'entry' scope is forever threshold=1 regardless of what the caller
      // sends — otherwise autoClaim + hook logic loses its simplifying
      // assumption.
      values.threshold = existing.scope === "entry" ? 1 : patch.threshold;
    }
    if (patch.label !== undefined) values.label = patch.label;
    if (patch.rewardItems !== undefined) values.rewardItems = patch.rewardItems;
    if (patch.autoClaim !== undefined) values.autoClaim = patch.autoClaim;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;

    if (Object.keys(values).length === 0) return existing;

    const [row] = await db
      .update(collectionMilestones)
      .set(values)
      .where(
        and(
          eq(collectionMilestones.id, existing.id),
          eq(collectionMilestones.tenantId, tenantId),
        ),
      )
      .returning();
    if (!row) throw new CollectionMilestoneNotFound(id);
    return row;
  }

  async function moveMilestone(
    tenantId: string,
    id: string,
    body: MoveBody,
  ): Promise<CollectionMilestone> {
    const existing = await loadMilestoneById(tenantId, id);
    // Milestones partition by their attachment scope:
    //   scope='album' → (albumId only, groupId/entryId NULL)
    //   scope='group' → (albumId, groupId)
    //   scope='entry' → (albumId, entryId)
    let partitionWhere: SQL;
    if (existing.scope === "album") {
      partitionWhere = and(
        eq(collectionMilestones.tenantId, tenantId),
        eq(collectionMilestones.albumId, existing.albumId),
        eq(collectionMilestones.scope, "album"),
      )!;
    } else if (existing.scope === "group" && existing.groupId) {
      partitionWhere = and(
        eq(collectionMilestones.tenantId, tenantId),
        eq(collectionMilestones.albumId, existing.albumId),
        eq(collectionMilestones.groupId, existing.groupId),
        eq(collectionMilestones.scope, "group"),
      )!;
    } else if (existing.scope === "entry" && existing.entryId) {
      partitionWhere = and(
        eq(collectionMilestones.tenantId, tenantId),
        eq(collectionMilestones.albumId, existing.albumId),
        eq(collectionMilestones.entryId, existing.entryId),
        eq(collectionMilestones.scope, "entry"),
      )!;
    } else {
      // Fallback: org-wide scope (shouldn't happen if scope FK invariants hold)
      partitionWhere = eq(collectionMilestones.tenantId, tenantId)!;
    }
    return moveAndReturn<CollectionMilestone>(db, {
      table: collectionMilestones,
      sortColumn: collectionMilestones.sortOrder,
      idColumn: collectionMilestones.id,
      partitionWhere,
      id: existing.id,
      body,
      notFound: (sid) => new CollectionMilestoneNotFound(sid),
    });
  }

  async function deleteMilestone(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const deleted = await db
      .delete(collectionMilestones)
      .where(
        and(
          eq(collectionMilestones.id, id),
          eq(collectionMilestones.tenantId, tenantId),
        ),
      )
      .returning({ id: collectionMilestones.id });
    if (deleted.length === 0) throw new CollectionMilestoneNotFound(id);
  }

  async function listMilestones(
    tenantId: string,
    albumKey: string,
  ): Promise<CollectionMilestone[]> {
    const album = await loadAlbumByKey(tenantId, albumKey);
    return db
      .select()
      .from(collectionMilestones)
      .where(eq(collectionMilestones.albumId, album.id))
      .orderBy(
        collectionMilestones.scope,
        collectionMilestones.threshold,
        collectionMilestones.sortOrder,
      );
  }

  // ─── User progress reads ──────────────────────────────────────

  async function listUnlockedEntryIds(
    tenantId: string,
    endUserId: string,
    albumId: string,
  ): Promise<Map<string, CollectionUserEntry>> {
    const rows = await db
      .select()
      .from(collectionUserEntries)
      .where(
        and(
          eq(collectionUserEntries.tenantId, tenantId),
          eq(collectionUserEntries.endUserId, endUserId),
          eq(collectionUserEntries.albumId, albumId),
        ),
      );
    return new Map(rows.map((r) => [r.entryId, r]));
  }

  async function listClaimedMilestones(
    tenantId: string,
    endUserId: string,
    albumId: string,
  ): Promise<Map<string, CollectionUserMilestone>> {
    const rows = await db
      .select()
      .from(collectionUserMilestones)
      .where(
        and(
          eq(collectionUserMilestones.tenantId, tenantId),
          eq(collectionUserMilestones.endUserId, endUserId),
          eq(collectionUserMilestones.albumId, albumId),
        ),
      );
    return new Map(rows.map((r) => [r.milestoneId, r]));
  }

  // ─── Unlock / claim machinery ─────────────────────────────────

  /**
   * Returns the current total quantity the user owns for a definition.
   * Non-stackables contribute multiple rows; stackables one singleton row.
   */
  async function currentInventoryQuantity(
    tenantId: string,
    endUserId: string,
    definitionId: string,
  ): Promise<number> {
    const [row] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${itemInventories.quantity}), 0)`.mapWith(
          Number,
        ),
      })
      .from(itemInventories)
      .where(
        and(
          eq(itemInventories.tenantId, tenantId),
          eq(itemInventories.endUserId, endUserId),
          eq(itemInventories.definitionId, definitionId),
        ),
      );
    return row?.total ?? 0;
  }

  /**
   * Insert unlock rows for a set of (entry, endUser) tuples. Returns the
   * subset of entries that were NEWLY inserted (i.e., actually unlocked
   * on this call). On-conflict losers are silently skipped.
   */
  async function insertUnlocks(
    tenantId: string,
    endUserId: string,
    entries: CollectionEntry[],
    source: string | null,
    sourceId: string | null,
  ): Promise<CollectionEntry[]> {
    if (entries.length === 0) return [];
    const now = new Date();
    const rows = await db
      .insert(collectionUserEntries)
      .values(
        entries.map((e) => ({
          entryId: e.id,
          endUserId,
          tenantId,
          albumId: e.albumId,
          unlockedAt: now,
          source,
          sourceId,
        })),
      )
      .onConflictDoNothing({
        target: [collectionUserEntries.entryId, collectionUserEntries.endUserId],
      })
      .returning({ entryId: collectionUserEntries.entryId });
    const inserted = new Set(rows.map((r) => r.entryId));
    return entries.filter((e) => inserted.has(e.id));
  }

  /**
   * Attempt to claim a milestone. Used by:
   *   - Manual client claim API (deliveryMode = 'manual')
   *   - autoClaim hook path (deliveryMode = 'mail')
   *
   * The `collection_user_milestones` insert is the idempotency gate:
   * only the caller that actually inserts proceeds to the delivery step.
   * On conflict, returns { inserted: false, already: row }.
   */
  async function reserveMilestoneClaim(
    tenantId: string,
    endUserId: string,
    milestone: CollectionMilestone,
    deliveryMode: DeliveryMode,
    now: Date,
  ): Promise<{ inserted: boolean }> {
    const rows = await db
      .insert(collectionUserMilestones)
      .values({
        milestoneId: milestone.id,
        endUserId,
        tenantId,
        albumId: milestone.albumId,
        claimedAt: now,
        deliveryMode,
      })
      .onConflictDoNothing({
        target: [
          collectionUserMilestones.milestoneId,
          collectionUserMilestones.endUserId,
        ],
      })
      .returning({ milestoneId: collectionUserMilestones.milestoneId });
    return { inserted: rows.length > 0 };
  }

  /**
   * Count how many entries under this milestone's scope the endUser has
   * unlocked. Used by both the hook and the manual claim path to check
   * threshold.
   */
  async function countUnlockedForMilestone(
    tenantId: string,
    endUserId: string,
    milestone: CollectionMilestone,
  ): Promise<number> {
    if (milestone.scope === "entry") {
      const rows = await db
        .select({ c: sql<number>`count(*)`.mapWith(Number) })
        .from(collectionUserEntries)
        .where(
          and(
            eq(collectionUserEntries.tenantId, tenantId),
            eq(collectionUserEntries.endUserId, endUserId),
            eq(collectionUserEntries.entryId, milestone.entryId!),
          ),
        );
      return rows[0]?.c ?? 0;
    }
    if (milestone.scope === "group") {
      // Join into entries to constrain to the milestone's group.
      const rows = await db
        .select({ c: sql<number>`count(*)`.mapWith(Number) })
        .from(collectionUserEntries)
        .innerJoin(
          collectionEntries,
          eq(collectionEntries.id, collectionUserEntries.entryId),
        )
        .where(
          and(
            eq(collectionUserEntries.tenantId, tenantId),
            eq(collectionUserEntries.endUserId, endUserId),
            eq(collectionEntries.groupId, milestone.groupId!),
          ),
        );
      return rows[0]?.c ?? 0;
    }
    // album
    const rows = await db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(collectionUserEntries)
      .where(
        and(
          eq(collectionUserEntries.tenantId, tenantId),
          eq(collectionUserEntries.endUserId, endUserId),
          eq(collectionUserEntries.albumId, milestone.albumId),
        ),
      );
    return rows[0]?.c ?? 0;
  }

  /**
   * Load all milestones potentially affected by unlocking a set of
   * entries in a single album. Returns the union of:
   *   - entry-scope milestones pointing to one of the unlocked entries
   *   - group-scope milestones for any group touched
   *   - album-scope milestones for the album
   */
  async function loadAffectedMilestones(
    tenantId: string,
    albumId: string,
    unlockedEntries: CollectionEntry[],
  ): Promise<CollectionMilestone[]> {
    if (unlockedEntries.length === 0) return [];
    const groupIds = Array.from(
      new Set(
        unlockedEntries
          .map((e) => e.groupId)
          .filter((g): g is string => g !== null),
      ),
    );
    const entryIds = unlockedEntries.map((e) => e.id);

    const rows = await db
      .select()
      .from(collectionMilestones)
      .where(
        and(
          eq(collectionMilestones.tenantId, tenantId),
          eq(collectionMilestones.albumId, albumId),
        ),
      );

    return rows.filter((m) => {
      if (m.scope === "album") return true;
      if (m.scope === "group" && m.groupId && groupIds.includes(m.groupId))
        return true;
      if (m.scope === "entry" && m.entryId && entryIds.includes(m.entryId))
        return true;
      return false;
    });
  }

  // ─── The hook + sync ──────────────────────────────────────────

  /**
   * The core of the unlock pipeline. Called by itemService.grantItems
   * after the main write succeeds. Guarantees:
   *   - Never throws to the caller (errors logged only)
   *   - Idempotent: repeated calls produce no duplicate unlocks
   *   - Non-recursive: short-circuits on `collection.*` sources
   */
  async function onItemGranted(params: {
    tenantId: string;
    endUserId: string;
    grants: GrantHookEntry[];
    source: string;
    sourceId?: string | null;
  }): Promise<void> {
    try {
      if (params.source.startsWith(SOURCE_PREFIX)) return;
      if (params.grants.length === 0) return;

      const defIds = Array.from(
        new Set(
          params.grants.map((g) =>
            "definitionId" in g ? g.definitionId : g.id,
          ),
        ),
      );

      // Fetch candidate entries matching any granted def, scoped to org.
      const candidates = await db
        .select()
        .from(collectionEntries)
        .where(
          and(
            eq(collectionEntries.tenantId, params.tenantId),
            eq(collectionEntries.triggerType, "item"),
            inArray(collectionEntries.triggerItemDefinitionId, defIds),
          ),
        );
      if (candidates.length === 0) return;

      // Group by definitionId for the quantity check. Most entries will
      // have triggerQuantity=1 — cheap to skip the SUM.
      const qtyCache = new Map<string, number>();
      const eligible: CollectionEntry[] = [];
      for (const e of candidates) {
        if (!e.triggerItemDefinitionId) continue;
        if (e.triggerQuantity <= 1) {
          eligible.push(e);
          continue;
        }
        let owned = qtyCache.get(e.triggerItemDefinitionId);
        if (owned === undefined) {
          owned = await currentInventoryQuantity(
            params.tenantId,
            params.endUserId,
            e.triggerItemDefinitionId,
          );
          qtyCache.set(e.triggerItemDefinitionId, owned);
        }
        if (owned >= e.triggerQuantity) eligible.push(e);
      }
      if (eligible.length === 0) return;

      // Group eligible entries by album — unlock insert is one statement
      // per album (could be squashed but the per-album branch keeps the
      // subsequent milestone evaluation simpler).
      const byAlbum = new Map<string, CollectionEntry[]>();
      for (const e of eligible) {
        const arr = byAlbum.get(e.albumId) ?? [];
        arr.push(e);
        byAlbum.set(e.albumId, arr);
      }

      const now = new Date();
      for (const [albumId, entries] of byAlbum) {
        const newlyUnlocked = await insertUnlocks(
          params.tenantId,
          params.endUserId,
          entries,
          params.source,
          params.sourceId ?? null,
        );
        if (newlyUnlocked.length === 0) continue;

        if (events) {
          await events.emit("collection.entry_unlocked", {
            tenantId: params.tenantId,
            endUserId: params.endUserId,
            albumId,
            entryIds: newlyUnlocked.map((e) => e.id),
            source: params.source,
          });
        }

        const affected = await loadAffectedMilestones(
          params.tenantId,
          albumId,
          newlyUnlocked,
        );
        const autoMilestones = affected.filter((m) => m.autoClaim);
        if (autoMilestones.length === 0) continue;

        for (const m of autoMilestones) {
          const count = await countUnlockedForMilestone(
            params.tenantId,
            params.endUserId,
            m,
          );
          if (count < m.threshold) continue;

          const { inserted } = await reserveMilestoneClaim(
            params.tenantId,
            params.endUserId,
            m,
            "mail",
            now,
          );
          if (!inserted) continue;

          // Dispatch via mail. Mail's origin pair is a second idempotency
          // gate protecting against replays that slip the above check
          // (e.g., concurrent grant paths). Failure is caught inside the
          // outer try/catch below — it must not break the main grant.
          const mailSvc = mailSvcGetter();
          if (!mailSvc) continue;
          await mailSvc.sendUnicast(params.tenantId, params.endUserId, {
            title: `图鉴奖励：${m.label ?? m.scope}`,
            content:
              m.label ??
              `恭喜达成图鉴里程碑 (${m.scope}, 阈值 ${m.threshold})`,
            rewards: m.rewardItems,
            originSource: MILESTONE_SOURCE,
            originSourceId: `${m.id}:${params.endUserId}`,
          });
        }
      }
    } catch (err) {
      // Never let the collection hook break the main grantItems.
       
      logger.error("[collection] onItemGranted failed", {
        err,
        source: params.source,
        sourceId: params.sourceId,
      });
    }
  }

  /**
   * Fallback sync path: scan the user's inventory for entries they should
   * already have unlocked in this album, and insert any missing unlock
   * rows. Returns the list of newly unlocked entry ids.
   *
   * Does NOT trigger autoClaim mail — sync is a reconciliation tool and
   * the mail delivery path has already been attempted at grant time. Ops
   * can follow up with an Admin rescan + manual mail if needed.
   */
  async function syncFromInventory(params: {
    tenantId: string;
    endUserId: string;
    albumKey: string;
  }): Promise<CollectionEntry[]> {
    const album = await loadAlbumByKey(params.tenantId, params.albumKey);

    // Load entries in this album that are item-trigger and have a def set.
    const entries = await db
      .select()
      .from(collectionEntries)
      .where(
        and(
          eq(collectionEntries.albumId, album.id),
          eq(collectionEntries.triggerType, "item"),
        ),
      );

    const itemTriggerEntries = entries.filter((e) => e.triggerItemDefinitionId);
    if (itemTriggerEntries.length === 0) return [];

    // Aggregate the user's owned quantity per def in one pass.
    const defIds = Array.from(
      new Set(
        itemTriggerEntries.map((e) => e.triggerItemDefinitionId as string),
      ),
    );
    const ownedRows = await db
      .select({
        definitionId: itemInventories.definitionId,
        total: sql<number>`COALESCE(SUM(${itemInventories.quantity}), 0)`.mapWith(
          Number,
        ),
      })
      .from(itemInventories)
      .where(
        and(
          eq(itemInventories.tenantId, params.tenantId),
          eq(itemInventories.endUserId, params.endUserId),
          inArray(itemInventories.definitionId, defIds),
        ),
      )
      .groupBy(itemInventories.definitionId);
    const owned = new Map(ownedRows.map((r) => [r.definitionId, r.total]));

    const eligible = itemTriggerEntries.filter(
      (e) =>
        (owned.get(e.triggerItemDefinitionId as string) ?? 0) >=
        e.triggerQuantity,
    );
    if (eligible.length === 0) return [];

    return insertUnlocks(
      params.tenantId,
      params.endUserId,
      eligible,
      "collection.sync",
      null,
    );
  }

  /**
   * Manual milestone claim. Flow:
   *   1. Load milestone + reject if autoClaim (those go via mail).
   *   2. Verify threshold reached.
   *   3. INSERT into collection_user_milestones ON CONFLICT DO NOTHING;
   *      only the inserter proceeds.
   *   4. Call itemService.grantItems(source=`collection.milestone`,
   *      sourceId=`${milestoneId}:${endUserId}`) — source prefix causes
   *      the hook to no-op on recursion.
   */
  async function claimMilestone(params: {
    tenantId: string;
    endUserId: string;
    milestoneId: string;
  }): Promise<{
    grantedItems: RewardEntry[];
    claimedAt: Date;
  }> {
    const m = await loadMilestoneById(
      params.tenantId,
      params.milestoneId,
    );
    if (m.autoClaim) throw new CollectionMilestoneAutoOnly();

    const count = await countUnlockedForMilestone(
      params.tenantId,
      params.endUserId,
      m,
    );
    if (count < m.threshold) throw new CollectionMilestoneNotReached();

    const now = new Date();
    const { inserted } = await reserveMilestoneClaim(
      params.tenantId,
      params.endUserId,
      m,
      "manual",
      now,
    );
    if (!inserted) throw new CollectionMilestoneAlreadyClaimed();

    const items = m.rewardItems;
    await itemSvc.grantItems({
      tenantId: params.tenantId,
      endUserId: params.endUserId,
      grants: items,
      source: MILESTONE_SOURCE,
      sourceId: `${m.id}:${params.endUserId}`,
    });

    if (events) {
      await events.emit("collection.milestone_claimed", {
        tenantId: params.tenantId,
        endUserId: params.endUserId,
        albumId: m.albumId,
        milestoneId: m.id,
      });
    }

    return { grantedItems: items, claimedAt: now };
  }

  // ─── Stats ────────────────────────────────────────────────────

  async function getStats(
    tenantId: string,
    albumKey: string,
  ): Promise<{
    albumId: string;
    totalEndUsers: number;
    entries: Array<{ entryId: string; name: string; unlockedCount: number }>;
    milestones: Array<{
      milestoneId: string;
      scope: string;
      threshold: number;
      claimedCount: number;
    }>;
  }> {
    const album = await loadAlbumByKey(tenantId, albumKey);

    // Distinct unlocker count for the album.
    const [usersRow] = await db
      .select({
        c: sql<number>`count(distinct ${collectionUserEntries.endUserId})`.mapWith(
          Number,
        ),
      })
      .from(collectionUserEntries)
      .where(eq(collectionUserEntries.albumId, album.id));
    const totalEndUsers = usersRow?.c ?? 0;

    const entriesStats = await db
      .select({
        entryId: collectionEntries.id,
        name: collectionEntries.name,
        unlockedCount: sql<number>`count(${collectionUserEntries.endUserId})`.mapWith(
          Number,
        ),
      })
      .from(collectionEntries)
      .leftJoin(
        collectionUserEntries,
        eq(collectionUserEntries.entryId, collectionEntries.id),
      )
      .where(eq(collectionEntries.albumId, album.id))
      .groupBy(collectionEntries.id, collectionEntries.name)
      .orderBy(collectionEntries.sortOrder);

    const milestoneStats = await db
      .select({
        milestoneId: collectionMilestones.id,
        scope: collectionMilestones.scope,
        threshold: collectionMilestones.threshold,
        claimedCount: sql<number>`count(${collectionUserMilestones.endUserId})`.mapWith(
          Number,
        ),
      })
      .from(collectionMilestones)
      .leftJoin(
        collectionUserMilestones,
        eq(collectionUserMilestones.milestoneId, collectionMilestones.id),
      )
      .where(eq(collectionMilestones.albumId, album.id))
      .groupBy(
        collectionMilestones.id,
        collectionMilestones.scope,
        collectionMilestones.threshold,
      );

    return {
      albumId: album.id,
      totalEndUsers,
      entries: entriesStats,
      milestones: milestoneStats,
    };
  }

  // ─── Client-facing album detail ───────────────────────────────

  /**
   * Build the player's view of an album. Redacts entry fields when
   * `hiddenUntilUnlocked` is true and the entry is locked for this user.
   */
  async function getAlbumDetailForUser(params: {
    tenantId: string;
    endUserId: string;
    albumKey: string;
  }) {
    const album = await loadAlbumByKey(params.tenantId, params.albumKey);

    const [groups, entries, milestones, unlockedMap, claimedMap] =
      await Promise.all([
        db
          .select()
          .from(collectionGroups)
          .where(eq(collectionGroups.albumId, album.id))
          .orderBy(
            collectionGroups.sortOrder,
            desc(collectionGroups.createdAt),
          ),
        db
          .select()
          .from(collectionEntries)
          .where(eq(collectionEntries.albumId, album.id))
          .orderBy(
            collectionEntries.sortOrder,
            desc(collectionEntries.createdAt),
          ),
        db
          .select()
          .from(collectionMilestones)
          .where(eq(collectionMilestones.albumId, album.id))
          .orderBy(
            collectionMilestones.scope,
            collectionMilestones.threshold,
            collectionMilestones.sortOrder,
          ),
        listUnlockedEntryIds(
          params.tenantId,
          params.endUserId,
          album.id,
        ),
        listClaimedMilestones(
          params.tenantId,
          params.endUserId,
          album.id,
        ),
      ]);

    // Compute counts per (group, album) for milestone views.
    const perGroupCount = new Map<string, number>();
    let albumUnlocked = 0;
    for (const e of entries) {
      if (!unlockedMap.has(e.id)) continue;
      albumUnlocked += 1;
      if (e.groupId) {
        perGroupCount.set(e.groupId, (perGroupCount.get(e.groupId) ?? 0) + 1);
      }
    }

    const entryViews = entries.map((e) => {
      const u = unlockedMap.get(e.id);
      const unlocked = !!u;
      const hide = e.hiddenUntilUnlocked && !unlocked;
      return {
        id: e.id,
        albumId: e.albumId,
        groupId: e.groupId,
        alias: e.alias,
        name: hide ? null : e.name,
        description: hide ? null : e.description,
        image: hide ? null : e.image,
        rarity: hide ? null : e.rarity,
        sortOrder: e.sortOrder,
        hidden: hide,
        unlocked,
        unlockedAt: u?.unlockedAt?.toISOString() ?? null,
      };
    });

    const milestoneViews = milestones.map((m) => {
      let unlockedCount = 0;
      if (m.scope === "entry") {
        unlockedCount = unlockedMap.has(m.entryId!) ? 1 : 0;
      } else if (m.scope === "group") {
        unlockedCount = perGroupCount.get(m.groupId!) ?? 0;
      } else {
        unlockedCount = albumUnlocked;
      }
      const claim = claimedMap.get(m.id);
      return {
        id: m.id,
        scope: m.scope,
        groupId: m.groupId,
        entryId: m.entryId,
        threshold: m.threshold,
        label: m.label,
        rewardItems: m.rewardItems,
        autoClaim: m.autoClaim,
        sortOrder: m.sortOrder,
        unlockedCount,
        reached: unlockedCount >= m.threshold,
        claimed: !!claim,
        claimedAt: claim?.claimedAt?.toISOString() ?? null,
        deliveryMode: claim?.deliveryMode ?? null,
      };
    });

    const unclaimed = milestoneViews.filter(
      (v) => v.reached && !v.claimed && !v.autoClaim,
    ).length;

    return {
      album,
      groups,
      entries: entryViews,
      milestones: milestoneViews,
      totals: {
        entryCount: entries.length,
        unlockedCount: albumUnlocked,
        unclaimedMilestones: unclaimed,
      },
    };
  }

  async function listAlbumsForUser(params: {
    tenantId: string;
    endUserId: string;
  }) {
    // Client view: fetch up to the server cap; client doesn't paginate.
    const { items: albums } = await listAlbums(params.tenantId, { limit: 200 });
    const result = [];
    for (const album of albums) {
      const [unlockedMap, claimedMap, entryCountRow] = await Promise.all([
        listUnlockedEntryIds(
          params.tenantId,
          params.endUserId,
          album.id,
        ),
        listClaimedMilestones(
          params.tenantId,
          params.endUserId,
          album.id,
        ),
        db
          .select({ c: sql<number>`count(*)`.mapWith(Number) })
          .from(collectionEntries)
          .where(eq(collectionEntries.albumId, album.id)),
      ]);
      // Compute unclaimed count (reached but not yet claimed manual milestones).
      const milestones = await db
        .select()
        .from(collectionMilestones)
        .where(eq(collectionMilestones.albumId, album.id));
      let unclaimed = 0;
      const perGroup = new Map<string, number>();
      let albumUnlocked = 0;
      // Re-hydrate entry metadata needed for group-count.
      const entries = await db
        .select({ id: collectionEntries.id, groupId: collectionEntries.groupId })
        .from(collectionEntries)
        .where(eq(collectionEntries.albumId, album.id));
      for (const e of entries) {
        if (!unlockedMap.has(e.id)) continue;
        albumUnlocked += 1;
        if (e.groupId) perGroup.set(e.groupId, (perGroup.get(e.groupId) ?? 0) + 1);
      }
      for (const m of milestones) {
        if (m.autoClaim) continue;
        if (claimedMap.has(m.id)) continue;
        let c = 0;
        if (m.scope === "entry") c = unlockedMap.has(m.entryId!) ? 1 : 0;
        else if (m.scope === "group") c = perGroup.get(m.groupId!) ?? 0;
        else c = albumUnlocked;
        if (c >= m.threshold) unclaimed += 1;
      }
      result.push({
        album,
        entryCount: entryCountRow[0]?.c ?? 0,
        unlockedCount: albumUnlocked,
        unclaimedMilestones: unclaimed,
      });
    }
    return result;
  }

  return {
    // Albums
    createAlbum,
    updateAlbum,
    moveAlbum,
    deleteAlbum,
    listAlbums,
    getAlbum,
    // Groups
    createGroup,
    updateGroup,
    moveGroup,
    deleteGroup,
    listGroups,
    // Entries
    createEntry,
    bulkCreateEntries,
    updateEntry,
    moveEntry,
    deleteEntry,
    listEntries,
    // Milestones
    createMilestone,
    updateMilestone,
    moveMilestone,
    deleteMilestone,
    listMilestones,
    // Hooks & runtime
    onItemGranted,
    syncFromInventory,
    claimMilestone,
    // Read helpers
    getAlbumDetailForUser,
    listAlbumsForUser,
    getStats,
    // Internal but useful in tests
    loadAlbumByKey,
    loadMilestoneById,
    MILESTONE_SCOPES,
  };
}

export type CollectionService = ReturnType<typeof createCollectionService>;
