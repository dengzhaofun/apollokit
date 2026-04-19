import { describe, expect, test } from "vitest";

import { inferFields, mergeFields } from "./infer";

describe("inferFields", () => {
  test("flat payload", () => {
    const fields = inferFields({ amount: 100, currency: "USD" });
    expect(fields).toEqual([
      { path: "amount", type: "number", required: false },
      { path: "currency", type: "string", required: false },
    ]);
  });

  test("nested object is flattened", () => {
    const fields = inferFields({
      monsterId: "dragon",
      stats: { level: 10, elite: true },
    });
    expect(fields).toEqual([
      { path: "monsterId", type: "string", required: false },
      { path: "stats", type: "object", required: false },
      { path: "stats.elite", type: "boolean", required: false },
      { path: "stats.level", type: "number", required: false },
    ]);
  });

  test("array is atomic (not descended)", () => {
    const fields = inferFields({ items: [1, 2, 3] });
    expect(fields).toEqual([
      { path: "items", type: "array", required: false },
    ]);
  });

  test("null becomes 'null' type", () => {
    const fields = inferFields({ parent: null });
    expect(fields).toEqual([
      { path: "parent", type: "null", required: false },
    ]);
  });

  test("max depth cap prevents stack blow-up", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    const fields = inferFields(deep);
    expect(fields.length).toBeLessThan(20);
  });

  test("empty object yields empty schema", () => {
    expect(inferFields({})).toEqual([]);
  });
});

describe("mergeFields", () => {
  test("new paths appended", () => {
    const existing = [{ path: "a", type: "string" as const, required: false }];
    const inferred = [{ path: "b", type: "number" as const, required: false }];
    expect(mergeFields(existing, inferred)).toEqual([
      { path: "a", type: "string", required: false },
      { path: "b", type: "number", required: false },
    ]);
  });

  test("existing fields kept verbatim (admin edits preserved)", () => {
    const existing = [
      {
        path: "amount",
        type: "number" as const,
        description: "user-paid amount in cents",
        required: true,
      },
    ];
    const inferred = [
      { path: "amount", type: "string" as const, required: false },
    ];
    expect(mergeFields(existing, inferred)).toEqual([
      {
        path: "amount",
        type: "number",
        description: "user-paid amount in cents",
        required: true,
      },
    ]);
  });

  test("sort by path", () => {
    const existing = [
      { path: "b", type: "number" as const, required: false },
      { path: "a", type: "string" as const, required: false },
    ];
    const merged = mergeFields(existing, []);
    expect(merged.map((r) => r.path)).toEqual(["a", "b"]);
  });
});
