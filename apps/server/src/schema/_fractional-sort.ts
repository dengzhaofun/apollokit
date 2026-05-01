/**
 * Custom column type for fractional indexing sort keys.
 *
 * Why a dedicated type: the fractional-indexing library produces base62
 * keys (`a0`, `a0V`, `Zz`, …) that are designed to lex-compare in
 * **byte order** (ASCII / "C" collation). PostgreSQL's default cluster
 * collation on macOS / most Linux distros is `en_US.UTF-8`, which
 * collates case-insensitively and breaks the invariant — under en_US,
 * `'Zz' < 'a0'` returns FALSE, which corrupts ordering whenever the
 * key set spans the upper-case / lower-case boundary (any prepend
 * past `a0`).
 *
 * Declaring the column with `COLLATE "C"` pins comparisons to byte
 * order regardless of the database default, so `ORDER BY sort_order
 * ASC` always matches the fractional-indexing intent.
 *
 * Use this column type for every `sort_order` field in the codebase.
 * See `lib/fractional-order.ts` for the runtime helpers that produce
 * the keys.
 */

import { customType } from "drizzle-orm/pg-core";

export const fractionalSortKey = customType<{ data: string; notNull: false }>({
  dataType() {
    return 'text COLLATE "C"';
  },
});
