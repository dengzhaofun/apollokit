"use client"

/**
 * Thin shadcn-styled wrapper around react-querybuilder.
 *
 * The wrapper does three things on top of the bare library:
 *
 *   1. **Operator vocabulary alignment** — react-querybuilder defaults
 *      to SQL-flavored operator names ("=", "!=", "<="). Our server's
 *      advanced compiler accepts the canonical names "eq", "ne", "lte",
 *      etc. (see `apps/server/src/lib/list-filter.ts → FilterOperator`).
 *      We override `operators` so the emitted AST is directly
 *      compatible with the server — no client-side translation step.
 *
 *   2. **Field derivation from `FilterDef`** — the rest of the table
 *      describes filters as `FilterDef[]`; we convert that into the
 *      `Field[]` shape react-querybuilder consumes so module authors
 *      maintain ONE filter list.
 *
 *   3. **Per-field operator restrictions** — each `FilterDef` type
 *      maps to a curated operator subset (boolean → eq/ne, dateRange
 *      → between/gte/lte/eq, etc.). This keeps the UI offering only
 *      operators the server actually supports for that field.
 *
 * The library's default styles ship as a small CSS file, imported
 * here. We layer minimal Tailwind tweaks via `className` to fit the
 * shadcn aesthetic — no full theming overhaul.
 */

import { useMemo } from "react"
import {
  QueryBuilder as RQB,
  defaultOperators,
  type Field,
  type Operator,
  type RuleGroupType,
} from "react-querybuilder"
import "react-querybuilder/dist/query-builder.css"

import { cn } from "#/lib/utils"
import type { FilterDef } from "#/hooks/use-list-search"

// Server's canonical operator vocabulary — matches FilterOperator in
// `apps/server/src/lib/list-filter.ts`. Keep these strings in sync if
// the server adds / renames any operator.
const SERVER_OPERATORS: Record<string, Operator> = {
  eq: { name: "eq", label: "equals" },
  ne: { name: "ne", label: "not equals" },
  gt: { name: "gt", label: ">" },
  gte: { name: "gte", label: "≥" },
  lt: { name: "lt", label: "<" },
  lte: { name: "lte", label: "≤" },
  contains: { name: "contains", label: "contains" },
  beginsWith: { name: "beginsWith", label: "begins with" },
  endsWith: { name: "endsWith", label: "ends with" },
  between: { name: "between", label: "between" },
  in: { name: "in", label: "in" },
  notIn: { name: "notIn", label: "not in" },
  isNull: { name: "isNull", label: "is null" },
  isNotNull: { name: "isNotNull", label: "is not null" },
}

function operatorsFor(type: FilterDef["type"]): Operator[] {
  switch (type) {
    case "select":
      return [SERVER_OPERATORS.eq!, SERVER_OPERATORS.ne!]
    case "multiselect":
      return [SERVER_OPERATORS.in!, SERVER_OPERATORS.notIn!]
    case "boolean":
      return [SERVER_OPERATORS.eq!, SERVER_OPERATORS.ne!]
    case "dateRange":
      return [
        SERVER_OPERATORS.between!,
        SERVER_OPERATORS.gte!,
        SERVER_OPERATORS.lte!,
        SERVER_OPERATORS.eq!,
      ]
    case "numberRange":
      return [
        SERVER_OPERATORS.between!,
        SERVER_OPERATORS.gte!,
        SERVER_OPERATORS.lte!,
        SERVER_OPERATORS.eq!,
        SERVER_OPERATORS.ne!,
      ]
  }
}

function inputTypeFor(type: FilterDef["type"]): Field["inputType"] {
  switch (type) {
    case "boolean":
      return "checkbox"
    case "dateRange":
      return "date"
    case "numberRange":
      return "number"
    default:
      return "text"
  }
}

function valuesFor(def: FilterDef): Field["values"] | undefined {
  if (def.type === "select" || def.type === "multiselect") {
    return def.options.map((o) => ({ name: o.value, label: o.label }))
  }
  return undefined
}

/**
 * Derive react-querybuilder's `Field[]` from our `FilterDef[]`.
 * Uses `defaultOperators` when no curated subset exists (shouldn't
 * happen with current FilterDef union, but keeps the function total).
 */
function buildFields(defs: FilterDef[]): Field[] {
  return defs.map((def) => {
    const operators = operatorsFor(def.type) ?? defaultOperators
    const values = valuesFor(def)
    const valueEditorType: Field["valueEditorType"] =
      def.type === "select"
        ? "select"
        : def.type === "multiselect"
          ? "multiselect"
          : def.type === "boolean"
            ? "checkbox"
            : undefined
    return {
      name: def.id,
      label: def.label,
      operators,
      inputType: inputTypeFor(def.type),
      values,
      valueEditorType,
    } satisfies Field
  })
}

interface Props {
  filterDefs: FilterDef[]
  /** Current AST. Pass `undefined` to start from an empty group. */
  query: RuleGroupType | undefined
  onChange: (next: RuleGroupType) => void
  className?: string
}

const EMPTY_QUERY: RuleGroupType = { combinator: "and", rules: [] }

export function QueryBuilder({
  filterDefs,
  query,
  onChange,
  className,
}: Props) {
  const fields = useMemo(() => buildFields(filterDefs), [filterDefs])
  return (
    <div
      className={cn(
        // shadcn-friendly defaults: subtle borders, neutral surface
        "qb-shadcn rounded-lg border bg-muted/30 p-3 text-sm",
        className,
      )}
    >
      <RQB
        fields={fields}
        query={query ?? EMPTY_QUERY}
        onQueryChange={onChange}
      />
    </div>
  )
}

export type { RuleGroupType }
