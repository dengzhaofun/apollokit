/**
 * CMS service — protocol-agnostic business logic.
 *
 * MUST NOT import Hono / @hono/zod-openapi / `db` directly. The only bridge
 * to the outside world is the typed `AppDeps` object.
 *
 * ---------------------------------------------------------------------
 * Concurrency model (neon-http has no transactions)
 * ---------------------------------------------------------------------
 *
 * `drizzle-orm/neon-http` rejects multi-statement transactions, so:
 *
 *   - Type CRUD: single INSERT / UPDATE / DELETE per call. The
 *     additive-only schema check in `updateType` reads the prev schema,
 *     validates the next, then UPDATEs — a concurrent updater could in
 *     theory squeeze a breaking change in between, but the worst result
 *     is a schemaVersion bump that still validates additively against
 *     each side individually. We accept that risk; tenants don't write
 *     types under contention.
 *
 *   - Entry CRUD: writes use `UPDATE … WHERE version = ?` for optimistic
 *     concurrency. The caller passes the version they read; a mismatch
 *     yields zero rows and the service throws CmsEntryVersionConflict.
 *     This is the only safe pattern under neon-http for stateful entry
 *     mutations (publish flips, data edits).
 */

import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { AppDeps } from "../../deps";
import {
  buildPage,
  clampLimit,
  cursorWhere,
  type Page,
  type PageParams,
} from "../../lib/pagination";
import {
  cmsEntries,
  cmsTypes,
  type CmsEntryStatus,
} from "../../schema/cms";
import {
  CmsBreakingSchemaChange,
  CmsEntryAliasConflict,
  CmsEntryNotFound,
  CmsEntryVersionConflict,
  CmsInvalidData,
  CmsInvalidGroup,
  CmsInvalidSchema,
  CmsTypeAliasConflict,
  CmsTypeNotFound,
} from "./errors";
import {
  assertNonBreakingChange,
  buildZodFromSchemaDef,
  validateSchemaDef,
} from "./schema-validator";
import type { CmsEntry, CmsSchemaDef, CmsType } from "./types";
import {
  cmsEntryFilters,
  cmsTypeFilters,
  type CreateCmsEntryInput,
  type CreateCmsTypeInput,
  type UpdateCmsEntryInput,
  type UpdateCmsTypeInput,
} from "./validators";

type CmsDeps = Pick<AppDeps, "db"> & Partial<Pick<AppDeps, "events">>;

declare module "../../lib/event-bus" {
  interface EventMap {
    "cms.entry.published": {
      organizationId: string;
      typeAlias: string;
      entryAlias: string;
      entryId: string;
    };
    "cms.entry.unpublished": {
      organizationId: string;
      typeAlias: string;
      entryAlias: string;
      entryId: string;
    };
    "cms.entry.updated": {
      organizationId: string;
      typeAlias: string;
      entryAlias: string;
      entryId: string;
      status: CmsEntryStatus;
    };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeId(key: string): boolean {
  return UUID_RE.test(key);
}

/** Detect Postgres unique_violation across driver quirks. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505") {
    return true;
  }
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}

export function createCmsService(d: CmsDeps) {
  const { db, events } = d;

  // ─── Type loader ──────────────────────────────────────────────

  async function loadTypeByKey(
    organizationId: string,
    key: string,
  ): Promise<CmsType> {
    const where = looksLikeId(key)
      ? and(
          eq(cmsTypes.organizationId, organizationId),
          eq(cmsTypes.id, key),
        )
      : and(
          eq(cmsTypes.organizationId, organizationId),
          eq(cmsTypes.alias, key),
        );

    const rows = await db.select().from(cmsTypes).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new CmsTypeNotFound(key);
    return row;
  }

  async function loadTypeByAlias(
    organizationId: string,
    alias: string,
  ): Promise<CmsType> {
    const rows = await db
      .select()
      .from(cmsTypes)
      .where(
        and(
          eq(cmsTypes.organizationId, organizationId),
          eq(cmsTypes.alias, alias),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new CmsTypeNotFound(alias);
    return row;
  }

  async function loadEntryByKey(
    organizationId: string,
    typeAlias: string,
    key: string,
  ): Promise<CmsEntry> {
    const baseWhere = and(
      eq(cmsEntries.organizationId, organizationId),
      eq(cmsEntries.typeAlias, typeAlias),
    );
    const where = looksLikeId(key)
      ? and(baseWhere, eq(cmsEntries.id, key))
      : and(baseWhere, eq(cmsEntries.alias, key));

    const rows = await db.select().from(cmsEntries).where(where).limit(1);
    const row = rows[0];
    if (!row) throw new CmsEntryNotFound(key);
    return row;
  }

  // ─── Type CRUD ───────────────────────────────────────────────

  return {
    async createType(
      organizationId: string,
      input: CreateCmsTypeInput,
      actor?: { userId?: string },
    ): Promise<CmsType> {
      validateSchemaDef(input.schema);

      try {
        const [row] = await db
          .insert(cmsTypes)
          .values({
            organizationId,
            alias: input.alias,
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
            schema: input.schema,
            schemaVersion: 1,
            groupOptions: input.groupOptions ?? null,
            status: "active",
            createdBy: actor?.userId ?? null,
            updatedBy: actor?.userId ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new CmsTypeAliasConflict(input.alias);
        }
        throw err;
      }
    },

    async updateType(
      organizationId: string,
      key: string,
      patch: UpdateCmsTypeInput,
      actor?: { userId?: string },
    ): Promise<CmsType> {
      const existing = await loadTypeByKey(organizationId, key);

      const updateValues: Partial<typeof cmsTypes.$inferInsert> = {};
      let nextSchemaVersion = existing.schemaVersion;

      if (patch.name !== undefined) updateValues.name = patch.name;
      if (patch.description !== undefined)
        updateValues.description = patch.description;
      if (patch.icon !== undefined) updateValues.icon = patch.icon;
      if (patch.groupOptions !== undefined)
        updateValues.groupOptions = patch.groupOptions;
      if (patch.status !== undefined) updateValues.status = patch.status;

      if (patch.schema !== undefined) {
        validateSchemaDef(patch.schema);
        try {
          assertNonBreakingChange(
            existing.schema as CmsSchemaDef,
            patch.schema,
          );
        } catch (err) {
          if (err instanceof CmsInvalidSchema) {
            throw new CmsBreakingSchemaChange(err.message);
          }
          throw err;
        }
        // Only bump the version when the schema actually changed.
        const changed =
          JSON.stringify(existing.schema) !== JSON.stringify(patch.schema);
        if (changed) {
          updateValues.schema = patch.schema;
          nextSchemaVersion = existing.schemaVersion + 1;
          updateValues.schemaVersion = nextSchemaVersion;
        }
      }

      if (Object.keys(updateValues).length === 0) return existing;

      updateValues.updatedBy = actor?.userId ?? null;

      const [row] = await db
        .update(cmsTypes)
        .set(updateValues)
        .where(
          and(
            eq(cmsTypes.id, existing.id),
            eq(cmsTypes.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new CmsTypeNotFound(key);
      return row;
    },

    async deleteType(organizationId: string, key: string): Promise<void> {
      const existing = await loadTypeByKey(organizationId, key);
      const deleted = await db
        .delete(cmsTypes)
        .where(
          and(
            eq(cmsTypes.id, existing.id),
            eq(cmsTypes.organizationId, organizationId),
          ),
        )
        .returning({ id: cmsTypes.id });
      if (deleted.length === 0) throw new CmsTypeNotFound(key);
    },

    async getType(organizationId: string, key: string): Promise<CmsType> {
      return loadTypeByKey(organizationId, key);
    },

    async listTypes(
      organizationId: string,
      filter: PageParams & { status?: "active" | "archived" } = {},
    ): Promise<Page<CmsType>> {
      const limit = clampLimit(filter.limit);
      const where = and(
        eq(cmsTypes.organizationId, organizationId),
        cmsTypeFilters.where(filter as Record<string, unknown>),
        cursorWhere(filter.cursor, cmsTypes.createdAt, cmsTypes.id),
      );
      const rows = await db
        .select()
        .from(cmsTypes)
        .where(where)
        .orderBy(desc(cmsTypes.createdAt), desc(cmsTypes.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Entry CRUD ─────────────────────────────────────────────

    async createEntry(
      organizationId: string,
      typeAlias: string,
      input: CreateCmsEntryInput,
      actor?: { userId?: string },
    ): Promise<CmsEntry> {
      const type = await loadTypeByAlias(organizationId, typeAlias);
      assertGroupAllowed(type, input.groupKey ?? null);

      const dataValidator = buildZodFromSchemaDef(type.schema as CmsSchemaDef);
      const parsed = dataValidator.safeParse(input.data);
      if (!parsed.success) {
        throw new CmsInvalidData(formatZodIssues(parsed.error.issues));
      }

      const status = input.status ?? "draft";
      const publishedAt = status === "published" ? new Date() : null;

      try {
        const [row] = await db
          .insert(cmsEntries)
          .values({
            organizationId,
            typeId: type.id,
            typeAlias: type.alias,
            alias: input.alias,
            groupKey: input.groupKey ?? null,
            tags: (input.tags ?? []) as string[],
            data: parsed.data as Record<string, unknown>,
            status,
            publishedAt,
            schemaVersion: type.schemaVersion,
            version: 1,
            createdBy: actor?.userId ?? null,
            updatedBy: actor?.userId ?? null,
          })
          .returning();
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new CmsEntryAliasConflict(typeAlias, input.alias);
        }
        throw err;
      }
    },

    async updateEntry(
      organizationId: string,
      typeAlias: string,
      entryKey: string,
      patch: UpdateCmsEntryInput,
      actor?: { userId?: string },
    ): Promise<CmsEntry> {
      const existing = await loadEntryByKey(
        organizationId,
        typeAlias,
        entryKey,
      );
      if (existing.version !== patch.version) {
        throw new CmsEntryVersionConflict(existing.id);
      }

      const type = await loadTypeByAlias(organizationId, typeAlias);

      const updateValues: Partial<typeof cmsEntries.$inferInsert> = {};

      if (patch.groupKey !== undefined) {
        assertGroupAllowed(type, patch.groupKey);
        updateValues.groupKey = patch.groupKey;
      }
      if (patch.tags !== undefined) {
        updateValues.tags = patch.tags as string[];
      }
      if (patch.data !== undefined) {
        const dataValidator = buildZodFromSchemaDef(
          type.schema as CmsSchemaDef,
        );
        const parsed = dataValidator.safeParse(patch.data);
        if (!parsed.success) {
          throw new CmsInvalidData(formatZodIssues(parsed.error.issues));
        }
        updateValues.data = parsed.data as Record<string, unknown>;
        // Re-stamp schemaVersion to the type's current version when the
        // operator actually re-saves the data — they've now reconciled
        // against the new schema.
        updateValues.schemaVersion = type.schemaVersion;
      }
      if (patch.status !== undefined) {
        updateValues.status = patch.status;
        if (patch.status === "published" && existing.status !== "published") {
          updateValues.publishedAt = new Date();
        }
        if (patch.status !== "published" && existing.status === "published") {
          updateValues.publishedAt = null;
        }
      }

      if (Object.keys(updateValues).length === 0) return existing;

      updateValues.updatedBy = actor?.userId ?? null;
      updateValues.version = existing.version + 1;

      let row: CmsEntry | undefined;
      try {
        const result = await db
          .update(cmsEntries)
          .set(updateValues)
          .where(
            and(
              eq(cmsEntries.id, existing.id),
              eq(cmsEntries.organizationId, organizationId),
              eq(cmsEntries.version, existing.version),
            ),
          )
          .returning();
        row = result[0];
      } catch (err) {
        if (isUniqueViolation(err)) {
          // tags / groupKey shouldn't conflict; only alias would, but we
          // don't allow alias changes in this update. Fall through.
          throw err;
        }
        throw err;
      }
      if (!row) {
        // Either deleted or version raced.
        throw new CmsEntryVersionConflict(existing.id);
      }

      if (events) {
        if (
          patch.status === "published" &&
          existing.status !== "published"
        ) {
          await events.emit("cms.entry.published", {
            organizationId,
            typeAlias: row.typeAlias,
            entryAlias: row.alias,
            entryId: row.id,
          });
        } else if (
          existing.status === "published" &&
          patch.status !== undefined &&
          patch.status !== "published"
        ) {
          await events.emit("cms.entry.unpublished", {
            organizationId,
            typeAlias: row.typeAlias,
            entryAlias: row.alias,
            entryId: row.id,
          });
        }
        await events.emit("cms.entry.updated", {
          organizationId,
          typeAlias: row.typeAlias,
          entryAlias: row.alias,
          entryId: row.id,
          status: row.status,
        });
      }

      return row;
    },

    async deleteEntry(
      organizationId: string,
      typeAlias: string,
      entryKey: string,
    ): Promise<void> {
      const existing = await loadEntryByKey(
        organizationId,
        typeAlias,
        entryKey,
      );
      const deleted = await db
        .delete(cmsEntries)
        .where(
          and(
            eq(cmsEntries.id, existing.id),
            eq(cmsEntries.organizationId, organizationId),
          ),
        )
        .returning({ id: cmsEntries.id });
      if (deleted.length === 0) throw new CmsEntryNotFound(entryKey);
    },

    async publishEntry(
      organizationId: string,
      typeAlias: string,
      entryKey: string,
      actor?: { userId?: string },
    ): Promise<CmsEntry> {
      const existing = await loadEntryByKey(
        organizationId,
        typeAlias,
        entryKey,
      );
      if (existing.status === "published") return existing;
      return this.updateEntry(
        organizationId,
        typeAlias,
        existing.id,
        { status: "published", version: existing.version },
        actor,
      );
    },

    async unpublishEntry(
      organizationId: string,
      typeAlias: string,
      entryKey: string,
      actor?: { userId?: string },
    ): Promise<CmsEntry> {
      const existing = await loadEntryByKey(
        organizationId,
        typeAlias,
        entryKey,
      );
      if (existing.status !== "published") return existing;
      return this.updateEntry(
        organizationId,
        typeAlias,
        existing.id,
        { status: "draft", version: existing.version },
        actor,
      );
    },

    async getEntry(
      organizationId: string,
      typeAlias: string,
      entryKey: string,
    ): Promise<CmsEntry> {
      return loadEntryByKey(organizationId, typeAlias, entryKey);
    },

    async listEntries(
      organizationId: string,
      typeAlias: string,
      filter: PageParams & {
        status?: CmsEntryStatus;
        groupKey?: string;
        tag?: string;
      } = {},
    ): Promise<Page<CmsEntry>> {
      // Confirm the type exists; surfaces a clean 404 if the caller
      // typo'd the alias.
      await loadTypeByAlias(organizationId, typeAlias);

      const limit = clampLimit(filter.limit);
      const where = and(
        eq(cmsEntries.organizationId, organizationId),
        eq(cmsEntries.typeAlias, typeAlias),
        cmsEntryFilters.where(filter as Record<string, unknown>),
        cursorWhere(filter.cursor, cmsEntries.createdAt, cmsEntries.id),
      );
      const rows = await db
        .select()
        .from(cmsEntries)
        .where(where)
        .orderBy(desc(cmsEntries.createdAt), desc(cmsEntries.id))
        .limit(limit + 1);
      return buildPage(rows, limit);
    },

    // ─── Client-route reads (status === "published") ────────────

    async clientGetByAlias(
      organizationId: string,
      typeAlias: string,
      entryAlias: string,
    ): Promise<CmsEntry | null> {
      const rows = await db
        .select()
        .from(cmsEntries)
        .where(
          and(
            eq(cmsEntries.organizationId, organizationId),
            eq(cmsEntries.typeAlias, typeAlias),
            eq(cmsEntries.alias, entryAlias),
            eq(cmsEntries.status, "published"),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async clientListByGroup(
      organizationId: string,
      typeAlias: string,
      groupKey: string,
      pagination?: { limit?: number; offset?: number },
    ): Promise<CmsEntry[]> {
      const limit = pagination?.limit ?? 50;
      const offset = pagination?.offset ?? 0;
      return db
        .select()
        .from(cmsEntries)
        .where(
          and(
            eq(cmsEntries.organizationId, organizationId),
            eq(cmsEntries.typeAlias, typeAlias),
            eq(cmsEntries.groupKey, groupKey),
            eq(cmsEntries.status, "published"),
          ),
        )
        .orderBy(desc(cmsEntries.publishedAt))
        .limit(limit)
        .offset(offset);
    },

    async clientListByTag(
      organizationId: string,
      tag: string,
      pagination?: { limit?: number; offset?: number },
    ): Promise<CmsEntry[]> {
      const limit = pagination?.limit ?? 50;
      const offset = pagination?.offset ?? 0;
      return db
        .select()
        .from(cmsEntries)
        .where(
          and(
            eq(cmsEntries.organizationId, organizationId),
            sql`${cmsEntries.tags} @> ARRAY[${tag}]::text[]`,
            eq(cmsEntries.status, "published"),
          ),
        )
        .orderBy(desc(cmsEntries.publishedAt))
        .limit(limit)
        .offset(offset);
    },

    async clientListType(
      organizationId: string,
      typeAlias: string,
      filter?: { groupKey?: string; tag?: string; limit?: number; offset?: number },
    ): Promise<CmsEntry[]> {
      const conds = [
        eq(cmsEntries.organizationId, organizationId),
        eq(cmsEntries.typeAlias, typeAlias),
        eq(cmsEntries.status, "published"),
      ];
      if (filter?.groupKey) {
        conds.push(eq(cmsEntries.groupKey, filter.groupKey));
      }
      if (filter?.tag) {
        conds.push(sql`${cmsEntries.tags} @> ARRAY[${filter.tag}]::text[]`);
      }
      const limit = filter?.limit ?? 50;
      const offset = filter?.offset ?? 0;
      return db
        .select()
        .from(cmsEntries)
        .where(and(...conds))
        .orderBy(desc(cmsEntries.publishedAt))
        .limit(limit)
        .offset(offset);
    },
  };
}

export type CmsService = ReturnType<typeof createCmsService>;

// ─── helpers ─────────────────────────────────────────────────

function assertGroupAllowed(type: CmsType, group: string | null) {
  if (group === null) return;
  const opts = type.groupOptions;
  if (!opts || opts.length === 0) return;
  if (!opts.includes(group)) throw new CmsInvalidGroup(group);
}

function formatZodIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return (
    issues
      .map((i) => {
        const path = i.path.map((p) => String(p)).join(".") || "(root)";
        return `${path}: ${i.message}`;
      })
      .join("; ") || "data validation failed"
  );
}
