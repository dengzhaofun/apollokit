/**
 * Builder UI ↔ JSONLogic serialization.
 *
 * v1.5 supports a flat list of conditions joined by AND or OR. Each
 * condition is `{ attribute, operator, value }`. The Builder UI never
 * exposes raw JSONLogic syntax — operators see dropdowns, the editor
 * emits a `BuilderState`, and we serialize/deserialize on the boundary.
 *
 * Limited expressiveness on purpose:
 *   - One nesting level — no AND-of-OR-groups in v1.5
 *   - Operators are a closed enum (8 of them) chosen to cover ~95% of
 *     real targeting needs (Statsig / GrowthBook agree on this set)
 *
 * If admin loads an experiment whose targeting_rules came from
 * elsewhere (API / migration / hand-edit) and doesn't fit this shape,
 * `tryDeserialize()` returns `null` and the editor falls back to a
 * read-only "complex rule, edit via API" view.
 */

import type { ExperimentTargetingRules } from "#/lib/types/experiment"

export type Operator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"

/** v1.5 closed set of operators the builder UI exposes. */
export const ALL_OPERATORS: readonly Operator[] = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
] as const

/** A single row in the builder. */
export interface BuilderCondition {
  attribute: string
  operator: Operator
  /** For "in"/"not_in": comma-split string array. For numeric: number. Else: string. */
  value: string | number | string[] | boolean
}

export type BuilderJoiner = "and" | "or"

export interface BuilderState {
  joiner: BuilderJoiner
  conditions: BuilderCondition[]
}

export const EMPTY_BUILDER: BuilderState = { joiner: "and", conditions: [] }

// ─── Default attribute autocomplete ──────────────────────────────

/**
 * Suggested attribute names shown in the autocomplete dropdown.
 * Tenant can also free-type any other attribute name they intend to
 * pass via SDK.
 */
export const DEFAULT_ATTRIBUTES: readonly string[] = [
  "country",
  "endUserId",
  "userAgent",
  "plan",
  "cohort",
  "daysSinceSignup",
  "platform",
  "appVersion",
] as const

// ─── Serialize: BuilderState → JSONLogic ─────────────────────────

function operatorToLogic(
  op: Operator,
  attr: string,
  value: BuilderCondition["value"],
): unknown {
  const v = { var: attr }
  switch (op) {
    case "equals":
      return { "==": [v, value] }
    case "not_equals":
      return { "!=": [v, value] }
    case "in":
      return { in: [v, ensureArray(value)] }
    case "not_in":
      return { "!": [{ in: [v, ensureArray(value)] }] }
    case "gt":
      return { ">": [v, Number(value)] }
    case "gte":
      return { ">=": [v, Number(value)] }
    case "lt":
      return { "<": [v, Number(value)] }
    case "lte":
      return { "<=": [v, Number(value)] }
    case "contains":
      return { in: [String(value), v] } // JSONLogic `in` on string = substring
  }
}

function ensureArray(value: BuilderCondition["value"]): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  return [value]
}

export function serialize(state: BuilderState): ExperimentTargetingRules {
  if (state.conditions.length === 0) return {}
  const parts = state.conditions.map((c) =>
    operatorToLogic(c.operator, c.attribute, c.value),
  )
  if (parts.length === 1) return parts[0]
  return { [state.joiner]: parts } as ExperimentTargetingRules
}

// ─── Deserialize: JSONLogic → BuilderState (best-effort) ─────────

/**
 * Reverse `serialize()`. Returns `null` if the rule isn't shaped
 * like a builder-output (foreign edits, imports, manually-coded
 * rules) — caller should fall back to a read-only display.
 */
export function tryDeserialize(
  rules: ExperimentTargetingRules,
): BuilderState | null {
  if (rules == null) return EMPTY_BUILDER
  if (typeof rules !== "object") return null
  const r = rules as Record<string, unknown>
  if (Object.keys(r).length === 0) return EMPTY_BUILDER

  // Top-level "and"/"or" with array of children
  for (const joiner of ["and", "or"] as const) {
    if (Array.isArray(r[joiner])) {
      const conditions: BuilderCondition[] = []
      for (const child of r[joiner] as unknown[]) {
        const c = parseCondition(child)
        if (!c) return null
        conditions.push(c)
      }
      return { joiner, conditions }
    }
  }

  // Single bare condition
  const single = parseCondition(rules)
  if (single) return { joiner: "and", conditions: [single] }
  return null
}

function parseCondition(node: unknown): BuilderCondition | null {
  if (!node || typeof node !== "object") return null
  const obj = node as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length !== 1) return null
  const op = keys[0]

  // Negation wrapper for `not_in`
  if (op === "!" && Array.isArray(obj["!"]) && obj["!"].length === 1) {
    const inner = (obj["!"] as unknown[])[0]
    if (
      inner &&
      typeof inner === "object" &&
      Array.isArray((inner as Record<string, unknown>).in)
    ) {
      const args = (inner as Record<string, unknown[]>).in
      const attr = extractVar(args[0])
      const arr = args[1]
      if (attr && Array.isArray(arr)) {
        return { attribute: attr, operator: "not_in", value: arr.map(String) }
      }
    }
    return null
  }

  if (!Array.isArray(obj[op])) return null
  const args = obj[op] as unknown[]

  // Two-arg operators with first arg = { var }
  if (args.length === 2) {
    const attr = extractVar(args[0])
    if (attr) {
      const v = args[1]
      switch (op) {
        case "==":
          return { attribute: attr, operator: "equals", value: v as BuilderCondition["value"] }
        case "!=":
          return { attribute: attr, operator: "not_equals", value: v as BuilderCondition["value"] }
        case "in":
          if (Array.isArray(v)) {
            return { attribute: attr, operator: "in", value: v.map(String) }
          }
          return null
        case ">":
          return { attribute: attr, operator: "gt", value: Number(v) }
        case ">=":
          return { attribute: attr, operator: "gte", value: Number(v) }
        case "<":
          return { attribute: attr, operator: "lt", value: Number(v) }
        case "<=":
          return { attribute: attr, operator: "lte", value: Number(v) }
      }
    }

    // `contains`: JSONLogic shape is `{ in: [needle, { var: attr }] }`
    if (op === "in" && typeof args[0] === "string") {
      const attr = extractVar(args[1])
      if (attr) {
        return { attribute: attr, operator: "contains", value: args[0] }
      }
    }
  }

  return null
}

function extractVar(node: unknown): string | null {
  if (!node || typeof node !== "object") return null
  const v = (node as Record<string, unknown>).var
  if (typeof v === "string") return v
  return null
}

// ─── isEmptyRule helper for UI ──────────────────────────────────

export function isEmptyRule(rules: ExperimentTargetingRules): boolean {
  if (rules == null) return true
  if (typeof rules !== "object") return false
  return Object.keys(rules as Record<string, unknown>).length === 0
}
