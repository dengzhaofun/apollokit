/**
 * Advanced filter expression compiler.
 *
 * Translates an externally-supplied JSON AST (the format produced by
 * react-querybuilder on the admin side) into a drizzle WHERE expression.
 *
 * Wire format — `?adv=<base64url(JSON)>`:
 *
 *     {
 *       "combinator": "and" | "or",
 *       "rules": Rule[]
 *     }
 *
 *   where Rule is either a leaf:
 *     { "field": "status", "operator": "in", "value": ["active","paused"] }
 *
 *   or another group (recursive):
 *     { "combinator": "or", "rules": [...] }
 *
 * Security model
 * --------------
 * The AST originates from the admin browser, so it is fully untrusted.
 * Three independent gates make injection impossible:
 *
 *   1. **Field whitelist** — every `field` must appear in the
 *      `defineListFilter` spec. Unknown fields → reject. The compiler
 *      never references column names by string; it indexes into the
 *      drizzle column object the spec already bound at build time.
 *
 *   2. **Operator whitelist** — every `operator` must be in
 *      `ALLOWED_OPERATORS` AND in that field's per-field
 *      `meta.operators` list. Anything else → reject.
 *
 *   3. **No string interpolation into SQL** — every value flows through
 *      drizzle's parameter binding (`eq(col, v)` / `sql`${col}` …``).
 *      The compiler never builds raw SQL strings from `value`.
 *
 * Limits — depth ≤ 5 levels of nested groups, ≤ 50 total nodes (rules
 * + groups). These keep a malicious payload from blowing up parse time
 * or producing pathological query plans.
 *
 * Compile errors throw `AdvancedFilterError`; the route layer maps it
 * to a `validation_error` envelope (HTTP 400) just like a Zod failure.
 */

import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import type { FilterFieldMeta, FilterFieldSpec, FilterOperator } from "./list-filter";

const MAX_DEPTH = 5;
const MAX_NODES = 50;

const ALLOWED_OPERATORS = new Set<FilterOperator>([
  "eq",
  "ne",
  "in",
  "notIn",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "beginsWith",
  "endsWith",
  "between",
  "isNull",
  "isNotNull",
]);

export class AdvancedFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvancedFilterError";
  }
}

type Combinator = "and" | "or";

type Rule = {
  field?: string;
  operator?: string;
  value?: unknown;
  combinator?: Combinator;
  rules?: Rule[];
};

type RuleGroup = {
  combinator: Combinator;
  rules: Rule[];
};

type ResolvedField = FilterFieldSpec & { id: string };

export type AdvancedFilterContext = {
  fields: ResolvedField[];
  fieldsById: Map<string, ResolvedField>;
};

/**
 * Decode the wire payload (base64url JSON) and compile to drizzle SQL.
 * Returns `undefined` for empty groups (no rules → no WHERE).
 */
export function compileAdvanced(
  encoded: string,
  ctx: AdvancedFilterContext,
): SQL | undefined {
  const ast = decodeAst(encoded);
  let nodeCount = 0;
  const incrementNodeCount = () => {
    nodeCount += 1;
    if (nodeCount > MAX_NODES) {
      throw new AdvancedFilterError(
        `advanced filter exceeds ${MAX_NODES} nodes`,
      );
    }
  };
  return compileGroup(ast, ctx, 0, incrementNodeCount);
}

function decodeAst(encoded: string): RuleGroup {
  let raw: string;
  try {
    raw = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    throw new AdvancedFilterError("advanced filter is not valid base64url");
  }
  if (raw.length > 16 * 1024) {
    throw new AdvancedFilterError("advanced filter payload too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AdvancedFilterError("advanced filter is not valid JSON");
  }
  return validateGroup(parsed);
}

function validateGroup(node: unknown): RuleGroup {
  if (typeof node !== "object" || node === null) {
    throw new AdvancedFilterError("advanced filter root must be an object");
  }
  const obj = node as { combinator?: unknown; rules?: unknown };
  if (obj.combinator !== "and" && obj.combinator !== "or") {
    throw new AdvancedFilterError(
      `combinator must be "and" or "or", got ${JSON.stringify(obj.combinator)}`,
    );
  }
  if (!Array.isArray(obj.rules)) {
    throw new AdvancedFilterError("group.rules must be an array");
  }
  return { combinator: obj.combinator, rules: obj.rules as Rule[] };
}

function compileGroup(
  group: RuleGroup,
  ctx: AdvancedFilterContext,
  depth: number,
  incrementNodeCount: () => void,
): SQL | undefined {
  if (depth > MAX_DEPTH) {
    throw new AdvancedFilterError(`advanced filter exceeds ${MAX_DEPTH} levels deep`);
  }
  incrementNodeCount();
  const parts: SQL[] = [];
  for (const rule of group.rules) {
    const compiled = compileRule(rule, ctx, depth, incrementNodeCount);
    if (compiled) parts.push(compiled);
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return group.combinator === "or" ? or(...parts) : and(...parts);
}

function compileRule(
  rule: Rule,
  ctx: AdvancedFilterContext,
  depth: number,
  incrementNodeCount: () => void,
): SQL | undefined {
  // Nested group?
  if (rule.combinator !== undefined || rule.rules !== undefined) {
    return compileGroup(
      validateGroup(rule),
      ctx,
      depth + 1,
      incrementNodeCount,
    );
  }
  incrementNodeCount();

  // Leaf rule — strict validation of field/operator/value
  if (typeof rule.field !== "string") {
    throw new AdvancedFilterError(
      `rule.field must be a string, got ${JSON.stringify(rule.field)}`,
    );
  }
  if (typeof rule.operator !== "string") {
    throw new AdvancedFilterError(
      `rule.operator must be a string, got ${JSON.stringify(rule.operator)}`,
    );
  }
  const op = rule.operator as FilterOperator;
  if (!ALLOWED_OPERATORS.has(op)) {
    throw new AdvancedFilterError(`operator "${rule.operator}" is not allowed`);
  }
  const fieldSpec = ctx.fieldsById.get(rule.field);
  if (!fieldSpec) {
    throw new AdvancedFilterError(`field "${rule.field}" is not registered`);
  }
  if (!fieldSpec.meta.operators.includes(op)) {
    throw new AdvancedFilterError(
      `operator "${op}" is not allowed for field "${rule.field}"`,
    );
  }

  // Custom-derived field handles its own operator translation.
  if (fieldSpec.advancedWhere) {
    const value = coerceValue(fieldSpec.meta, op, rule.value);
    return fieldSpec.advancedWhere(op, value);
  }

  if (!fieldSpec.advancedColumn) {
    throw new AdvancedFilterError(
      `field "${rule.field}" cannot be used in advanced mode (no column bound and no custom where)`,
    );
  }
  const column = fieldSpec.advancedColumn;
  const value = coerceValue(fieldSpec.meta, op, rule.value);
  return applyOperator(column, op, value);
}

/**
 * Validate / coerce a leaf value to the shape its operator expects.
 * Strict — anything that doesn't fit throws. No silent truthy coercion.
 */
function coerceValue(
  meta: Omit<FilterFieldMeta, "id">,
  op: FilterOperator,
  raw: unknown,
): unknown {
  switch (op) {
    case "isNull":
    case "isNotNull":
      return null;
    case "in":
    case "notIn": {
      const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",").map((s) => s.trim()) : [raw];
      if (arr.length === 0) {
        throw new AdvancedFilterError(`operator "${op}" requires at least one value`);
      }
      // Validate each element against the field kind
      for (const v of arr) validateLeafValue(meta, v);
      return arr;
    }
    case "between": {
      if (!Array.isArray(raw) || raw.length !== 2) {
        throw new AdvancedFilterError('operator "between" requires a 2-element array');
      }
      validateLeafValue(meta, raw[0]);
      validateLeafValue(meta, raw[1]);
      return raw;
    }
    default:
      validateLeafValue(meta, raw);
      return raw;
  }
}

function validateLeafValue(meta: Omit<FilterFieldMeta, "id">, raw: unknown): void {
  switch (meta.kind) {
    case "boolean":
      if (typeof raw !== "boolean") {
        throw new AdvancedFilterError(
          `field "${meta.label ?? meta.kind}" expects a boolean`,
        );
      }
      return;
    case "number":
    case "numberRange":
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new AdvancedFilterError(
          `field expects a finite number, got ${JSON.stringify(raw)}`,
        );
      }
      return;
    case "uuid":
      if (typeof raw !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        throw new AdvancedFilterError(`field expects a uuid string`);
      }
      return;
    case "string":
      if (typeof raw !== "string") {
        throw new AdvancedFilterError(`field expects a string`);
      }
      if (raw.length > 1024) {
        throw new AdvancedFilterError(`string value too long (max 1024 chars)`);
      }
      return;
    case "enum":
    case "multiEnum":
      if (typeof raw !== "string" || !meta.enumValues?.includes(raw)) {
        throw new AdvancedFilterError(
          `value "${String(raw)}" is not one of ${meta.enumValues?.join(", ") ?? ""}`,
        );
      }
      return;
    case "dateRange":
      if (typeof raw === "string") {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          throw new AdvancedFilterError(`field expects an ISO date string`);
        }
        return;
      }
      if (raw instanceof Date) return;
      throw new AdvancedFilterError(`field expects a date`);
  }
}

function applyOperator(
  column: AnyColumn,
  op: FilterOperator,
  value: unknown,
): SQL | undefined {
  switch (op) {
    case "eq":
      return eq(column, value as string | number | boolean);
    case "ne":
      return ne(column, value as string | number | boolean);
    case "in":
      return inArray(column, value as (string | number)[]);
    case "notIn":
      return notInArray(column, value as (string | number)[]);
    case "gt":
      return gt(column, asComparable(value));
    case "gte":
      return gte(column, asComparable(value));
    case "lt":
      return lt(column, asComparable(value));
    case "lte":
      return lte(column, asComparable(value));
    case "contains":
      return ilike(column, `%${escapeLike(String(value))}%`);
    case "beginsWith":
      return ilike(column, `${escapeLike(String(value))}%`);
    case "endsWith":
      return ilike(column, `%${escapeLike(String(value))}`);
    case "between": {
      const [lo, hi] = value as [unknown, unknown];
      return and(gte(column, asComparable(lo)), lte(column, asComparable(hi)));
    }
    case "isNull":
      return isNull(column);
    case "isNotNull":
      return isNotNull(column);
  }
}

function asComparable(v: unknown): string | number | Date {
  if (typeof v === "number" || typeof v === "string" || v instanceof Date) {
    return v;
  }
  // ISO date string fallback for between/gt-style on dateRange
  if (v && typeof v === "object" && "toISOString" in v) {
    return (v as Date).toISOString();
  }
  throw new AdvancedFilterError(`value is not comparable`);
}

/**
 * Escape `%` and `_` in a user-supplied substring so they don't act as
 * ILIKE wildcards. drizzle still parameter-binds the value, so this is
 * a UX/correctness escape (not a security one) — without it, a user
 * typing `100%` would match anything starting with `100`.
 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// Re-export for callers that want to type the AST themselves.
export type { Rule, RuleGroup, Combinator };
