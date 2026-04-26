/**
 * Declarative list-filter DSL — single source of truth for every list
 * endpoint's filter surface.
 *
 * One spec drives FOUR derivations so the field catalogue can never drift:
 *   1. `querySchema` — zod object for the route's `request.query`
 *      (tightly typed, OpenAPI-friendly, declares each filter param).
 *   2. `where(query)` — drizzle SQL builder that turns the parsed query
 *      back into a composable WHERE fragment (returns `SQL | undefined`).
 *   3. `fields` — typed metadata the advanced-filter compiler and the
 *      admin's QueryBuilder consume to know what columns/operators exist.
 *   4. `adminQueryFragment` — looser zod schema (all-optional, coerce
 *      from string) the admin can `.merge()` into its
 *      `validateSearch` so URL-encoded filter keys are typed end-to-end
 *      without resorting to bare `.passthrough()`.
 *
 * URL encoding contract (admin & server agree on this — DO NOT diverge):
 *   - single value      ?status=active
 *   - multi (multiEnum) ?status=active,paused          (comma list, single key)
 *   - dateRange         ?createdAtGte=ISO&createdAtLte=ISO
 *   - numberRange       ?priceGte=10&priceLte=99
 *   - search            ?q=...
 *   - advanced AST      ?adv=<base64url(JSON)>
 *
 * Search (`q`) and advanced (`adv`) are mutually exclusive with basic
 * filters: when `adv` is present, `where()` ignores everything else
 * (returns just the compiled advanced expression). Caller still needs
 * to AND in the org scope and cursor — those are not the DSL's job.
 *
 * Custom-derived columns (e.g. `origin = "managed"` mapped to an
 * `EXISTS(...)` sub-select on a join table) are supported via
 * `f.enumOf({ where: (v) => SQL })` — the field factory accepts either
 * a `column` for the standard `eq` translation, or a custom `where`
 * callback for non-trivial mappings.
 *
 * The DSL is pure: no DB access, no side-effects. Tests can construct
 * a spec, hand it a fake parsed query, and assert on the emitted
 * drizzle expression tree without standing up Postgres.
 */

import { z } from "@hono/zod-openapi";
import {
  and,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import { compileAdvanced, type AdvancedFilterContext } from "./advanced-filter";

// ─── Field-type contracts ────────────────────────────────────────────

/**
 * The runtime value type for each kind of filter, after zod parsing.
 * Used by both the field factories and the advanced compiler.
 */
export type FilterFieldKind =
  | "enum"
  | "multiEnum"
  | "boolean"
  | "uuid"
  | "string"
  | "number"
  | "dateRange"
  | "numberRange";

/** Operator keywords accepted in the advanced filter AST. */
export type FilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "notIn"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "beginsWith"
  | "endsWith"
  | "between"
  | "isNull"
  | "isNotNull";

/**
 * Field metadata exposed to:
 *  - the advanced compiler (operator + value-type validation)
 *  - the admin's QueryBuilder (rendering the field/operator/value UI)
 *
 * `kind` controls UI rendering; `operators` enumerates valid operators
 * for THIS field (advanced compiler rejects anything else); `enumValues`
 * is populated for `enum`/`multiEnum` so the UI can render a select.
 */
export type FilterFieldMeta = {
  /** Stable identifier — appears in URL keys and advanced AST `field`. */
  id: string;
  kind: FilterFieldKind;
  /** Operators allowed in advanced mode for this field. */
  operators: FilterOperator[];
  /** For enum/multiEnum, the allowed values. */
  enumValues?: readonly string[];
  /** Optional UI label (admin can default to capitalised id otherwise). */
  label?: string;
};

/**
 * Internal representation of a configured filter field. The factory
 * functions (`f.enumOf`, `f.boolean`, …) construct these; downstream
 * code (`defineListFilter`, `compileAdvanced`) only ever sees this shape.
 *
 * `serverSchema` is for the route's `request.query` — strict, openapi-
 * decorated, may transform string→native (e.g. boolean coercion).
 * `adminSchema` is for the admin's `validateSearch` — looser,
 * `z.coerce.*` based, all-optional.
 *
 * `urlKeys` enumerates the actual URL query keys this field reads from,
 * because dateRange/numberRange contribute TWO keys (`xGte`, `xLte`).
 *
 * `toCondition` returns the drizzle WHERE for a parsed value (the value
 * shape matches what `serverSchema` parses to).
 */
export type FilterFieldSpec = {
  meta: Omit<FilterFieldMeta, "id">;
  /** Map of URL key → zod schema for `request.query` shape. */
  serverEntries: Record<string, z.ZodTypeAny>;
  /** Map of URL key → zod schema for admin `validateSearch` shape. */
  adminEntries: Record<string, z.ZodTypeAny>;
  /** Read this field's value from the parsed query, if present. */
  readValue: (query: Record<string, unknown>) => unknown | undefined;
  /** Build a WHERE fragment from the parsed value, or undefined to skip. */
  toCondition: (value: unknown) => SQL | undefined;
  /** Advanced-mode operator → SQL builder (used by advanced compiler). */
  advancedColumn: AnyColumn | null;
  /**
   * Advanced-mode WHERE override — for custom-derived fields whose
   * eq/ne don't map to a single column. When set, `advancedColumn` is
   * ignored and this callback owns operator translation entirely.
   */
  advancedWhere?: (operator: FilterOperator, value: unknown) => SQL | undefined;
};

// ─── Field factories: f.enumOf, f.boolean, … ─────────────────────────

type WithLabel = { label?: string };

type EnumOptions<V extends string> = WithLabel & {
  /** Direct column for `eq` translation. Mutually exclusive with `where`. */
  column?: AnyColumn;
  /** Custom WHERE for the basic-mode (`v` is the parsed enum literal). */
  where?: (v: V) => SQL | undefined;
};

function enumOf<V extends string>(
  values: readonly V[],
  opts: EnumOptions<V> = {},
): (id: string) => FilterFieldSpec {
  const { column, where, label } = opts;
  if (!column && !where) {
    throw new Error(
      "f.enumOf requires either { column } or { where } — pick one.",
    );
  }
  return (id) => {
    // strict server schema: enum literal, optional
    const serverSchema = z
      .enum(values as unknown as [V, ...V[]])
      .optional()
      .openapi({
        param: { name: id, in: "query" },
        description: `Filter by ${id} (one of: ${values.join(", ")}).`,
      });
    // admin schema: same, no openapi metadata
    const adminSchema = z.enum(values as unknown as [V, ...V[]]).optional();
    return {
      meta: {
        kind: "enum",
        operators: ["eq", "ne"],
        enumValues: values,
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (where) return where(v as V);
        return eq(column!, v);
      },
      advancedColumn: column ?? null,
      advancedWhere: where
        ? (op, v) => {
            // custom-derived enum only supports eq/ne in advanced mode
            if (op === "eq") return where(v as V);
            if (op === "ne") {
              const positive = where(v as V);
              return positive ? sql`NOT (${positive})` : undefined;
            }
            return undefined;
          }
        : undefined,
    };
  };
}

type MultiEnumOptions<V extends string> = WithLabel & {
  column?: AnyColumn;
  where?: (vs: V[]) => SQL | undefined;
};

function multiEnum<V extends string>(
  values: readonly V[],
  opts: MultiEnumOptions<V> = {},
): (id: string) => FilterFieldSpec {
  const { column, where, label } = opts;
  if (!column && !where) {
    throw new Error(
      "f.multiEnum requires either { column } or { where } — pick one.",
    );
  }
  const validList = `must be a comma-separated subset of: ${values.join(", ")}`;
  const validateMultiEnum = (raw: string | undefined) => {
    if (!raw) return true;
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.every((p) => values.includes(p as V));
  };
  const splitMultiEnum = (raw: string | undefined): V[] | undefined => {
    if (!raw) return undefined;
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as V[];
  };
  return (id) => {
    // Wire shape: comma-separated string (`"a,b,c"`); transform to V[].
    // Validation must use refine — throwing inside transform escapes
    // zod's safeParse and surfaces as a hard error to the route layer.
    const serverSchema = z
      .string()
      .optional()
      .refine(validateMultiEnum, { message: validList })
      .transform(splitMultiEnum)
      .openapi({
        param: { name: id, in: "query" },
        description: `Filter by ${id} — comma-separated subset of: ${values.join(", ")}.`,
      });
    const adminSchema = z.string().optional();
    return {
      meta: {
        kind: "multiEnum",
        operators: ["in", "notIn"],
        enumValues: values,
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (!v || (Array.isArray(v) && v.length === 0)) return undefined;
        const arr = v as V[];
        if (where) return where(arr);
        return inArray(column!, arr);
      },
      advancedColumn: column ?? null,
      advancedWhere: where
        ? (op, v) => {
            const arr = (Array.isArray(v) ? v : [v]) as V[];
            if (op === "in") return where(arr);
            if (op === "notIn") {
              const positive = where(arr);
              return positive ? sql`NOT (${positive})` : undefined;
            }
            return undefined;
          }
        : undefined,
    };
  };
}

type BooleanOptions = WithLabel & {
  column?: AnyColumn;
  where?: (v: boolean) => SQL | undefined;
};

function boolean(opts: BooleanOptions = {}): (id: string) => FilterFieldSpec {
  const { column, where, label } = opts;
  if (!column && !where) {
    throw new Error("f.boolean requires either { column } or { where }.");
  }
  return (id) => {
    const serverSchema = z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((v) => (typeof v === "boolean" ? v : v === "true"))
      .optional()
      .openapi({
        param: { name: id, in: "query" },
        description: `Filter by ${id} — "true" or "false".`,
      });
    const adminSchema = z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((v) => (typeof v === "boolean" ? v : v === "true"))
      .optional();
    return {
      meta: {
        kind: "boolean",
        operators: ["eq", "ne"],
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (v === undefined || v === null) return undefined;
        if (where) return where(v as boolean);
        return eq(column!, v as boolean);
      },
      advancedColumn: column ?? null,
      advancedWhere: where
        ? (op, v) => {
            if (op === "eq") return where(v as boolean);
            if (op === "ne") {
              const positive = where(v as boolean);
              return positive ? sql`NOT (${positive})` : undefined;
            }
            return undefined;
          }
        : undefined,
    };
  };
}

type StringOptions = WithLabel & {
  column: AnyColumn;
  /**
   * Default `["eq"]`. Pass `["eq", "contains"]` to allow ILIKE.
   * Operators not listed here are also rejected in advanced mode.
   */
  ops?: FilterOperator[];
  /**
   * Override the basic-mode WHERE translation. Takes the raw string
   * and returns a custom `SQL`. Useful for sentinel values like
   * "null" → `IS NULL` (e.g. nullable FK filtered with a literal "null").
   */
  where?: (v: string) => SQL | undefined;
};

function string(opts: StringOptions): (id: string) => FilterFieldSpec {
  const { column, ops = ["eq"], label, where } = opts;
  return (id) => {
    const serverSchema = z.string().min(1).max(255).optional().openapi({
      param: { name: id, in: "query" },
      description: `Filter by ${id} (string ${ops.join("/")}).`,
    });
    const adminSchema = z.string().min(1).max(255).optional();
    return {
      meta: {
        kind: "string",
        operators: ops,
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (where) return where(v as string);
        // basic mode: pick the first allowed operator that makes sense
        if (ops.includes("eq")) return eq(column, v as string);
        if (ops.includes("contains"))
          return ilike(column, `%${v as string}%`);
        if (ops.includes("beginsWith"))
          return ilike(column, `${v as string}%`);
        return undefined;
      },
      advancedColumn: column,
    };
  };
}

type NumberOptions = WithLabel & {
  column: AnyColumn;
  ops?: FilterOperator[];
};

function number(opts: NumberOptions): (id: string) => FilterFieldSpec {
  const { column, ops = ["eq", "gt", "gte", "lt", "lte"], label } = opts;
  return (id) => {
    const serverSchema = z.coerce.number().optional().openapi({
      param: { name: id, in: "query" },
      description: `Filter by ${id} (numeric).`,
    });
    const adminSchema = z.coerce.number().optional();
    return {
      meta: {
        kind: "number",
        operators: ops,
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (v === undefined || v === null) return undefined;
        return eq(column, v as number);
      },
      advancedColumn: column,
    };
  };
}

type UuidOptions = WithLabel & {
  column?: AnyColumn;
  where?: (v: string) => SQL | undefined;
};

function uuid(opts: UuidOptions = {}): (id: string) => FilterFieldSpec {
  const { column, where, label } = opts;
  if (!column && !where) {
    throw new Error("f.uuid requires either { column } or { where }.");
  }
  return (id) => {
    const serverSchema = z.string().uuid().optional().openapi({
      param: { name: id, in: "query" },
      description: `Filter by ${id} (uuid eq).`,
    });
    const adminSchema = z.string().uuid().optional();
    return {
      meta: {
        kind: "uuid",
        operators: ["eq", "ne", "in", "notIn"],
        label,
      },
      serverEntries: { [id]: serverSchema },
      adminEntries: { [id]: adminSchema },
      readValue: (q) => q[id],
      toCondition: (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (where) return where(v as string);
        return eq(column!, v as string);
      },
      advancedColumn: column ?? null,
    };
  };
}

type DateRangeOptions = WithLabel & {
  column: AnyColumn;
};

/**
 * dateRange contributes TWO URL keys: `${id}Gte` and `${id}Lte`. Both
 * are independently optional. Values are ISO 8601 strings parsed via
 * `new Date()`.
 */
function dateRange(opts: DateRangeOptions): (id: string) => FilterFieldSpec {
  const { column, label } = opts;
  return (id) => {
    const gteKey = `${id}Gte`;
    const lteKey = `${id}Lte`;
    const dateSchema = z
      .string()
      .datetime({ offset: true })
      .or(z.string().date())
      .optional()
      .refine(
        (v) => v === undefined || !Number.isNaN(new Date(v).getTime()),
        { message: `invalid date for ${id}` },
      )
      .transform((v) => (v === undefined ? undefined : new Date(v)));
    const adminDateSchema = z
      .string()
      .optional()
      .transform((v) => {
        if (!v) return undefined;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? undefined : d;
      });
    const gteServer = dateSchema.openapi({
      param: { name: gteKey, in: "query" },
      description: `Lower bound (inclusive) for ${id}, ISO 8601.`,
    });
    const lteServer = dateSchema.openapi({
      param: { name: lteKey, in: "query" },
      description: `Upper bound (inclusive) for ${id}, ISO 8601.`,
    });
    return {
      meta: {
        kind: "dateRange",
        operators: ["between", "gte", "lte"],
        label,
      },
      serverEntries: { [gteKey]: gteServer, [lteKey]: lteServer },
      adminEntries: { [gteKey]: adminDateSchema, [lteKey]: adminDateSchema },
      readValue: (q) => {
        const lo = q[gteKey];
        const hi = q[lteKey];
        if (lo === undefined && hi === undefined) return undefined;
        return { gte: lo, lte: hi };
      },
      toCondition: (v) => {
        if (!v) return undefined;
        const range = v as { gte?: Date; lte?: Date };
        const parts: SQL[] = [];
        if (range.gte) parts.push(gte(column, range.gte));
        if (range.lte) parts.push(lte(column, range.lte));
        if (parts.length === 0) return undefined;
        return parts.length === 1 ? parts[0]! : and(...parts)!;
      },
      advancedColumn: column,
    };
  };
}

type NumberRangeOptions = WithLabel & {
  column: AnyColumn;
};

function numberRange(
  opts: NumberRangeOptions,
): (id: string) => FilterFieldSpec {
  const { column, label } = opts;
  return (id) => {
    const gteKey = `${id}Gte`;
    const lteKey = `${id}Lte`;
    const baseServer = z.coerce.number().optional();
    const baseAdmin = z.coerce.number().optional();
    return {
      meta: {
        kind: "numberRange",
        operators: ["between", "gte", "lte"],
        label,
      },
      serverEntries: {
        [gteKey]: baseServer.openapi({
          param: { name: gteKey, in: "query" },
          description: `Lower bound (inclusive) for ${id}.`,
        }),
        [lteKey]: baseServer.openapi({
          param: { name: lteKey, in: "query" },
          description: `Upper bound (inclusive) for ${id}.`,
        }),
      },
      adminEntries: { [gteKey]: baseAdmin, [lteKey]: baseAdmin },
      readValue: (q) => {
        const lo = q[gteKey];
        const hi = q[lteKey];
        if (lo === undefined && hi === undefined) return undefined;
        return { gte: lo, lte: hi };
      },
      toCondition: (v) => {
        if (!v) return undefined;
        const range = v as { gte?: number; lte?: number };
        const parts: SQL[] = [];
        if (range.gte !== undefined) parts.push(gte(column, range.gte));
        if (range.lte !== undefined) parts.push(lte(column, range.lte));
        if (parts.length === 0) return undefined;
        return parts.length === 1 ? parts[0]! : and(...parts)!;
      },
      advancedColumn: column,
    };
  };
}

/** Public field-factory namespace — `import { f } from "../../lib/list-filter"`. */
export const f = {
  enumOf,
  multiEnum,
  boolean,
  string,
  number,
  uuid,
  dateRange,
  numberRange,
};

// ─── Search config ───────────────────────────────────────────────────

type SearchMode = "ilike" | "trgm";

export type SearchConfig = {
  columns: AnyColumn[];
  mode: SearchMode;
};

// ─── defineListFilter ─────────────────────────────────────────────────

type FilterFieldFactory = (id: string) => FilterFieldSpec;

type FilterSpec = Record<string, FilterFieldFactory>;

type ResolvedField = FilterFieldSpec & { id: string };

/**
 * Built filter handle returned by `defineListFilter`. Hold this in
 * each module's validators / service so server route + service share
 * the same instance.
 *
 * The `querySchema` / `adminQueryFragment` are declared as
 * `z.ZodObject<z.ZodRawShape>` rather than a tightly-typed shape so
 * `.merge()` calls and `z.infer` don't degrade to `unknown` — keep the
 * concrete typing flowing from the call-site `defineListFilter({...})`.
 */
export type ListFilter = {
  /** Server-side: zod object for `request.query`. Already merged with
   * the standard pagination keys (cursor / limit / q). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  querySchema: z.ZodObject<any>;
  /** Admin-side: looser zod object (all-optional + coerce). Merge into
   *  the route's `validateSearch`. Does NOT include cursor/limit/q —
   *  those come from `listSearchSchema` on the admin side. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminQueryFragment: z.ZodObject<any>;
  /** Build the WHERE clause for the parsed query (advanced mode wins
   *  if `adv` is present). Returns `undefined` when no filter applies. */
  where: (query: Record<string, unknown>) => SQL | undefined;
  /** Field metadata for the advanced-mode UI / compiler. */
  fields: FilterFieldMeta[];
  /** Lookup field spec by id (used by advanced compiler). */
  fieldsById: Map<string, ResolvedField>;
  /** Search config (ILIKE / trgm columns), if set via `.search()`. */
  search: SearchConfig | null;
};

import {
  PaginationQuerySchema,
} from "./pagination";

class ListFilterBuilder {
  private fields: ResolvedField[] = [];
  private searchConfig: SearchConfig | null = null;

  constructor(private readonly spec: FilterSpec) {
    for (const [id, factory] of Object.entries(spec)) {
      const built = factory(id);
      this.fields.push({ ...built, id });
    }
  }

  search(cfg: { columns: AnyColumn[]; mode?: SearchMode }): this {
    this.searchConfig = { columns: cfg.columns, mode: cfg.mode ?? "ilike" };
    return this;
  }

  build(): ListFilter {
    const serverShape: Record<string, z.ZodTypeAny> = {};
    const adminShape: Record<string, z.ZodTypeAny> = {};
    for (const f of this.fields) {
      Object.assign(serverShape, f.serverEntries);
      Object.assign(adminShape, f.adminEntries);
    }
    // Always reserve `adv` in both schemas for the advanced AST channel.
    serverShape.adv = z.string().optional().openapi({
      param: { name: "adv", in: "query" },
      description:
        "Advanced filter expression (base64url-encoded JSON AST). When present, basic filter params are ignored.",
    });
    adminShape.adv = z.string().optional();

    const querySchema = PaginationQuerySchema.merge(z.object(serverShape));
    const adminQueryFragment = z.object(adminShape);

    const fieldsById = new Map<string, ResolvedField>();
    for (const f of this.fields) fieldsById.set(f.id, f);

    const advCtx: AdvancedFilterContext = {
      fields: this.fields,
      fieldsById,
    };

    const search = this.searchConfig;

    const where: ListFilter["where"] = (query) => {
      // Advanced mode wins — when `adv` present, basic filters ignored.
      const adv = query.adv;
      if (typeof adv === "string" && adv.length > 0) {
        const compiled = compileAdvanced(adv, advCtx);
        // Search still composes alongside advanced — UI may want to
        // refine an advanced expression with a name search.
        const searchClause = buildSearchClause(query.q, this.searchConfig);
        if (compiled && searchClause) return and(compiled, searchClause);
        return compiled ?? searchClause;
      }
      const parts: SQL[] = [];
      for (const f of this.fields) {
        const value = f.readValue(query);
        const cond = f.toCondition(value);
        if (cond) parts.push(cond);
      }
      const searchClause = buildSearchClause(query.q, this.searchConfig);
      if (searchClause) parts.push(searchClause);
      if (parts.length === 0) return undefined;
      return parts.length === 1 ? parts[0] : and(...parts);
    };

    return {
      querySchema,
      adminQueryFragment,
      where,
      fields: this.fields.map((f) => ({ id: f.id, ...f.meta })),
      fieldsById,
      search,
    };
  }
}

function buildSearchClause(
  raw: unknown,
  cfg: SearchConfig | null,
): SQL | undefined {
  if (!cfg) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const term = raw.trim();
  if (cfg.mode === "trgm") {
    // Requires `gin (col gin_trgm_ops)` index. Use `%` for short terms,
    // since trgm falls back to ILIKE for short strings — keeping ILIKE
    // here uses the same index plan.
    const parts = cfg.columns.map(
      (col) => sql`${col} ILIKE ${`%${term}%`}`,
    );
    return parts.length === 1 ? parts[0] : or(...parts);
  }
  const parts = cfg.columns.map((col) => ilike(col, `%${term}%`));
  return parts.length === 1 ? parts[0] : or(...parts);
}

/**
 * Build a list-filter handle from a field spec. Chain `.search(...)`
 * before reading `.querySchema` / `.where` / `.fields`.
 *
 *   const endUserFilters = defineListFilter({
 *     origin: f.enumOf(["managed", "synced"], { where: (v) => ... }),
 *     disabled: f.boolean({ column: euUser.disabled }),
 *     createdAt: f.dateRange({ column: euUser.createdAt }),
 *   })
 *     .search({ columns: [euUser.name, euUser.email] })
 *     .build();
 */
export function defineListFilter(spec: FilterSpec): ListFilterBuilder {
  return new ListFilterBuilder(spec);
}

// Re-exports for ergonomics
export { compileAdvanced } from "./advanced-filter";
export type { AdvancedFilterContext } from "./advanced-filter";

// Imported above for buildSearchClause; used by everything else implicitly
export { sql, and, or, eq, ne, inArray, notInArray, gte, lte };
