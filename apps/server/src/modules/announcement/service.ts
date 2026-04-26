/**
 * Announcement service — protocol-agnostic business logic for the
 * per-tenant operational broadcast channel.
 *
 * This file MUST NOT import Hono, @hono/zod-openapi, or `../../db`. It
 * receives its dependencies through the AppDeps type. See
 * apps/server/CLAUDE.md for the rule.
 *
 * ---------------------------------------------------------------------
 * Resolution model
 * ---------------------------------------------------------------------
 *
 * Admin CRUD operates on announcements by `alias` (per-tenant unique).
 * Client API resolves the list of currently-visible announcements for an
 * end user — broadcast-only in v1, so `endUserId` is only used for
 * analytics/event emission, not for visibility filtering.
 *
 * Visibility predicate (read-time):
 *   isActive = true
 *   AND (visibleFrom IS NULL OR visibleFrom <= now)
 *   AND (visibleUntil IS NULL OR visibleUntil  > now)
 *
 * Ordering: `priority DESC, createdAt DESC` — higher-priority announcements
 * bubble to the top of the client's rendering list.
 *
 * ---------------------------------------------------------------------
 * Per-player read state
 * ---------------------------------------------------------------------
 *
 * Deliberately NOT persisted server-side in v1. The game client tracks
 * "already seen" / "dismissed" in local storage. Cross-device sync is a
 * v2 concern — adding it later is additive (new `announcement_reads`
 * table + new client endpoints) and does not change the contract of the
 * existing `getActiveForClient` / `recordImpression` / `recordClick`
 * methods.
 */

import { and, desc, eq, gt, ilike, isNull, lte, or, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import { announcements } from "../../schema/announcement";
import {
  AnnouncementAliasConflict,
  AnnouncementInvalidVisibilityWindow,
  AnnouncementNotFound,
} from "./errors";
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
  ClientAnnouncement,
} from "./types";
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from "./validators";

// `events` is optional so existing / future tests that pass only { db }
// keep compiling. In production wiring (barrel index.ts) we always supply
// it from `deps`.
type AnnouncementDeps = Pick<AppDeps, "db"> &
  Partial<Pick<AppDeps, "events">>;

// Extend the in-runtime event-bus type map with announcement-domain events.
declare module "../../lib/event-bus" {
  interface EventMap {
    "announcement.created": {
      organizationId: string;
      announcementId: string;
      alias: string;
      kind: AnnouncementKind;
    };
    "announcement.updated": {
      organizationId: string;
      announcementId: string;
      alias: string;
    };
    "announcement.deleted": {
      organizationId: string;
      announcementId: string;
      alias: string;
    };
    "announcement.impression": {
      organizationId: string;
      endUserId: string;
      announcementId: string;
      alias: string;
      kind: AnnouncementKind;
    };
    "announcement.click": {
      organizationId: string;
      endUserId: string;
      announcementId: string;
      alias: string;
      ctaUrl: string | null;
    };
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
    throw new AnnouncementInvalidVisibilityWindow(
      "visibleFrom must be strictly before visibleUntil",
    );
  }
}

function toDate(iso: string | null | undefined): Date | null {
  if (iso == null) return null;
  return new Date(iso);
}

function toClientAnnouncement(row: Announcement): ClientAnnouncement {
  return {
    id: row.id,
    alias: row.alias,
    kind: row.kind as AnnouncementKind,
    title: row.title,
    body: row.body,
    coverImageUrl: row.coverImageUrl,
    ctaUrl: row.ctaUrl,
    ctaLabel: row.ctaLabel,
    priority: row.priority,
    severity: row.severity as AnnouncementSeverity,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAnnouncementService(d: AnnouncementDeps) {
  const { db, events } = d;

  async function loadByAlias(
    organizationId: string,
    alias: string,
  ): Promise<Announcement> {
    const rows = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.organizationId, organizationId),
          eq(announcements.alias, alias),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AnnouncementNotFound(alias);
    return rows[0];
  }

  return {
    // ─── Admin ─────────────────────────────────────────────────

    async list(
      organizationId: string,
      filter: ListAnnouncementsQuery & PageParams = {},
    ): Promise<Page<Announcement>> {
      const limit = clampLimit(filter.limit);
      const conds: SQL[] = [eq(announcements.organizationId, organizationId)];
      if (filter.kind) conds.push(eq(announcements.kind, filter.kind));
      if (filter.isActive === "true")
        conds.push(eq(announcements.isActive, true));
      if (filter.isActive === "false")
        conds.push(eq(announcements.isActive, false));
      if (filter.q) {
        const pattern = `%${filter.q}%`;
        const qCond = or(
          ilike(announcements.alias, pattern),
          ilike(announcements.title, pattern),
        );
        if (qCond) conds.push(qCond);
      }
      const seek = cursorWhere(filter.cursor, announcements.createdAt, announcements.id);
      if (seek) conds.push(seek);
      const rows = await db
        .select()
        .from(announcements)
        .where(and(...conds))
        .orderBy(desc(announcements.createdAt), desc(announcements.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    async getByAlias(
      organizationId: string,
      alias: string,
    ): Promise<Announcement> {
      return loadByAlias(organizationId, alias);
    },

    async create(
      organizationId: string,
      input: CreateAnnouncementInput,
      createdBy: string | null,
    ): Promise<Announcement> {
      validateVisibilityWindow(input);
      try {
        const [row] = await db
          .insert(announcements)
          .values({
            organizationId,
            alias: input.alias,
            kind: input.kind,
            title: input.title,
            body: input.body,
            coverImageUrl: input.coverImageUrl ?? null,
            ctaUrl: input.ctaUrl ?? null,
            ctaLabel: input.ctaLabel ?? null,
            priority: input.priority ?? 0,
            severity: input.severity ?? "info",
            isActive: input.isActive ?? true,
            visibleFrom: toDate(input.visibleFrom ?? null),
            visibleUntil: toDate(input.visibleUntil ?? null),
            createdBy,
          })
          .returning();
        if (!row) throw new Error("announcement insert returned no row");

        if (events) {
          await events.emit("announcement.created", {
            organizationId,
            announcementId: row.id,
            alias: row.alias,
            kind: row.kind as AnnouncementKind,
          });
        }
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AnnouncementAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async update(
      organizationId: string,
      alias: string,
      input: UpdateAnnouncementInput,
    ): Promise<Announcement> {
      const existing = await loadByAlias(organizationId, alias);

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
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.title !== undefined) patch.title = input.title;
      if (input.body !== undefined) patch.body = input.body;
      if (input.coverImageUrl !== undefined)
        patch.coverImageUrl = input.coverImageUrl;
      if (input.ctaUrl !== undefined) patch.ctaUrl = input.ctaUrl;
      if (input.ctaLabel !== undefined) patch.ctaLabel = input.ctaLabel;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.severity !== undefined) patch.severity = input.severity;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.visibleFrom !== undefined)
        patch.visibleFrom = toDate(input.visibleFrom);
      if (input.visibleUntil !== undefined)
        patch.visibleUntil = toDate(input.visibleUntil);

      if (Object.keys(patch).length === 0) return existing;

      const [row] = await db
        .update(announcements)
        .set(patch)
        .where(
          and(
            eq(announcements.organizationId, organizationId),
            eq(announcements.alias, alias),
          ),
        )
        .returning();
      if (!row) throw new AnnouncementNotFound(alias);

      if (events) {
        await events.emit("announcement.updated", {
          organizationId,
          announcementId: row.id,
          alias: row.alias,
        });
      }
      return row;
    },

    async remove(organizationId: string, alias: string): Promise<void> {
      const deleted = await db
        .delete(announcements)
        .where(
          and(
            eq(announcements.organizationId, organizationId),
            eq(announcements.alias, alias),
          ),
        )
        .returning({
          id: announcements.id,
          alias: announcements.alias,
        });
      const row = deleted[0];
      if (!row) throw new AnnouncementNotFound(alias);

      if (events) {
        await events.emit("announcement.deleted", {
          organizationId,
          announcementId: row.id,
          alias: row.alias,
        });
      }
    },

    // ─── Client ────────────────────────────────────────────────

    /**
     * Return currently-visible announcements for an end user.
     * `endUserId` is not yet used for filtering (v1 is broadcast-only)
     * but is required in the API so v2 targeting is a pure service
     * change, not a contract change.
     */
    async getActiveForClient(
      organizationId: string,
      _endUserId: string,
      nowParam?: Date,
    ): Promise<ClientAnnouncement[]> {
      const now = nowParam ?? new Date();
      const rows = await db
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.organizationId, organizationId),
            eq(announcements.isActive, true),
            or(
              isNull(announcements.visibleFrom),
              lte(announcements.visibleFrom, now),
            ),
            or(
              isNull(announcements.visibleUntil),
              gt(announcements.visibleUntil, now),
            ),
          ),
        )
        .orderBy(
          desc(announcements.priority),
          desc(announcements.createdAt),
        );
      return rows.map(toClientAnnouncement);
    },

    /**
     * Fire-and-forget impression event. Returns the matched announcement
     * id so callers can 404 on unknown alias. Does NOT validate whether
     * the announcement is currently within its visibility window — the
     * client just rendered it, the server's job here is to record that,
     * not to retroactively decide whether rendering was allowed.
     */
    async recordImpression(
      organizationId: string,
      alias: string,
      endUserId: string,
    ): Promise<void> {
      const row = await loadByAlias(organizationId, alias);
      if (events) {
        await events.emit("announcement.impression", {
          organizationId,
          endUserId,
          announcementId: row.id,
          alias: row.alias,
          kind: row.kind as AnnouncementKind,
        });
      }
    },

    async recordClick(
      organizationId: string,
      alias: string,
      endUserId: string,
    ): Promise<void> {
      const row = await loadByAlias(organizationId, alias);
      if (events) {
        await events.emit("announcement.click", {
          organizationId,
          endUserId,
          announcementId: row.id,
          alias: row.alias,
          ctaUrl: row.ctaUrl,
        });
      }
    },
  };
}

export type AnnouncementService = ReturnType<typeof createAnnouncementService>;

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
