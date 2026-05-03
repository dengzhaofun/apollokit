/**
 * End-user service — admin-facing management of the player identity
 * system + the tenant-sync half.
 *
 * Responsibilities:
 *   - `syncUser`      upsert from a tenant-owned identity, preserving
 *                     any managed credentials already attached.
 *   - `list`          paginated + filterable list of players in an org,
 *                     with managed/synced origin + session count.
 *   - `get`           single player view.
 *   - `update`        patch name / image / emailVerified.
 *   - `setDisabled`   soft-ban; side-effect-deletes existing sessions.
 *   - `signOutAll`    revoke all live sessions for a player.
 *   - `remove`        hard delete; cascades to eu_session / eu_account.
 *
 * Protocol-agnostic. See `apps/server/CLAUDE.md` → "Service layer purity".
 *
 * Merge semantics (sync)
 * ---------------------
 * Lookup precedence: `(orgId, externalId)` → `(orgId, email)`. Managed
 * rows (with `providerId='credential'` account) are NOT overwritten on
 * their managed fields — only `externalId` gets linked. Synced-only rows
 * take the tenant's values verbatim.
 */

import { and, count, desc, eq, gt, inArray } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
} from "../../lib/pagination";
import { scopeEmail, unscopeEmail } from "../../end-user-auth";
import {
  euAccount,
  euSession,
  euUser,
} from "../../schema/end-user-auth";

import { EndUserIdentityConflict, EndUserNotFound } from "./errors";
import type {
  EndUserView,
  ListFilter,
  ListResult,
  SyncResult,
  UpdateEndUserInput,
} from "./types";
import { endUserFilters } from "./validators";

type EndUserDeps = Pick<AppDeps, "db">;

export function createEndUserService(deps: EndUserDeps) {
  const { db } = deps;

  /**
   * Shape a row from `eu_user` (plus joined credential + session-count
   * aggregates) into the public admin view. Centralized so every read
   * path produces the same surface — `syncUser` returns bare ids, so
   * this isn't called there.
   */
  function toView(row: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    emailVerified: boolean;
    externalId: string | null;
    disabled: boolean;
    tenantId: string;
    createdAt: Date;
    updatedAt: Date;
    hasCredential: boolean;
    sessionCount: number;
  }): EndUserView {
    return {
      id: row.id,
      email: unscopeEmail(row.email),
      name: row.name,
      image: row.image,
      emailVerified: row.emailVerified,
      externalId: row.externalId,
      disabled: row.disabled,
      origin: row.hasCredential ? "managed" : "synced",
      sessionCount: row.sessionCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function findById(orgId: string, id: string) {
    const [row] = await db
      .select()
      .from(euUser)
      .where(and(eq(euUser.id, id), eq(euUser.tenantId, orgId)))
      .limit(1);
    return row;
  }

  return {
    async syncUser(
      orgId: string,
      input: {
        externalId?: string;
        email: string;
        name: string;
        image?: string | null;
        emailVerified?: boolean;
      },
    ): Promise<SyncResult> {
      const scopedEmail = scopeEmail(orgId, input.email);

      // Primary lookup by (orgId, externalId), falling back to (orgId, email).
      let existing: typeof euUser.$inferSelect | undefined;
      if (input.externalId) {
        [existing] = await db
          .select()
          .from(euUser)
          .where(
            and(
              eq(euUser.tenantId, orgId),
              eq(euUser.externalId, input.externalId),
            ),
          )
          .limit(1);
      }
      if (!existing) {
        [existing] = await db
          .select()
          .from(euUser)
          .where(eq(euUser.email, scopedEmail))
          .limit(1);
        // Cross-org safety: scopeEmail includes orgId, so this should be
        // impossible. Belt-and-braces so a refactor that accidentally
        // removes the prefix can't silently cross tenants.
        if (existing && existing.tenantId !== orgId) {
          existing = undefined;
        }
      }

      // Identity-conflict check: externalId was supplied, and the row
      // matched by email already has a DIFFERENT externalId.
      if (
        input.externalId &&
        existing &&
        existing.externalId &&
        existing.externalId !== input.externalId
      ) {
        throw new EndUserIdentityConflict(input.externalId);
      }

      if (!existing) {
        const [row] = await db
          .insert(euUser)
          .values({
            id: crypto.randomUUID(),
            name: input.name,
            email: scopedEmail,
            emailVerified: input.emailVerified ?? true,
            image: input.image ?? null,
            tenantId: orgId,
            externalId: input.externalId ?? null,
          })
          .returning({ id: euUser.id });
        return { euUserId: row!.id, created: true };
      }

      // Found — decide whether this row is "managed" (has a credential
      // account) to pick the merge strategy.
      const [cred] = await db
        .select({ id: euAccount.id })
        .from(euAccount)
        .where(
          and(
            eq(euAccount.userId, existing.id),
            eq(euAccount.providerId, "credential"),
          ),
        )
        .limit(1);
      const hasCredential = !!cred;

      const set: Partial<typeof euUser.$inferInsert> = {};
      if (input.externalId && existing.externalId !== input.externalId) {
        set.externalId = input.externalId;
      }
      if (!hasCredential) {
        if (input.name && input.name !== existing.name) set.name = input.name;
        if (
          input.image !== undefined &&
          (input.image ?? null) !== existing.image
        ) {
          set.image = input.image ?? null;
        }
        if (
          input.emailVerified !== undefined &&
          input.emailVerified !== existing.emailVerified
        ) {
          set.emailVerified = input.emailVerified;
        }
      }
      if (Object.keys(set).length > 0) {
        await db.update(euUser).set(set).where(eq(euUser.id, existing.id));
      }
      return { euUserId: existing.id, created: false };
    },

    async list(orgId: string, filter: ListFilter = {}): Promise<ListResult> {
      const limit = clampLimit(filter.limit);

      // The DSL handles search (ILIKE name/email/externalId), basic
      // filters (origin/disabled/emailVerified/externalId/createdAt),
      // and the advanced AST in one call. Cursor and org-scope are
      // composed on top — those aren't filter-DSL concerns.
      const where = and(
        eq(euUser.tenantId, orgId),
        endUserFilters.where(filter as Record<string, unknown>),
        cursorWhere(filter.cursor, euUser.createdAt, euUser.id),
      );

      const rawRows = await db
        .select()
        .from(euUser)
        .where(where)
        .orderBy(desc(euUser.createdAt), desc(euUser.id))
        .limit(limit + 1);

      const page = buildPage(rawRows, limit);
      const rows = page.items;

      // Batch-fetch origin + live session counts for just the rows on
      // this page. Two extra queries instead of per-row scalar
      // subselects — cheaper on wide pages and a lot easier to reason
      // about than SQL-template scalar subqueries.
      const ids = rows.map((r) => r.id);
      const hasCred = new Set<string>();
      const sessionCounts = new Map<string, number>();
      if (ids.length > 0) {
        const credRows = await db
          .selectDistinct({ userId: euAccount.userId })
          .from(euAccount)
          .where(
            and(
              inArray(euAccount.userId, ids),
              eq(euAccount.providerId, "credential"),
            ),
          );
        for (const r of credRows) hasCred.add(r.userId);

        const countRows = await db
          .select({ userId: euSession.userId, n: count() })
          .from(euSession)
          .where(
            and(
              inArray(euSession.userId, ids),
              gt(euSession.expiresAt, new Date()),
            ),
          )
          .groupBy(euSession.userId);
        for (const r of countRows) sessionCounts.set(r.userId, Number(r.n));
      }

      const items = rows.map((r) =>
        toView({
          ...r,
          hasCredential: hasCred.has(r.id),
          sessionCount: sessionCounts.get(r.id) ?? 0,
        }),
      );

      return { items, nextCursor: page.nextCursor };
    },

    async get(orgId: string, id: string): Promise<EndUserView> {
      const row = await findById(orgId, id);
      if (!row) throw new EndUserNotFound(id);

      const [cred] = await db
        .select({ id: euAccount.id })
        .from(euAccount)
        .where(
          and(
            eq(euAccount.userId, row.id),
            eq(euAccount.providerId, "credential"),
          ),
        )
        .limit(1);

      const [{ n }] = (await db
        .select({ n: count() })
        .from(euSession)
        .where(
          and(
            eq(euSession.userId, row.id),
            gt(euSession.expiresAt, new Date()),
          ),
        )) as [{ n: number }];

      return toView({
        ...row,
        hasCredential: !!cred,
        sessionCount: Number(n),
      });
    },

    async update(
      orgId: string,
      id: string,
      input: UpdateEndUserInput,
    ): Promise<EndUserView> {
      const existing = await findById(orgId, id);
      if (!existing) throw new EndUserNotFound(id);

      const set: Partial<typeof euUser.$inferInsert> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.image !== undefined) set.image = input.image;
      if (input.emailVerified !== undefined)
        set.emailVerified = input.emailVerified;

      if (Object.keys(set).length > 0) {
        await db.update(euUser).set(set).where(eq(euUser.id, id));
      }

      return this.get(orgId, id);
    },

    /**
     * Flip the disabled flag. When disabling, also revoke all active
     * sessions so the ban takes effect immediately instead of waiting
     * for the current cookie to expire.
     */
    async setDisabled(
      orgId: string,
      id: string,
      disabled: boolean,
    ): Promise<EndUserView> {
      const existing = await findById(orgId, id);
      if (!existing) throw new EndUserNotFound(id);

      await db.update(euUser).set({ disabled }).where(eq(euUser.id, id));
      if (disabled) {
        await db.delete(euSession).where(eq(euSession.userId, id));
      }
      return this.get(orgId, id);
    },

    /**
     * Revoke every active session for this player. Useful if the admin
     * suspects credential compromise but doesn't want to ban the
     * account outright. Managed players can sign in again with their
     * existing password; synced players resume as soon as the tenant
     * reissues a HMAC userHash.
     */
    async signOutAll(
      orgId: string,
      id: string,
    ): Promise<{ revoked: number }> {
      const existing = await findById(orgId, id);
      if (!existing) throw new EndUserNotFound(id);

      const rows = await db
        .delete(euSession)
        .where(eq(euSession.userId, id))
        .returning({ id: euSession.id });
      return { revoked: rows.length };
    },

    /**
     * Hard delete. Cascade-drops eu_session and eu_account via FK.
     * Business tables that reference `endUserId` are text columns with
     * NO FK (see CLAUDE.md → "two userIds"), so they keep their rows —
     * that's intentional: leaderboards and audit logs shouldn't lose
     * data just because a player got deleted.
     */
    async remove(orgId: string, id: string): Promise<void> {
      const existing = await findById(orgId, id);
      if (!existing) throw new EndUserNotFound(id);
      await db.delete(euUser).where(eq(euUser.id, id));
    },
  };
}

export type EndUserService = ReturnType<typeof createEndUserService>;
