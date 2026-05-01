/**
 * Banner service — protocol-agnostic business logic for the carousel/banner
 * slot system.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or `../../db`. It
 * receives its dependencies through the AppDeps type. See
 * apps/server/CLAUDE.md for the rule.
 *
 * ---------------------------------------------------------------------
 * Resolution model
 * ---------------------------------------------------------------------
 *
 * Admin CRUD operates on groups (banner_groups) and banners (banners)
 * strictly by `id`. Client API resolves a group by its alias — groups
 * without an alias are effectively unpublished and never visible.
 *
 * Visibility for client payloads (evaluated at read time):
 *   banner.isActive = true
 *   AND (visibleFrom IS NULL OR visibleFrom <= now)
 *   AND (visibleUntil IS NULL OR visibleUntil  > now)
 *   AND (targetType = 'broadcast'
 *        OR targetUserIds @> to_jsonb(ARRAY[endUserId]))
 *
 * Ordering: `sortOrder ASC, createdAt ASC`. `sortOrder` is a base62
 * fractional indexing key (see `lib/fractional-order.ts`); text lex-sort
 * is the natural ordering.
 *
 * ---------------------------------------------------------------------
 * Move / reorder
 * ---------------------------------------------------------------------
 *
 * Single-row moves (`moveBanner`) compute a new fractional key between the
 * target's neighbours and write one row — no transaction needed.
 *
 * `reorderBanners` (legacy bulk endpoint) still accepts the complete
 * ordered list and re-keys every row. We compute N evenly-spaced keys via
 * `nKeysBetween(null, null, N)` and emit one UPDATE per row in
 * `Promise.all`. A concurrent insert during the reorder lands at the tail
 * with a key strictly greater than every reordered row, so the visible
 * order is "old order with the new arrival appended" — not corrupt.
 */

import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import { isUniqueViolation } from "../../lib/db-errors";
import {
  appendKey,
  type MoveBody,
  MoveSiblingNotFound,
  nKeysBetween,
  resolveMoveKey,
} from "../../lib/fractional-order";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { banners, bannerGroups } from "../../schema/banner";
import type { LinkAction } from "../link/types";
import {
  BannerGroupAliasConflict,
  BannerGroupNotFound,
  BannerInvalidTarget,
  BannerInvalidVisibilityWindow,
  BannerMulticastTooLarge,
  BannerNotFound,
  BannerReorderMismatch,
} from "./errors";
import {
  BANNER_MULTICAST_MAX,
  type Banner,
  type BannerGroup,
  type BannerLayout,
  type BannerTargetType,
  type ClientBanner,
  type ClientBannerGroup,
} from "./types";
import type {
  CreateBannerGroupInput,
  CreateBannerInput,
  UpdateBannerGroupInput,
  UpdateBannerInput,
} from "./validators";

type BannerDeps = Pick<AppDeps, "db">;

function validateTargeting(input: {
  targetType?: BannerTargetType;
  targetUserIds?: string[] | null | undefined;
}): void {
  const type = input.targetType ?? "broadcast";
  if (type === "broadcast") {
    if (input.targetUserIds && input.targetUserIds.length > 0) {
      throw new BannerInvalidTarget(
        "targetUserIds must be empty when targetType='broadcast'",
      );
    }
  } else {
    const list = input.targetUserIds;
    if (!list || list.length === 0) {
      throw new BannerInvalidTarget(
        "targetUserIds must contain at least one id when targetType='multicast'",
      );
    }
    if (list.length > BANNER_MULTICAST_MAX) {
      throw new BannerMulticastTooLarge(list.length, BANNER_MULTICAST_MAX);
    }
  }
}

function validateVisibilityWindow(input: {
  visibleFrom?: string | null | undefined;
  visibleUntil?: string | null | undefined;
}): void {
  if (!input.visibleFrom || !input.visibleUntil) return;
  const from = new Date(input.visibleFrom);
  const until = new Date(input.visibleUntil);
  if (from.getTime() >= until.getTime()) {
    throw new BannerInvalidVisibilityWindow(
      "visibleFrom must be strictly before visibleUntil",
    );
  }
}

function toDate(iso: string | null | undefined): Date | null {
  if (iso == null) return null;
  return new Date(iso);
}

function toClientBanner(row: Banner): ClientBanner {
  return {
    id: row.id,
    title: row.title,
    imageUrlMobile: row.imageUrlMobile,
    imageUrlDesktop: row.imageUrlDesktop,
    altText: row.altText,
    linkAction: row.linkAction,
    sortOrder: row.sortOrder,
  };
}

export function createBannerService(d: BannerDeps) {
  const { db } = d;

  async function loadGroupById(
    organizationId: string,
    id: string,
  ): Promise<BannerGroup> {
    const rows = await db
      .select()
      .from(bannerGroups)
      .where(
        and(
          eq(bannerGroups.id, id),
          eq(bannerGroups.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new BannerGroupNotFound(id);
    return rows[0];
  }

  async function loadGroupByAlias(
    organizationId: string,
    alias: string,
  ): Promise<BannerGroup> {
    const rows = await db
      .select()
      .from(bannerGroups)
      .where(
        and(
          eq(bannerGroups.alias, alias),
          eq(bannerGroups.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new BannerGroupNotFound(alias);
    return rows[0];
  }

  async function loadBannerById(
    organizationId: string,
    id: string,
  ): Promise<Banner> {
    const rows = await db
      .select()
      .from(banners)
      .where(
        and(
          eq(banners.id, id),
          eq(banners.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new BannerNotFound(id);
    return rows[0];
  }

  return {
    // ─── Admin — groups ────────────────────────────────────────

    async createGroup(
      organizationId: string,
      input: CreateBannerGroupInput,
    ): Promise<BannerGroup> {
      try {
        const [row] = await db
          .insert(bannerGroups)
          .values({
            organizationId,
            alias: input.alias ?? null,
            name: input.name,
            description: input.description ?? null,
            layout: (input.layout ?? "carousel") as BannerLayout,
            intervalMs: input.intervalMs ?? 4000,
            isActive: input.isActive ?? true,
            activityId: input.activityId ?? null,
            activityNodeId: input.activityNodeId ?? null,
            metadata: input.metadata ?? null,
          })
          .returning();
        if (!row) throw new Error("banner group insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && input.alias) {
          throw new BannerGroupAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateGroup(
      organizationId: string,
      id: string,
      input: UpdateBannerGroupInput,
    ): Promise<BannerGroup> {
      // Ensure the row exists in this org before UPDATE (explicit 404 beats
      // "0 rows affected" ambiguity).
      await loadGroupById(organizationId, id);
      const patch: Record<string, unknown> = {};
      if (input.alias !== undefined) patch.alias = input.alias;
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.layout !== undefined) patch.layout = input.layout;
      if (input.intervalMs !== undefined) patch.intervalMs = input.intervalMs;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.activityId !== undefined) patch.activityId = input.activityId;
      if (input.activityNodeId !== undefined)
        patch.activityNodeId = input.activityNodeId;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (Object.keys(patch).length === 0) {
        return loadGroupById(organizationId, id);
      }
      try {
        const [row] = await db
          .update(bannerGroups)
          .set(patch)
          .where(
            and(
              eq(bannerGroups.id, id),
              eq(bannerGroups.organizationId, organizationId),
            ),
          )
          .returning();
        if (!row) throw new BannerGroupNotFound(id);
        return row;
      } catch (err) {
        if (isUniqueViolation(err) && typeof input.alias === "string") {
          throw new BannerGroupAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async deleteGroup(organizationId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(bannerGroups)
        .where(
          and(
            eq(bannerGroups.id, id),
            eq(bannerGroups.organizationId, organizationId),
          ),
        )
        .returning({ id: bannerGroups.id });
      if (deleted.length === 0) throw new BannerGroupNotFound(id);
    },

    /**
     * List banner groups. Defaults to standalone groups only
     * (`activityId IS NULL`) so the permanent placements page isn't
     * polluted by per-activity carousels. Pass `{ activityId }` to list
     * a specific activity's groups, or `{ includeActivity: true }` to
     * list everything.
     */
    async listGroups(
      organizationId: string,
      filter: PageParams & { includeActivity?: boolean; activityId?: string } = {},
    ): Promise<Page<BannerGroup>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(bannerGroups.organizationId, organizationId)];
      if (filter.activityId) {
        conds.push(eq(bannerGroups.activityId, filter.activityId));
      } else if (!filter.includeActivity) {
        conds.push(isNull(bannerGroups.activityId));
      }
      const seek = cursorWhere(filter.cursor, bannerGroups.createdAt, bannerGroups.id);
      if (seek) conds.push(seek);
      if (filter.q) {
        const pat = `%${filter.q}%`;
        const search = or(ilike(bannerGroups.name, pat), ilike(bannerGroups.alias, pat));
        if (search) conds.push(search);
      }
      const rows = await db
        .select()
        .from(bannerGroups)
        .where(and(...conds))
        .orderBy(desc(bannerGroups.createdAt), desc(bannerGroups.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getGroup(
      organizationId: string,
      id: string,
    ): Promise<BannerGroup> {
      return loadGroupById(organizationId, id);
    },

    // ─── Admin — banners within a group ────────────────────────

    async createBanner(
      organizationId: string,
      groupId: string,
      input: CreateBannerInput,
    ): Promise<Banner> {
      await loadGroupById(organizationId, groupId); // 404 on wrong org/group
      validateTargeting(input);
      validateVisibilityWindow(input);

      const targetType = (input.targetType ?? "broadcast") as BannerTargetType;
      const targetUserIds =
        targetType === "multicast" ? input.targetUserIds ?? null : null;

      const sortOrder = await appendKey(db, {
        table: banners,
        sortColumn: banners.sortOrder,
        scopeWhere: and(
          eq(banners.organizationId, organizationId),
          eq(banners.groupId, groupId),
        )!,
      });

      const [row] = await db
        .insert(banners)
        .values({
          organizationId,
          groupId,
          title: input.title,
          imageUrlMobile: input.imageUrlMobile,
          imageUrlDesktop: input.imageUrlDesktop,
          altText: input.altText ?? null,
          linkAction: input.linkAction as unknown as LinkAction,
          sortOrder,
          visibleFrom: toDate(input.visibleFrom ?? null),
          visibleUntil: toDate(input.visibleUntil ?? null),
          targetType,
          targetUserIds,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? null,
        })
        .returning();
      if (!row) throw new Error("banner insert returned no row");
      return row;
    },

    async updateBanner(
      organizationId: string,
      id: string,
      input: UpdateBannerInput,
    ): Promise<Banner> {
      const existing = await loadBannerById(organizationId, id);

      // Re-validate targeting + window with merged values so partial updates
      // can't leave the row in an inconsistent state.
      const mergedTargetType =
        (input.targetType ?? existing.targetType) as BannerTargetType;
      const mergedTargetUserIds =
        input.targetUserIds !== undefined
          ? input.targetUserIds
          : existing.targetUserIds;
      validateTargeting({
        targetType: mergedTargetType,
        targetUserIds: mergedTargetUserIds,
      });
      const mergedFrom =
        input.visibleFrom !== undefined
          ? input.visibleFrom
          : existing.visibleFrom?.toISOString() ?? null;
      const mergedUntil =
        input.visibleUntil !== undefined
          ? input.visibleUntil
          : existing.visibleUntil?.toISOString() ?? null;
      validateVisibilityWindow({
        visibleFrom: mergedFrom,
        visibleUntil: mergedUntil,
      });

      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.imageUrlMobile !== undefined)
        patch.imageUrlMobile = input.imageUrlMobile;
      if (input.imageUrlDesktop !== undefined)
        patch.imageUrlDesktop = input.imageUrlDesktop;
      if (input.altText !== undefined) patch.altText = input.altText;
      if (input.linkAction !== undefined)
        patch.linkAction = input.linkAction as unknown as LinkAction;
      if (input.visibleFrom !== undefined)
        patch.visibleFrom = toDate(input.visibleFrom);
      if (input.visibleUntil !== undefined)
        patch.visibleUntil = toDate(input.visibleUntil);
      if (input.targetType !== undefined) patch.targetType = input.targetType;
      if (input.targetUserIds !== undefined) {
        patch.targetUserIds =
          mergedTargetType === "multicast" ? input.targetUserIds : null;
      } else if (
        input.targetType === "broadcast" &&
        existing.targetUserIds !== null
      ) {
        // Switching to broadcast implicitly clears any prior multicast list.
        patch.targetUserIds = null;
      }
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      if (Object.keys(patch).length === 0) return existing;

      const [row] = await db
        .update(banners)
        .set(patch)
        .where(
          and(
            eq(banners.id, id),
            eq(banners.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new BannerNotFound(id);
      return row;
    },

    async deleteBanner(
      organizationId: string,
      id: string,
    ): Promise<void> {
      const deleted = await db
        .delete(banners)
        .where(
          and(
            eq(banners.id, id),
            eq(banners.organizationId, organizationId),
          ),
        )
        .returning({ id: banners.id });
      if (deleted.length === 0) throw new BannerNotFound(id);
    },

    async listBanners(
      organizationId: string,
      groupId: string,
      params: PageParams = {},
    ): Promise<Page<Banner>> {
      await loadGroupById(organizationId, groupId);
      const limit = clampLimit(params.limit);
      const conds: SQL[] = [
        eq(banners.organizationId, organizationId),
        eq(banners.groupId, groupId),
      ];
      if (params.q) {
        conds.push(ilike(banners.title, `%${params.q}%`));
      }
      // Order by sortOrder ASC so the admin list matches the visible
      // order on the client API (`getClientGroupByAlias`). The ▲▼ / drag
      // interactions feel right — the row you just moved up actually
      // moves up in the table. Cursor pagination is skipped here because
      // banner groups are bounded (a few dozen at most); the limit + 1
      // peek is enough to surface a "next page" affordance without a
      // proper sortOrder-based cursor.
      const rows = await db
        .select()
        .from(banners)
        .where(and(...conds))
        .orderBy(asc(banners.sortOrder), asc(banners.createdAt))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getBanner(
      organizationId: string,
      id: string,
    ): Promise<Banner> {
      return loadBannerById(organizationId, id);
    },

    async reorderBanners(
      organizationId: string,
      groupId: string,
      orderedIds: string[],
    ): Promise<Banner[]> {
      await loadGroupById(organizationId, groupId);

      const rows = await db
        .select({ id: banners.id })
        .from(banners)
        .where(
          and(
            eq(banners.organizationId, organizationId),
            eq(banners.groupId, groupId),
          ),
        );
      const currentIds = new Set(rows.map((r) => r.id));
      const incomingIds = new Set(orderedIds);

      if (currentIds.size !== incomingIds.size) {
        throw new BannerReorderMismatch(
          `expected ${currentIds.size} banner ids, got ${incomingIds.size}`,
        );
      }
      if (incomingIds.size !== orderedIds.length) {
        throw new BannerReorderMismatch("duplicate banner ids in payload");
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BannerReorderMismatch(
            `banner ${id} is not a member of group ${groupId}`,
          );
        }
      }

      const keys = nKeysBetween(null, null, orderedIds.length);
      await Promise.all(
        orderedIds.map((id, index) =>
          db
            .update(banners)
            .set({ sortOrder: keys[index]! })
            .where(
              and(
                eq(banners.id, id),
                eq(banners.organizationId, organizationId),
                eq(banners.groupId, groupId),
              ),
            ),
        ),
      );

      return db
        .select()
        .from(banners)
        .where(
          and(
            eq(banners.organizationId, organizationId),
            eq(banners.groupId, groupId),
          ),
        )
        .orderBy(asc(banners.sortOrder), asc(banners.createdAt));
    },

    async moveBanner(
      organizationId: string,
      id: string,
      body: MoveBody,
    ): Promise<Banner> {
      const existing = await loadBannerById(organizationId, id);

      const scopeWhere = and(
        eq(banners.organizationId, organizationId),
        eq(banners.groupId, existing.groupId),
        sql`${banners.id} <> ${id}`,
      )!;

      let newKey: string;
      try {
        newKey = await resolveMoveKey(db, {
          ref: {
            table: banners,
            sortColumn: banners.sortOrder,
            scopeWhere,
          },
          body,
          lookupSiblingKey: async (siblingId) => {
            const rows = await db
              .select({ key: banners.sortOrder })
              .from(banners)
              .where(
                and(
                  eq(banners.id, siblingId),
                  eq(banners.organizationId, organizationId),
                  eq(banners.groupId, existing.groupId),
                ),
              )
              .limit(1);
            return rows[0]?.key ?? null;
          },
        });
      } catch (err) {
        if (err instanceof MoveSiblingNotFound) {
          throw new BannerNotFound(err.siblingId);
        }
        throw err;
      }

      const [row] = await db
        .update(banners)
        .set({ sortOrder: newKey })
        .where(
          and(
            eq(banners.id, id),
            eq(banners.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new BannerNotFound(id);
      return row;
    },

    // ─── Client — resolve by alias ─────────────────────────────

    /**
     * Resolve a publishable banner group for an end user.
     *
     * `endUserId` is only used for multicast visibility (broadcast rows
     * bypass it). Inactive groups are surfaced with an empty `banners`
     * array so callers can distinguish "group turned off" from "alias
     * doesn't exist" via HTTP status (200 + empty vs 404).
     */
    async getClientGroupByAlias(
      organizationId: string,
      alias: string,
      endUserId: string,
      nowParam?: Date,
    ): Promise<ClientBannerGroup> {
      const group = await loadGroupByAlias(organizationId, alias);
      if (!group.alias) {
        // Defensive — we queried by alias so this shouldn't happen, but the
        // type system doesn't know that.
        throw new BannerGroupNotFound(alias);
      }

      if (!group.isActive) {
        return {
          id: group.id,
          alias: group.alias,
          name: group.name,
          description: group.description,
          layout: group.layout as BannerLayout,
          intervalMs: group.intervalMs,
          banners: [],
        };
      }

      const now = nowParam ?? new Date();

      // Visibility predicate. Multicast uses jsonb containment (GIN-backed).
      const visibilityClauses = and(
        eq(banners.organizationId, organizationId),
        eq(banners.groupId, group.id),
        eq(banners.isActive, true),
        or(isNull(banners.visibleFrom), sql`${banners.visibleFrom} <= ${now}`),
        or(
          isNull(banners.visibleUntil),
          sql`${banners.visibleUntil} > ${now}`,
        ),
        or(
          eq(banners.targetType, "broadcast"),
          and(
            eq(banners.targetType, "multicast"),
            sql`${banners.targetUserIds} @> ${JSON.stringify([endUserId])}::jsonb`,
          ),
        ),
      );

      const rows = await db
        .select()
        .from(banners)
        .where(visibilityClauses)
        .orderBy(asc(banners.sortOrder), asc(banners.createdAt));

      return {
        id: group.id,
        alias: group.alias,
        name: group.name,
        description: group.description,
        layout: group.layout as BannerLayout,
        intervalMs: group.intervalMs,
        banners: rows.map(toClientBanner),
      };
    },
  };
}

export type BannerService = ReturnType<typeof createBannerService>;


