import { describe, expect, test } from "vitest"

import {
  EMPTY_BUILDER,
  isEmptyRule,
  serialize,
  tryDeserialize,
  type BuilderState,
} from "./jsonlogic-builder"

describe("jsonlogic-builder", () => {
  test("empty builder ↔ {}", () => {
    expect(serialize(EMPTY_BUILDER)).toEqual({})
    expect(tryDeserialize({})).toEqual(EMPTY_BUILDER)
    expect(isEmptyRule({})).toBe(true)
    expect(isEmptyRule(null)).toBe(true)
  })

  test("single equality round-trips", () => {
    const state: BuilderState = {
      joiner: "and",
      conditions: [{ attribute: "country", operator: "equals", value: "JP" }],
    }
    const rules = serialize(state)
    expect(rules).toEqual({ "==": [{ var: "country" }, "JP"] })
    expect(tryDeserialize(rules)).toEqual(state)
  })

  test("two ANDed conditions round-trip", () => {
    const state: BuilderState = {
      joiner: "and",
      conditions: [
        { attribute: "country", operator: "in", value: ["JP", "KR"] },
        { attribute: "plan", operator: "equals", value: "free" },
      ],
    }
    const rules = serialize(state)
    expect(rules).toEqual({
      and: [
        { in: [{ var: "country" }, ["JP", "KR"]] },
        { "==": [{ var: "plan" }, "free"] },
      ],
    })
    const back = tryDeserialize(rules)
    expect(back).not.toBeNull()
    expect(back!.joiner).toBe("and")
    expect(back!.conditions).toHaveLength(2)
  })

  test("not_in serializes via { ! [{in: ...}] } and round-trips", () => {
    const state: BuilderState = {
      joiner: "and",
      conditions: [
        { attribute: "country", operator: "not_in", value: ["CN", "RU"] },
      ],
    }
    const rules = serialize(state)
    expect(rules).toEqual({
      "!": [{ in: [{ var: "country" }, ["CN", "RU"]] }],
    })
    const back = tryDeserialize(rules)
    expect(back).not.toBeNull()
    expect(back!.conditions[0].operator).toBe("not_in")
  })

  test("numeric comparators round-trip", () => {
    const state: BuilderState = {
      joiner: "and",
      conditions: [
        { attribute: "daysSinceSignup", operator: "gt", value: 30 },
        { attribute: "appVersion", operator: "lte", value: 100 },
      ],
    }
    const rules = serialize(state)
    expect(rules).toEqual({
      and: [
        { ">": [{ var: "daysSinceSignup" }, 30] },
        { "<=": [{ var: "appVersion" }, 100] },
      ],
    })
    const back = tryDeserialize(rules)
    expect(back).not.toBeNull()
    expect(back!.conditions).toHaveLength(2)
  })

  test("OR group round-trips", () => {
    const state: BuilderState = {
      joiner: "or",
      conditions: [
        { attribute: "plan", operator: "equals", value: "premium" },
        { attribute: "cohort", operator: "equals", value: "beta" },
      ],
    }
    const rules = serialize(state)
    expect(rules).toEqual({
      or: [
        { "==": [{ var: "plan" }, "premium"] },
        { "==": [{ var: "cohort" }, "beta"] },
      ],
    })
    expect(tryDeserialize(rules)?.joiner).toBe("or")
  })

  test("foreign / unsupported rule returns null on deserialize", () => {
    // Nested AND-of-OR is beyond v1.5 builder shape.
    const exotic = {
      and: [
        { or: [{ "==": [{ var: "a" }, 1] }, { "==": [{ var: "b" }, 2] }] },
        { "==": [{ var: "c" }, 3] },
      ],
    }
    expect(tryDeserialize(exotic)).toBeNull()
  })
})
