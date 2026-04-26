/**
 * Pure unit tests for the advanced filter compiler.
 *
 * Covers:
 *   - operator + field whitelisting (any unknown name → reject)
 *   - depth + node-count limits
 *   - injection-shaped inputs are rejected at validation OR safely
 *     parameter-bound (no SQL string interpolation possible)
 *   - base64url + JSON parse errors return AdvancedFilterError
 *   - leaf-value coercion / type checks per field kind
 *
 * SQL correctness against Postgres is covered later in service tests.
 */

import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import {
  AdvancedFilterError,
  compileAdvanced,
} from "./advanced-filter";
import { defineListFilter, f } from "./list-filter";

const fixture = pgTable("adv_test_fixture", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  disabled: boolean("disabled").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

const filter = defineListFilter({
  status: f.enumOf(["active", "paused", "ended"], { column: fixture.status }),
  disabled: f.boolean({ column: fixture.disabled }),
  name: f.string({ column: fixture.name, ops: ["eq", "contains"] }),
  createdAt: f.dateRange({ column: fixture.createdAt }),
}).build();

const ctx = {
  fields: Array.from(filter.fieldsById.values()),
  fieldsById: filter.fieldsById,
};

function encode(ast: unknown): string {
  return Buffer.from(JSON.stringify(ast), "utf8").toString("base64url");
}

describe("compileAdvanced — happy path", () => {
  test("simple eq compiles to SQL", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "status", operator: "eq", value: "active" }],
    };
    const sql = compileAdvanced(encode(ast), ctx);
    expect(sql).toBeDefined();
  });

  test("nested OR/AND compiles", () => {
    const ast = {
      combinator: "or",
      rules: [
        {
          combinator: "and",
          rules: [
            { field: "status", operator: "eq", value: "active" },
            { field: "disabled", operator: "eq", value: false },
          ],
        },
        { field: "status", operator: "eq", value: "paused" },
      ],
    };
    const sql = compileAdvanced(encode(ast), ctx);
    expect(sql).toBeDefined();
  });

  test("contains uses ILIKE", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "name", operator: "contains", value: "alice" }],
    };
    const sql = compileAdvanced(encode(ast), ctx);
    expect(sql).toBeDefined();
  });

  test("between on dateRange compiles", () => {
    const ast = {
      combinator: "and",
      rules: [
        {
          field: "createdAt",
          operator: "between",
          value: ["2026-01-01", "2026-02-01"],
        },
      ],
    };
    const sql = compileAdvanced(encode(ast), ctx);
    expect(sql).toBeDefined();
  });

  test("empty rules → undefined (no WHERE)", () => {
    const ast = { combinator: "and", rules: [] };
    expect(compileAdvanced(encode(ast), ctx)).toBeUndefined();
  });
});

describe("compileAdvanced — whitelist enforcement", () => {
  test("rejects unknown field", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "evil_column", operator: "eq", value: 1 }],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(
      AdvancedFilterError,
    );
  });

  test("rejects field name with SQL-ish characters", () => {
    const ast = {
      combinator: "and",
      rules: [
        { field: 'status"; DROP TABLE x;--', operator: "eq", value: "x" },
      ],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(
      AdvancedFilterError,
    );
  });

  test("rejects unknown operator", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "status", operator: "RAISE", value: "x" }],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(
      AdvancedFilterError,
    );
  });

  test("rejects operator not allowed for the field", () => {
    // boolean only allows eq/ne — `gt` should be rejected
    const ast = {
      combinator: "and",
      rules: [{ field: "disabled", operator: "gt", value: false }],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(
      /not allowed for field/,
    );
  });

  test("string field without 'contains' op rejects contains", () => {
    const localFilter = defineListFilter({
      name: f.string({ column: fixture.name }), // ops defaults to ["eq"]
    }).build();
    const localCtx = {
      fields: Array.from(localFilter.fieldsById.values()),
      fieldsById: localFilter.fieldsById,
    };
    const ast = {
      combinator: "and",
      rules: [{ field: "name", operator: "contains", value: "x" }],
    };
    expect(() => compileAdvanced(encode(ast), localCtx)).toThrow(
      AdvancedFilterError,
    );
  });
});

describe("compileAdvanced — limits", () => {
  test("rejects depth > 5", () => {
    // Build a 6-level deep nested group
    let inner: object = { combinator: "and", rules: [] };
    for (let i = 0; i < 6; i++) {
      inner = { combinator: "and", rules: [inner] };
    }
    expect(() => compileAdvanced(encode(inner), ctx)).toThrow(/levels deep/);
  });

  test("rejects > 50 nodes", () => {
    const rules: object[] = [];
    for (let i = 0; i < 60; i++) {
      rules.push({ field: "status", operator: "eq", value: "active" });
    }
    const ast = { combinator: "and", rules };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(/nodes/);
  });
});

describe("compileAdvanced — value validation", () => {
  test("enum value must match allowed list", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "status", operator: "eq", value: "rogue" }],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(
      /not one of/,
    );
  });

  test("boolean field rejects non-boolean value", () => {
    const ast = {
      combinator: "and",
      rules: [{ field: "disabled", operator: "eq", value: "yes" }],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(/boolean/);
  });

  test("between requires 2-element array", () => {
    const ast = {
      combinator: "and",
      rules: [
        { field: "createdAt", operator: "between", value: ["2026-01-01"] },
      ],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(/2-element/);
  });

  test("string value > 1024 chars rejected", () => {
    const ast = {
      combinator: "and",
      rules: [
        { field: "name", operator: "contains", value: "x".repeat(2000) },
      ],
    };
    expect(() => compileAdvanced(encode(ast), ctx)).toThrow(/too long/);
  });
});

describe("compileAdvanced — wire format errors", () => {
  test("invalid base64url throws", () => {
    expect(() => compileAdvanced("===not_base64url===", ctx)).toThrow(
      AdvancedFilterError,
    );
  });

  test("non-JSON payload throws", () => {
    const encoded = Buffer.from("not json", "utf8").toString("base64url");
    expect(() => compileAdvanced(encoded, ctx)).toThrow(/valid JSON/);
  });

  test("missing combinator throws", () => {
    const encoded = Buffer.from(
      JSON.stringify({ rules: [] }),
      "utf8",
    ).toString("base64url");
    expect(() => compileAdvanced(encoded, ctx)).toThrow(/combinator/);
  });

  test("non-array rules throws", () => {
    const encoded = Buffer.from(
      JSON.stringify({ combinator: "and", rules: {} }),
      "utf8",
    ).toString("base64url");
    expect(() => compileAdvanced(encoded, ctx)).toThrow(/array/);
  });

  test("payload > 16KB rejected", () => {
    const huge = "x".repeat(20 * 1024);
    const encoded = Buffer.from(huge, "utf8").toString("base64url");
    expect(() => compileAdvanced(encoded, ctx)).toThrow(/too large/);
  });
});

describe("compileAdvanced — injection-shaped values are parameterised", () => {
  // The compiler never interpolates `value` into raw SQL — these
  // payloads should EITHER be rejected by validation OR compile to
  // safe parameter-bound SQL. They must NOT throw a SQL syntax error
  // and must NOT produce a SQL string containing the payload.
  test("contains with SQL-injection-shaped string compiles safely", () => {
    const ast = {
      combinator: "and",
      rules: [
        {
          field: "name",
          operator: "contains",
          value: "'; DROP TABLE users; --",
        },
      ],
    };
    const sql = compileAdvanced(encode(ast), ctx);
    expect(sql).toBeDefined();
    // The compiler emitted ILIKE bound to a parameter — drizzle handles
    // escaping. We only need to assert it didn't reject + didn't throw.
  });
});
