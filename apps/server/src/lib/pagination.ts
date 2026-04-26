/**
 * Cursor-based pagination — single contract used by every admin list route.
 *
 * Why cursor (not page/offset):
 *  - Stable under concurrent inserts (offset would skip / repeat rows).
 *  - O(log n) per page via the (created_at, id) composite seek, no
 *    ever-growing OFFSET cost.
 *  - "Total count" doesn't fit cursor pagination — we deliberately don't
 *    return one. The UI shows "prev / next + current N rows" instead of
 *    "page 3 of 47", which is consistent with how Stripe / GitHub paginate.
 *
 * Sort order is fixed at (createdAt DESC, id DESC). The id tiebreaker
 * matters: two rows can share a createdAt timestamp on bulk inserts,
 * and without the tiebreaker the cursor's seek WHERE would skip / repeat
 * those rows.
 *
 * Search — `q` is optional and module-specific. Each list route declares
 * which columns it ILIKEs against (typically name + alias). The util
 * here only standardises the schema; the WHERE for q lives in the
 * service.
 */

import { z } from "@hono/zod-openapi";
import { and, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ─── Wire schemas ─────────────────────────────────────────────────────

export const PaginationQuerySchema = z
  .object({
    cursor: z.string().optional().openapi({
      param: { name: "cursor", in: "query" },
      description:
        "Opaque cursor from the previous response's `nextCursor`. Omit for first page.",
    }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .openapi({
        param: { name: "limit", in: "query" },
        description: `Page size, 1..${MAX_LIMIT}. Defaults to ${DEFAULT_LIMIT}.`,
      }),
    q: z.string().optional().openapi({
      param: { name: "q", in: "query" },
      description:
        "Optional case-insensitive search. The set of columns matched is module-specific.",
    }),
  })
  .openapi("PaginationQuery");

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Wrap a per-row schema into the page envelope. Use at the
 * `responses.200.content.application/json.schema` site:
 *
 *     envelopeOf(pageOf(ItemCategoryResponseSchema))
 */
export function pageOf<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable().openapi({
      description: "Opaque cursor for the next page, or null if no more rows.",
    }),
  });
}

// ─── Cursor codec ──────────────────────────────────────────────────────

/** Internal cursor shape: a (createdAt, id) seek key. */
type CursorState = { createdAt: Date; id: string };

export function encodeCursor(createdAt: Date, id: string): string {
  const raw = `${createdAt.toISOString()}|${id}`;
  // base64url so it's URL-safe without further encoding
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorState | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ─── Service-side helpers ──────────────────────────────────────────────

export type PageParams = {
  cursor?: string;
  limit?: number;
  q?: string;
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  if (limit < 1) return 1;
  if (limit > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(limit);
}

/**
 * Build the seek WHERE clause for `(createdAt DESC, id DESC)` ordering.
 * Returns `undefined` when there's no cursor — the caller should `and()`
 * it with the org filter regardless.
 */
export function cursorWhere(
  cursor: string | undefined,
  createdAtCol: AnyColumn,
  idCol: AnyColumn,
): SQL | undefined {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  if (!decoded) return undefined;
  // (createdAt, id) < (cursor.createdAt, cursor.id) under DESC ordering
  return or(
    lt(createdAtCol, decoded.createdAt),
    and(sql`${createdAtCol} = ${decoded.createdAt}`, lt(idCol, decoded.id)),
  );
}

/**
 * Fetch one extra row to detect whether there's a next page, then trim
 * back to `limit` and emit the cursor for the last kept row.
 *
 * Rows must already be sorted DESC by `(createdAt, id)`.
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): Page<T> {
  return buildPageBy(rows, limit, (r) => ({ createdAt: r.createdAt, id: r.id }));
}

/**
 * Variant of `buildPage` for tables that don't have an `id` column —
 * caller supplies the (createdAt, tiebreaker) extractor. Use for
 * composite-PK tables like `check_in_user_states` where `endUserId` is
 * the per-page tiebreaker.
 */
export function buildPageBy<T>(
  rows: T[],
  limit: number,
  getKey: (row: T) => { createdAt: Date; id: string },
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  const { createdAt, id } = getKey(last);
  return { items, nextCursor: encodeCursor(createdAt, id) };
}
