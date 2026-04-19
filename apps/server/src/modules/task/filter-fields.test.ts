import { describe, expect, test } from "vitest";

import {
  extractReferencedFields,
  findUnknownFilterFields,
} from "./filter-fields";

describe("extractReferencedFields", () => {
  test("flat field", () => {
    expect(extractReferencedFields('monsterId == "dragon"')).toEqual([
      "monsterId",
    ]);
  });

  test("dot paths", () => {
    expect(
      extractReferencedFields(
        'stats.level >= 10 and stats.elite == true',
      ),
    ).toEqual(["stats.elite", "stats.level"]);
  });

  test("filters out keywords", () => {
    expect(extractReferencedFields("a and b or not c")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("filters out uppercase keywords too", () => {
    expect(extractReferencedFields("a AND b OR NOT c")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("unique", () => {
    expect(extractReferencedFields("a == 1 and a > 0")).toEqual(["a"]);
  });

  test("numeric literals are not treated as fields", () => {
    expect(extractReferencedFields("amount > 100")).toEqual(["amount"]);
  });
});

describe("findUnknownFilterFields", () => {
  test("empty known list → no warnings", () => {
    expect(findUnknownFilterFields("a > 0", [])).toEqual([]);
  });

  test("all known → no warnings", () => {
    expect(
      findUnknownFilterFields("amount > 0 and currency == \"USD\"", [
        "amount",
        "currency",
      ]),
    ).toEqual([]);
  });

  test("unknown fields are returned sorted", () => {
    expect(
      findUnknownFilterFields(
        "amount > 0 and tier == 1",
        ["amount"],
      ),
    ).toEqual(["tier"]);
  });

  test("dot-path missing from known returns the full path", () => {
    expect(
      findUnknownFilterFields("stats.level >= 10", ["stats"]),
    ).toEqual(["stats.level"]);
  });
});
