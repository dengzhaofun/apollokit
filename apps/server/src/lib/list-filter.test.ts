/**
 * Pure unit tests for the list-filter DSL — no database required.
 *
 * Covers:
 *   - Field factories produce schemas that parse + reject as documented
 *   - `where()` skips when no filters present, composes when they are
 *   - `defineListFilter` merges with PaginationQuerySchema correctly
 *   - The admin-side schema fragment is looser (string→native coerced)
 *
 * Integration of advanced-filter is covered in `advanced-filter.test.ts`.
 * End-to-end SQL correctness against Postgres is covered in the
 * end-user `service.test.ts` once the module is migrated.
 */

import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import { defineListFilter, f } from "./list-filter";

// Minimal fake table — the DSL binds against any drizzle column,
// the table doesn't have to exist in the live schema.
const fixture = pgTable("filter_test_fixture", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  alias: text("alias"),
  status: text("status").notNull(),
  disabled: boolean("disabled").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

describe("defineListFilter — field factories", () => {
  test("enumOf parses allowed values, rejects unknown, drops empty", () => {
    const filter = defineListFilter({
      status: f.enumOf(["active", "paused", "ended"], { column: fixture.status }),
    }).build();

    const ok = filter.querySchema.safeParse({ status: "active" });
    expect(ok.success).toBe(true);
    expect(ok.data?.status).toBe("active");

    const bad = filter.querySchema.safeParse({ status: "rogue" });
    expect(bad.success).toBe(false);

    const omitted = filter.querySchema.safeParse({});
    expect(omitted.success).toBe(true);
    expect(omitted.data?.status).toBeUndefined();

    // where() returns SQL for filled, undefined for empty
    expect(filter.where({ status: "active" })).toBeDefined();
    expect(filter.where({})).toBeUndefined();
  });

  test("multiEnum parses comma-separated, validates each element", () => {
    const filter = defineListFilter({
      status: f.multiEnum(["a", "b", "c"], { column: fixture.status }),
    }).build();

    const ok = filter.querySchema.safeParse({ status: "a,b" });
    expect(ok.success).toBe(true);
    expect((ok.data as { status?: string[] }).status).toEqual(["a", "b"]);

    // Unknown member in the comma list rejects
    const bad = filter.querySchema.safeParse({ status: "a,zzz" });
    expect(bad.success).toBe(false);
  });

  test("boolean coerces 'true'/'false' strings to native booleans", () => {
    const filter = defineListFilter({
      disabled: f.boolean({ column: fixture.disabled }),
    }).build();

    const t = filter.querySchema.safeParse({ disabled: "true" });
    expect(t.success).toBe(true);
    expect((t.data as { disabled?: boolean }).disabled).toBe(true);

    const f0 = filter.querySchema.safeParse({ disabled: "false" });
    expect((f0.data as { disabled?: boolean }).disabled).toBe(false);

    const native = filter.querySchema.safeParse({ disabled: true });
    expect((native.data as { disabled?: boolean }).disabled).toBe(true);
  });

  test("dateRange contributes Gte/Lte URL keys", () => {
    const filter = defineListFilter({
      createdAt: f.dateRange({ column: fixture.createdAt }),
    }).build();

    const ok = filter.querySchema.safeParse({
      createdAtGte: "2026-01-01",
      createdAtLte: "2026-02-01",
    });
    expect(ok.success).toBe(true);

    expect(
      filter.where({
        createdAtGte: new Date("2026-01-01"),
        createdAtLte: new Date("2026-02-01"),
      }),
    ).toBeDefined();

    // Either bound alone is also valid
    expect(filter.where({ createdAtGte: new Date("2026-01-01") })).toBeDefined();
    expect(filter.where({ createdAtLte: new Date("2026-02-01") })).toBeDefined();
    expect(filter.where({})).toBeUndefined();
  });

  test("custom enum mapping via { where } supports derived columns", () => {
    let lastV: string | undefined;
    const filter = defineListFilter({
      origin: f.enumOf(["managed", "synced"], {
        where: (v) => {
          lastV = v;
          return undefined; // returning undefined is allowed
        },
      }),
    }).build();

    filter.where({ origin: "managed" });
    expect(lastV).toBe("managed");
  });

  test("either { column } or { where } is required for enumOf/boolean/uuid", () => {
    expect(() => f.enumOf(["a", "b"])("status")).toThrow(/column.*where/);
    expect(() => f.boolean()("flag")).toThrow();
    expect(() => f.uuid()("ref")).toThrow();
  });
});

describe("defineListFilter — composition", () => {
  test("merges with PaginationQuerySchema (cursor / limit / q present)", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
    }).build();

    const parsed = filter.querySchema.safeParse({
      cursor: "abc",
      limit: 10,
      q: "search",
      status: "a",
    });
    expect(parsed.success).toBe(true);
  });

  test("multiple filter values compose into one WHERE", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
      disabled: f.boolean({ column: fixture.disabled }),
    }).build();

    expect(filter.where({ status: "a", disabled: true })).toBeDefined();
    // Empty input → no WHERE
    expect(filter.where({})).toBeUndefined();
  });

  test("search() registers ILIKE columns; q triggers a search clause", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
    })
      .search({ columns: [fixture.name, fixture.alias] })
      .build();

    expect(filter.where({ q: "alice" })).toBeDefined();
    expect(filter.where({})).toBeUndefined();
    expect(filter.search?.mode).toBe("ilike");
  });

  test("fields metadata exposes id + kind + operators per field", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
      createdAt: f.dateRange({ column: fixture.createdAt }),
    }).build();

    const ids = filter.fields.map((f) => f.id);
    expect(ids).toContain("status");
    expect(ids).toContain("createdAt");

    const status = filter.fields.find((f) => f.id === "status")!;
    expect(status.kind).toBe("enum");
    expect(status.operators).toContain("eq");
    expect(status.operators).toContain("ne");
  });
});

describe("defineListFilter — admin schema fragment", () => {
  test("admin fragment coerces strings without rejecting", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
      disabled: f.boolean({ column: fixture.disabled }),
    }).build();

    const parsed = filter.adminQueryFragment.safeParse({
      status: "a",
      disabled: "true",
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as { disabled?: boolean }).disabled).toBe(true);
  });

  test("admin fragment is all-optional (empty input parses)", () => {
    const filter = defineListFilter({
      status: f.enumOf(["a", "b"], { column: fixture.status }),
    }).build();
    const parsed = filter.adminQueryFragment.safeParse({});
    expect(parsed.success).toBe(true);
  });
});
