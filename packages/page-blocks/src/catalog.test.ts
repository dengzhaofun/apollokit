/**
 * Catalog / schema consistency tests.
 *
 * Verifies:
 *   - per-component zod props schemas accept canonical examples and
 *     reject obviously broken inputs
 *   - the outer `pageProjectSchemaSchema` accepts a fixture and rejects
 *     missing fields
 *   - `validatePageProjectSchema` catches duplicate ids, missing
 *     defaultPageId, unknown block types, unknown module bindings
 *   - `aiMetadata` keys ⊆ catalog component ids (no orphan metadata)
 *   - `CATALOG_BLOCK_TYPES` includes all 4 expected ids
 */

import { describe, expect, test } from "vitest";

import { aiMetadata, getBlockMetadata } from "./ai-metadata.js";
import { CATALOG_BLOCK_TYPES, catalog } from "./catalog.js";
import { authFormPropsSchema } from "./components/auth-form.js";
import { featureGridPropsSchema } from "./components/feature-grid.js";
import { footerPropsSchema } from "./components/footer.js";
import { heroPropsSchema } from "./components/hero.js";
import {
  pageProjectSchemaSchema,
  validatePageProjectSchema,
  type PageProjectSchema,
} from "./schema.js";

// ─── Catalog completeness ─────────────────────────────────────────

describe("catalog", () => {
  test("registers the expected 12 block types (PR 2/5/6)", () => {
    expect(Array.from(CATALOG_BLOCK_TYPES).sort()).toEqual([
      "activity-form",
      "auth-form",
      "badge-wall",
      "cdkey-redeem",
      "check-in-board",
      "feature-grid",
      "footer",
      "hero",
      "leaderboard-card",
      "lottery-wheel",
      "mail-inbox",
      "shop-grid",
    ]);
  });

  test("zodSchema() resolves without throwing", () => {
    // Sanity: the catalog can produce its zod schema (used by the agent
    // tool input layer). Doesn't assert shape — just that it doesn't
    // throw on first call.
    expect(() => catalog.zodSchema()).not.toThrow();
  });
});

// ─── AI metadata ──────────────────────────────────────────────────

describe("ai-metadata", () => {
  test("every metadata entry references a real catalog id", () => {
    for (const type of Object.keys(aiMetadata)) {
      expect(CATALOG_BLOCK_TYPES.has(type)).toBe(true);
    }
  });

  test("every catalog id has corresponding AI metadata", () => {
    for (const id of CATALOG_BLOCK_TYPES) {
      expect(getBlockMetadata(id)).toBeDefined();
    }
  });

  test("every example references its own type", () => {
    for (const meta of Object.values(aiMetadata)) {
      for (const ex of meta.examples) {
        expect(ex.type).toBe(meta.type);
      }
    }
  });
});

// ─── Per-component zod schemas ────────────────────────────────────

describe("hero props zod", () => {
  test("accepts a minimal valid props bag", () => {
    expect(() =>
      heroPropsSchema.parse({ title: "Spring Festival" }),
    ).not.toThrow();
  });

  test("rejects empty title", () => {
    expect(() => heroPropsSchema.parse({ title: "" })).toThrow();
  });

  test("rejects non-url ctaHref", () => {
    expect(() =>
      heroPropsSchema.parse({ title: "x", ctaHref: "not-a-url" }),
    ).toThrow();
  });
});

describe("feature-grid props zod", () => {
  test("accepts 3 items", () => {
    expect(() =>
      featureGridPropsSchema.parse({
        items: [
          { title: "a" },
          { title: "b" },
          { title: "c" },
        ],
      }),
    ).not.toThrow();
  });

  test("rejects empty items", () => {
    expect(() =>
      featureGridPropsSchema.parse({ items: [] }),
    ).toThrow();
  });

  test("rejects more than 12 items", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ title: `t${i}` }));
    expect(() => featureGridPropsSchema.parse({ items })).toThrow();
  });
});

describe("footer props zod", () => {
  test("accepts brandName-only", () => {
    expect(() => footerPropsSchema.parse({ brandName: "X" })).not.toThrow();
  });

  test("rejects missing brandName", () => {
    expect(() => footerPropsSchema.parse({})).toThrow();
  });
});

describe("auth-form props zod", () => {
  test("accepts empty object (uses defaults)", () => {
    const parsed = authFormPropsSchema.parse({});
    expect(parsed.defaultMode).toBe("sign-in");
    expect(parsed.enableMagicLink).toBe(true);
  });

  test("rejects unknown defaultMode", () => {
    expect(() =>
      authFormPropsSchema.parse({ defaultMode: "wat" }),
    ).toThrow();
  });
});

// ─── Outer pageProjectSchema ──────────────────────────────────────

describe("pageProjectSchemaSchema", () => {
  const valid: PageProjectSchema = {
    version: 1,
    theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        blocks: [
          { id: "h", type: "hero", props: { title: "Hi" } },
        ],
      },
    ],
    defaultPageId: "home",
  };

  test("accepts valid fixture", () => {
    expect(() => pageProjectSchemaSchema.parse(valid)).not.toThrow();
  });

  test("rejects missing pages", () => {
    expect(() =>
      pageProjectSchemaSchema.parse({ ...valid, pages: [] }),
    ).toThrow();
  });

  test("rejects wrong version literal", () => {
    expect(() =>
      pageProjectSchemaSchema.parse({ ...valid, version: 2 }),
    ).toThrow();
  });
});

// ─── Cross-reference validator ────────────────────────────────────

describe("validatePageProjectSchema", () => {
  const base: PageProjectSchema = {
    version: 1,
    theme: { primary: "#FF6B35", bg: "#000", fg: "#fff" },
    pages: [
      {
        id: "home",
        path: "/",
        title: "Home",
        blocks: [{ id: "h1", type: "hero", props: {} }],
      },
    ],
    defaultPageId: "home",
  };

  test("returns no issues for clean schema", () => {
    expect(validatePageProjectSchema(base)).toEqual([]);
  });

  test("flags duplicate page ids", () => {
    const dup: PageProjectSchema = {
      ...base,
      pages: [
        { id: "p", path: "/", title: "A", blocks: [] },
        { id: "p", path: "/b", title: "B", blocks: [] },
      ],
      defaultPageId: "p",
    };
    const issues = validatePageProjectSchema(dup);
    expect(issues.some((i) => i.message.includes("duplicate page id"))).toBe(
      true,
    );
  });

  test("flags duplicate block ids within a page", () => {
    const dup: PageProjectSchema = {
      ...base,
      pages: [
        {
          id: "home",
          path: "/",
          title: "Home",
          blocks: [
            { id: "x", type: "hero", props: {} },
            { id: "x", type: "footer", props: {} },
          ],
        },
      ],
    };
    const issues = validatePageProjectSchema(dup);
    expect(
      issues.some((i) => i.message.includes("duplicate block id")),
    ).toBe(true);
  });

  test("flags missing defaultPageId", () => {
    const issues = validatePageProjectSchema({
      ...base,
      defaultPageId: "ghost",
    });
    expect(
      issues.some((i) => i.message.includes("defaultPageId references")),
    ).toBe(true);
  });

  test("flags unknown block type when allowedTypes is supplied", () => {
    const issues = validatePageProjectSchema(
      {
        ...base,
        pages: [
          {
            id: "home",
            path: "/",
            title: "Home",
            blocks: [{ id: "h", type: "non-existent", props: {} }],
          },
        ],
      },
      { allowedTypes: CATALOG_BLOCK_TYPES },
    );
    expect(
      issues.some((i) => i.message.includes("unknown block type")),
    ).toBe(true);
  });

  test("flags binding to module not in allowedModules", () => {
    const issues = validatePageProjectSchema(
      {
        ...base,
        pages: [
          {
            id: "home",
            path: "/",
            title: "Home",
            blocks: [
              {
                id: "h",
                type: "hero",
                props: {},
                binding: { module: "shop" },
              },
            ],
          },
        ],
      },
      { allowedModules: new Set(["check-in"]) },
    );
    expect(
      issues.some((i) =>
        i.message.includes("references module not in project boundModules"),
      ),
    ).toBe(true);
  });

  test("flags navigation reference to unknown page", () => {
    const issues = validatePageProjectSchema({
      ...base,
      navigation: { items: [{ label: "About", pageId: "missing" }] },
    });
    expect(
      issues.some((i) =>
        i.message.includes("navigation item references unknown page"),
      ),
    ).toBe(true);
  });
});
