/**
 * Fractional-indexing ordering — single helper used by every module that
 * has a `sort_order` column.
 *
 * Why fractional indexing (not integer + shift):
 *  - Reorder is O(1): one UPDATE on the moved row, regardless of list size.
 *    Integer ordering needs O(N) to shift every row in the partition.
 *  - No transaction required for a "move" operation. The previous neon-http
 *    driver couldn't open transactions at all, so the integer scheme was
 *    forced to live with the eventual-consistency hack documented in
 *    `modules/banner/service.ts`. Now that we run on pg over Hyperdrive
 *    we *could* transact, but a single UPDATE is still cheaper and avoids
 *    holding a Hyperdrive pooled connection.
 *  - Keys are base62 strings ("a0", "a0V", "a1") that are strictly
 *    comparable in lexicographic order, which is PostgreSQL's default
 *    `ORDER BY` for `text` columns. We just store `sort_order text not
 *    null` and `ORDER BY sort_order ASC, created_at ASC` keeps working.
 *
 * Concurrency:
 *  - Two appends in the same partition under high concurrency may
 *    independently read the same `maxKey` and call `generateKeyBetween`
 *    with the same input, producing the same key. Fractional keys are
 *    NOT required to be unique — same-key rows fall back to the
 *    `created_at` tiebreaker in `ORDER BY sort_order ASC, created_at ASC`,
 *    so the visible ordering remains deterministic.
 *  - For "move between two known keys", the worst case is two callers
 *    concurrently inserting between the same neighbours; both compute
 *    valid keys that interleave correctly because base62 keys allow
 *    arbitrary refinement.
 */

import { z } from "@hono/zod-openapi";
import { type SQL, asc, desc, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
  generateKeyBetween,
  generateNKeysBetween,
} from "fractional-indexing";

import type { db as defaultDb } from "../db";

type DB = typeof defaultDb;

// ─── Move input shape — shared by every `/{id}/move` endpoint ──────────

/**
 * Wire schema for the unified move endpoint.
 *
 * Exactly one of the four shapes:
 *   { before: id }        — insert just before the target row
 *   { after:  id }        — insert just after the target row
 *   { position: "first" } — top of the partition
 *   { position: "last"  } — bottom of the partition
 *
 * The four admin interactions (drag-and-drop / move-up / move-down /
 * move-to-top / move-to-bottom) all collapse onto this single endpoint.
 */
export const MoveBodySchema = z
  .union([
    z.object({ before: z.string().min(1) }),
    z.object({ after: z.string().min(1) }),
    z.object({ position: z.enum(["first", "last"]) }),
  ])
  .openapi("MoveBody", {
    description:
      "Where to place the moved row. Exactly one of before/after/position must be set.",
  });

export type MoveBody = z.infer<typeof MoveBodySchema>;

// ─── Fractional key — wire schema ──────────────────────────────────────

/**
 * Validation for a fractional sort key as it appears on the wire (in
 * list responses). The library guarantees keys match this character set
 * and are non-empty; we still validate strictly so a bad payload from a
 * mis-coded client gets a 400 instead of a 500.
 */
export const FractionalKeySchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9]+$/, {
    message: "fractional key must be base62 (A-Z a-z 0-9)",
  })
  .openapi({
    description:
      "Lexicographically-comparable fractional indexing key. Treat as opaque on the client side.",
    example: "a0",
  });

// ─── Internal query — fetch the boundary key in a partition ────────────

async function selectMaxKey(
  db: DB,
  table: PgTable,
  sortColumn: PgColumn,
  scopeWhere: SQL | undefined,
): Promise<string | null> {
  const rows = (await db
    .select({ key: sortColumn })
    .from(table)
    .where(scopeWhere ?? sql`true`)
    .orderBy(desc(sortColumn))
    .limit(1)) as Array<{ key: string }>;
  return rows[0]?.key ?? null;
}

async function selectMinKey(
  db: DB,
  table: PgTable,
  sortColumn: PgColumn,
  scopeWhere: SQL | undefined,
): Promise<string | null> {
  const rows = (await db
    .select({ key: sortColumn })
    .from(table)
    .where(scopeWhere ?? sql`true`)
    .orderBy(asc(sortColumn))
    .limit(1)) as Array<{ key: string }>;
  return rows[0]?.key ?? null;
}

// ─── Public helpers ────────────────────────────────────────────────────

export type ScopedTableRef = {
  /** Drizzle table object (used as the FROM target). */
  table: PgTable;
  /** Drizzle column for the sort_order text field on `table`. */
  sortColumn: PgColumn;
  /** Optional WHERE that bounds the ordering partition. */
  scopeWhere?: SQL;
};

/**
 * Generate a key that places a new row at the END of the partition.
 */
export async function appendKey(
  db: DB,
  ref: ScopedTableRef,
): Promise<string> {
  const maxKey = await selectMaxKey(db, ref.table, ref.sortColumn, ref.scopeWhere);
  return generateKeyBetween(maxKey, null);
}

/**
 * Generate a key that places a new row at the START of the partition.
 */
export async function prependKey(
  db: DB,
  ref: ScopedTableRef,
): Promise<string> {
  const minKey = await selectMinKey(db, ref.table, ref.sortColumn, ref.scopeWhere);
  return generateKeyBetween(null, minKey);
}

/**
 * Generate a key strictly between two existing keys. Either side may be
 * null, meaning "no neighbour on that side" (== prepend / append).
 *
 * Not jittered: when the caller knows the two neighbours, the deterministic
 * midpoint is what we want for predictable cursor pagination tests.
 */
export function keyBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before, after);
}

/**
 * Generate N consecutive keys spread across the given range. Used by
 * the legacy `reorderBanners`-style "rewrite the whole list" path so
 * we still emit one UPDATE per row but skip the per-row read.
 */
export function nKeysBetween(
  before: string | null,
  after: string | null,
  n: number,
): string[] {
  if (n <= 0) return [];
  return generateNKeysBetween(before, after, n);
}

// ─── Resolve a `MoveBody` to a concrete fractional key ─────────────────

/**
 * Internal contract: caller hands over a small adapter that knows how to
 * read the `sort_order` of a sibling row by id (within the partition).
 * This keeps `fractional-order.ts` independent of any specific module's
 * "load by id" function and avoids circular imports.
 */
export type SiblingKeyLookup = (id: string) => Promise<string | null>;

export type ResolveMoveOptions = {
  ref: ScopedTableRef;
  body: MoveBody;
  lookupSiblingKey: SiblingKeyLookup;
};

/**
 * Translate a `MoveBody` (before/after/position) into the fractional key
 * to write on the moved row.
 *
 * Throws `MoveSiblingNotFound` if the referenced sibling is not in the
 * partition. Callers should catch and surface a 404 / 409.
 */
export class MoveSiblingNotFound extends Error {
  constructor(public readonly siblingId: string) {
    super(`sibling ${siblingId} not found in partition`);
    this.name = "MoveSiblingNotFound";
  }
}

export async function resolveMoveKey(
  db: DB,
  opts: ResolveMoveOptions,
): Promise<string> {
  const { ref, body, lookupSiblingKey } = opts;

  if ("position" in body) {
    return body.position === "first" ? prependKey(db, ref) : appendKey(db, ref);
  }

  if ("before" in body) {
    const targetKey = await lookupSiblingKey(body.before);
    if (targetKey == null) throw new MoveSiblingNotFound(body.before);
    const prevKey = await selectMaxKeyStrictlyBefore(
      db,
      ref.table,
      ref.sortColumn,
      ref.scopeWhere,
      targetKey,
    );
    return generateKeyBetween(prevKey, targetKey);
  }

  // `after` in body
  const targetKey = await lookupSiblingKey(body.after);
  if (targetKey == null) throw new MoveSiblingNotFound(body.after);
  const nextKey = await selectMinKeyStrictlyAfter(
    db,
    ref.table,
    ref.sortColumn,
    ref.scopeWhere,
    targetKey,
  );
  return generateKeyBetween(targetKey, nextKey);
}

async function selectMaxKeyStrictlyBefore(
  db: DB,
  table: PgTable,
  sortColumn: PgColumn,
  scopeWhere: SQL | undefined,
  ceiling: string,
): Promise<string | null> {
  const where: SQL = scopeWhere
    ? sql`${scopeWhere} AND ${sortColumn} < ${ceiling}`
    : sql`${sortColumn} < ${ceiling}`;
  const rows = (await db
    .select({ key: sortColumn })
    .from(table)
    .where(where)
    .orderBy(desc(sortColumn))
    .limit(1)) as Array<{ key: string }>;
  return rows[0]?.key ?? null;
}

async function selectMinKeyStrictlyAfter(
  db: DB,
  table: PgTable,
  sortColumn: PgColumn,
  scopeWhere: SQL | undefined,
  floor: string,
): Promise<string | null> {
  const where: SQL = scopeWhere
    ? sql`${scopeWhere} AND ${sortColumn} > ${floor}`
    : sql`${sortColumn} > ${floor}`;
  const rows = (await db
    .select({ key: sortColumn })
    .from(table)
    .where(where)
    .orderBy(asc(sortColumn))
    .limit(1)) as Array<{ key: string }>;
  return rows[0]?.key ?? null;
}

// ─── End-to-end move helper ────────────────────────────────────────────

/**
 * One-stop helper for module-level `moveX` service methods. Computes the
 * fractional key implied by `body`, writes a single UPDATE, returns the
 * full updated row.
 *
 * Wrap `MoveSiblingNotFound` with the module's own NotFound class via
 * `notFound`.
 *
 * `partitionWhere` should NOT include "id != currentId" — the helper
 * appends that filter internally so the moved row is excluded from
 * neighbour lookups.
 */
export async function moveAndReturn<TRow extends Record<string, unknown>>(
  db: DB,
  opts: {
    table: PgTable;
    sortColumn: PgColumn;
    idColumn: PgColumn;
    partitionWhere: SQL;
    id: string;
    body: MoveBody;
    notFound: (siblingId: string) => Error;
  },
): Promise<TRow> {
  const { table, sortColumn, idColumn, partitionWhere, id, body, notFound } = opts;

  const scopeWhere = sql`${partitionWhere} AND ${idColumn} <> ${id}` as SQL;

  let newKey: string;
  try {
    newKey = await resolveMoveKey(db, {
      ref: { table, sortColumn, scopeWhere },
      body,
      lookupSiblingKey: async (siblingId: string) => {
        const where = sql`${partitionWhere} AND ${idColumn} = ${siblingId}`;
        const rows = (await db
          .select({ key: sortColumn })
          .from(table)
          .where(where)
          .limit(1)) as Array<{ key: string }>;
        return rows[0]?.key ?? null;
      },
    });
  } catch (err) {
    if (err instanceof MoveSiblingNotFound) throw notFound(err.siblingId);
    throw err;
  }

  // Drizzle's `.set({...})` keys are CAMELCASE JS property names, not the
  // underlying snake_case SQL column. Every sortable table in this
  // codebase uses the property name `sortOrder` for the fractional key
  // (see `schema/_fractional-sort.ts`), so we just hardcode it. Don't
  // try to derive it from `sortColumn.name` — that returns the SQL
  // column name (`sort_order`), which `.set()` silently ignores as an
  // unknown key, leaving the row unchanged.
  const rows = (await (
    db as unknown as {
      update: (t: PgTable) => {
        set: (v: { sortOrder: string }) => {
          where: (w: SQL) => { returning: () => Promise<TRow[]> };
        };
      };
    }
  )
    .update(table)
    .set({ sortOrder: newKey })
    .where(sql`${partitionWhere} AND ${idColumn} = ${id}`)
    .returning()) as TRow[];
  if (!rows[0]) throw notFound(id);
  return rows[0];
}
