/**
 * Service-layer tests for the CMS module.
 *
 * Covers:
 *   - schema-validator: validateSchemaDef, assertNonBreakingChange,
 *     buildZodFromSchemaDef across every supported field type
 *   - service: type CRUD, entry CRUD, alias-or-id key resolution,
 *     additive-only schema evolution, optimistic concurrency on entries,
 *     publish/unpublish, client-side filters
 *
 * Direct factory invocation against the real Neon dev branch — no HTTP,
 * no Better Auth. A single test org is seeded in `beforeAll`; ON DELETE
 * CASCADE sweeps cms_types + cms_entries when the org is deleted.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  CmsBreakingSchemaChange,
  CmsEntryAliasConflict,
  CmsEntryNotFound,
  CmsEntryVersionConflict,
  CmsInvalidData,
  CmsInvalidSchema,
  CmsTypeAliasConflict,
  CmsTypeNotFound,
} from "./errors";
import {
  assertNonBreakingChange,
  buildZodFromSchemaDef,
  validateSchemaDef,
} from "./schema-validator";
import { createCmsService } from "./service";
import type { CmsSchemaDef } from "./types";

// ─── schema-validator unit tests ─────────────────────────────────

describe("validateSchemaDef", () => {
  test("accepts a valid schema across multiple field types", () => {
    const schema: unknown = {
      fields: [
        { name: "title", label: "Title", type: "text", required: true },
        { name: "body", label: "Body", type: "markdown" },
        { name: "count", label: "Count", type: "number" },
        {
          name: "category",
          label: "Category",
          type: "select",
          validation: {
            enum: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        },
        {
          name: "items",
          label: "Items",
          type: "array",
          itemDef: { name: "item", label: "Item", type: "text" },
        },
        {
          name: "meta",
          label: "Meta",
          type: "object",
          fields: [
            { name: "key", label: "Key", type: "text" },
            { name: "val", label: "Value", type: "text" },
          ],
        },
      ],
    };
    expect(() => validateSchemaDef(schema)).not.toThrow();
  });

  test("rejects duplicate field names", () => {
    const schema: unknown = {
      fields: [
        { name: "x", label: "X", type: "text" },
        { name: "x", label: "X again", type: "number" },
      ],
    };
    expect(() => validateSchemaDef(schema)).toThrow(CmsInvalidSchema);
  });

  test("rejects an array field missing itemDef", () => {
    const schema: unknown = {
      fields: [{ name: "xs", label: "Xs", type: "array" }],
    };
    expect(() => validateSchemaDef(schema)).toThrow(CmsInvalidSchema);
  });

  test("rejects a select field with empty enum", () => {
    const schema: unknown = {
      fields: [{ name: "k", label: "K", type: "select", validation: { enum: [] } }],
    };
    expect(() => validateSchemaDef(schema)).toThrow(CmsInvalidSchema);
  });

  test("rejects an unknown field type", () => {
    const schema: unknown = {
      fields: [{ name: "weird", label: "Weird", type: "geocoord" }],
    };
    expect(() => validateSchemaDef(schema)).toThrow(CmsInvalidSchema);
  });
});

describe("assertNonBreakingChange", () => {
  const base: CmsSchemaDef = {
    fields: [
      { name: "title", label: "T", type: "text", required: true },
      { name: "body", label: "B", type: "markdown" },
      {
        name: "tag",
        label: "T",
        type: "select",
        validation: { enum: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      },
    ],
  };

  test("accepts adding a new optional field", () => {
    const next: CmsSchemaDef = {
      fields: [...base.fields, { name: "extra", label: "E", type: "text" }],
    };
    expect(() => assertNonBreakingChange(base, next)).not.toThrow();
  });

  test("rejects removing an existing field", () => {
    const next: CmsSchemaDef = { fields: [base.fields[0]!, base.fields[1]!] };
    expect(() => assertNonBreakingChange(base, next)).toThrow(CmsInvalidSchema);
  });

  test("rejects changing a field's type", () => {
    const next: CmsSchemaDef = {
      fields: base.fields.map((f) =>
        f.name === "body" ? { ...f, type: "number" as const } : f,
      ),
    };
    expect(() => assertNonBreakingChange(base, next)).toThrow(CmsInvalidSchema);
  });

  test("rejects flipping required from false to true", () => {
    const next: CmsSchemaDef = {
      fields: base.fields.map((f) =>
        f.name === "body" ? { ...f, required: true } : f,
      ),
    };
    expect(() => assertNonBreakingChange(base, next)).toThrow(CmsInvalidSchema);
  });

  test("rejects removing an enum value", () => {
    const next: CmsSchemaDef = {
      fields: base.fields.map((f) =>
        f.name === "tag"
          ? {
              ...f,
              validation: { enum: [{ value: "a", label: "A" }] },
            }
          : f,
      ),
    };
    expect(() => assertNonBreakingChange(base, next)).toThrow(CmsInvalidSchema);
  });
});

describe("buildZodFromSchemaDef", () => {
  test("validates basic primitives + required vs optional", () => {
    const schema: CmsSchemaDef = {
      fields: [
        { name: "title", label: "T", type: "text", required: true, validation: { minLength: 1 } },
        { name: "n", label: "N", type: "number", validation: { min: 0, max: 100 } },
        { name: "ok", label: "OK", type: "boolean" },
      ],
    };
    const z = buildZodFromSchemaDef(schema);

    expect(z.safeParse({ title: "hello", n: 5, ok: true }).success).toBe(true);
    // missing optional → ok
    expect(z.safeParse({ title: "hello" }).success).toBe(true);
    // missing required → fail
    expect(z.safeParse({ n: 5 }).success).toBe(false);
    // empty string fails minLength
    expect(z.safeParse({ title: "" }).success).toBe(false);
    // number out of range fails
    expect(z.safeParse({ title: "x", n: 999 }).success).toBe(false);
  });

  test("validates nested object + array + select", () => {
    const schema: CmsSchemaDef = {
      fields: [
        {
          name: "kind",
          label: "Kind",
          type: "select",
          required: true,
          validation: { enum: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        },
        {
          name: "items",
          label: "Items",
          type: "array",
          itemDef: { name: "n", label: "n", type: "number" },
          validation: { min: 1, max: 3 },
        },
        {
          name: "meta",
          label: "Meta",
          type: "object",
          fields: [{ name: "url", label: "URL", type: "text" }],
        },
      ],
    };
    const z = buildZodFromSchemaDef(schema);

    expect(z.safeParse({ kind: "a", items: [1, 2], meta: { url: "x" } }).success).toBe(true);
    expect(z.safeParse({ kind: "c", items: [1] }).success).toBe(false); // bad enum
    expect(z.safeParse({ kind: "a", items: [] }).success).toBe(false); // array min
    expect(z.safeParse({ kind: "a", items: [1, 2, 3, 4] }).success).toBe(false); // array max
  });

  test("validates image and entryRef", () => {
    const schema: CmsSchemaDef = {
      fields: [
        { name: "cover", label: "Cover", type: "image" },
        { name: "ref", label: "Ref", type: "entryRef" },
      ],
    };
    const z = buildZodFromSchemaDef(schema);
    expect(z.safeParse({ cover: { mediaId: "abc" }, ref: { typeAlias: "t", alias: "a" } }).success).toBe(true);
    expect(z.safeParse({ cover: { mediaId: "" } }).success).toBe(false);
    expect(z.safeParse({ ref: { typeAlias: "t" } }).success).toBe(false);
  });

  test("validates date / datetime / multiselect / json", () => {
    const schema: CmsSchemaDef = {
      fields: [
        { name: "d", label: "D", type: "date" },
        { name: "dt", label: "DT", type: "datetime" },
        {
          name: "tags",
          label: "Tags",
          type: "multiselect",
          validation: { enum: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
        },
        { name: "raw", label: "Raw", type: "json" },
      ],
    };
    const z = buildZodFromSchemaDef(schema);
    expect(z.safeParse({ d: "2026-04-25", dt: "2026-04-25T12:00:00+00:00", tags: ["x"], raw: { anything: 1 } }).success).toBe(true);
    expect(z.safeParse({ d: "2026/04/25" }).success).toBe(false); // wrong date format
    expect(z.safeParse({ tags: ["zz"] }).success).toBe(false); // bad enum
  });
});

// ─── service integration tests (real DB) ─────────────────────────

describe("cms service", () => {
  const svc = createCmsService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("cms-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // helper — keeps each test on its own type alias to dodge unique conflicts
  const baseSchema: CmsSchemaDef = {
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Body", type: "markdown" },
    ],
  };

  test("createType + getType (by alias) + listTypes", async () => {
    const created = await svc.createType(orgId, {
      alias: "post-a",
      name: "Post A",
      schema: baseSchema,
    });
    expect(created.alias).toBe("post-a");
    expect(created.schemaVersion).toBe(1);

    const fetched = await svc.getType(orgId, "post-a");
    expect(fetched.id).toBe(created.id);

    const fetchedById = await svc.getType(orgId, created.id);
    expect(fetchedById.alias).toBe("post-a");

    const list = await svc.listTypes(orgId);
    expect(list.items.find((t) => t.alias === "post-a")).toBeDefined();
  });

  test("createType duplicate alias → CmsTypeAliasConflict", async () => {
    await svc.createType(orgId, {
      alias: "dup-type",
      name: "Dup",
      schema: baseSchema,
    });
    await expect(
      svc.createType(orgId, {
        alias: "dup-type",
        name: "Dup 2",
        schema: baseSchema,
      }),
    ).rejects.toBeInstanceOf(CmsTypeAliasConflict);
  });

  test("getType for missing alias → CmsTypeNotFound", async () => {
    await expect(svc.getType(orgId, "nope-nope")).rejects.toBeInstanceOf(
      CmsTypeNotFound,
    );
  });

  test("updateType: additive schema bump increments schemaVersion", async () => {
    await svc.createType(orgId, {
      alias: "evo-add",
      name: "Evo",
      schema: baseSchema,
    });
    const updated = await svc.updateType(orgId, "evo-add", {
      schema: {
        fields: [
          ...baseSchema.fields,
          { name: "extra", label: "Extra", type: "text" },
        ],
      },
    });
    expect(updated.schemaVersion).toBe(2);
  });

  test("updateType: breaking schema change → CmsBreakingSchemaChange", async () => {
    await svc.createType(orgId, {
      alias: "evo-break",
      name: "Evo Break",
      schema: baseSchema,
    });
    await expect(
      svc.updateType(orgId, "evo-break", {
        // remove `body` — breaking
        schema: { fields: [baseSchema.fields[0]!] },
      }),
    ).rejects.toBeInstanceOf(CmsBreakingSchemaChange);
  });

  test("deleteType cascades to entries", async () => {
    const t = await svc.createType(orgId, {
      alias: "del-me",
      name: "Del",
      schema: baseSchema,
    });
    await svc.createEntry(orgId, "del-me", {
      alias: "e1",
      data: { title: "hi" },
    });
    await svc.deleteType(orgId, t.id);
    await expect(svc.getEntry(orgId, "del-me", "e1")).rejects.toBeInstanceOf(
      CmsEntryNotFound,
    );
  });

  test("createEntry: data validated against type schema; bad data → CmsInvalidData", async () => {
    await svc.createType(orgId, {
      alias: "post-validate",
      name: "Post",
      schema: baseSchema,
    });
    // missing required `title`
    await expect(
      svc.createEntry(orgId, "post-validate", {
        alias: "bad",
        data: { body: "no title" },
      }),
    ).rejects.toBeInstanceOf(CmsInvalidData);

    // good
    const e = await svc.createEntry(orgId, "post-validate", {
      alias: "good",
      data: { title: "hello", body: "world" },
    });
    expect(e.alias).toBe("good");
    expect(e.status).toBe("draft");
    expect(e.schemaVersion).toBe(1);
    expect(e.version).toBe(1);
  });

  test("createEntry duplicate alias within type → CmsEntryAliasConflict", async () => {
    await svc.createType(orgId, {
      alias: "post-dup",
      name: "P",
      schema: baseSchema,
    });
    await svc.createEntry(orgId, "post-dup", {
      alias: "x",
      data: { title: "1" },
    });
    await expect(
      svc.createEntry(orgId, "post-dup", {
        alias: "x",
        data: { title: "2" },
      }),
    ).rejects.toBeInstanceOf(CmsEntryAliasConflict);
  });

  test("updateEntry: optimistic concurrency via version", async () => {
    await svc.createType(orgId, {
      alias: "post-conc",
      name: "P",
      schema: baseSchema,
    });
    const e = await svc.createEntry(orgId, "post-conc", {
      alias: "c1",
      data: { title: "v1" },
    });

    // Stale version → conflict
    await expect(
      svc.updateEntry(orgId, "post-conc", "c1", {
        version: 0,
        data: { title: "v2" },
      }),
    ).rejects.toBeInstanceOf(CmsEntryVersionConflict);

    // Correct version → ok, version bumps
    const updated = await svc.updateEntry(orgId, "post-conc", "c1", {
      version: e.version,
      data: { title: "v2" },
    });
    expect(updated.version).toBe(2);
    expect((updated.data as { title: string }).title).toBe("v2");
  });

  test("publishEntry sets publishedAt + status; unpublish clears publishedAt", async () => {
    await svc.createType(orgId, {
      alias: "post-pub",
      name: "P",
      schema: baseSchema,
    });
    const e = await svc.createEntry(orgId, "post-pub", {
      alias: "p1",
      data: { title: "hi" },
    });
    expect(e.status).toBe("draft");

    const pub = await svc.publishEntry(orgId, "post-pub", "p1");
    expect(pub.status).toBe("published");
    expect(pub.publishedAt).toBeInstanceOf(Date);

    const unpub = await svc.unpublishEntry(orgId, "post-pub", "p1");
    expect(unpub.status).toBe("draft");
    expect(unpub.publishedAt).toBeNull();
  });

  test("clientGetByAlias returns null for draft, the row for published", async () => {
    await svc.createType(orgId, {
      alias: "client-by-alias",
      name: "C",
      schema: baseSchema,
    });
    await svc.createEntry(orgId, "client-by-alias", {
      alias: "draft1",
      data: { title: "draft" },
    });
    await svc.createEntry(orgId, "client-by-alias", {
      alias: "live1",
      data: { title: "live" },
      status: "published",
    });

    expect(
      await svc.clientGetByAlias(orgId, "client-by-alias", "draft1"),
    ).toBeNull();
    const live = await svc.clientGetByAlias(
      orgId,
      "client-by-alias",
      "live1",
    );
    expect(live?.alias).toBe("live1");
  });

  test("clientListByGroup / clientListByTag only return published", async () => {
    await svc.createType(orgId, {
      alias: "client-filters",
      name: "CF",
      schema: baseSchema,
    });
    await svc.createEntry(orgId, "client-filters", {
      alias: "g1",
      groupKey: "home",
      tags: ["welcome"],
      data: { title: "1" },
      status: "published",
    });
    await svc.createEntry(orgId, "client-filters", {
      alias: "g2",
      groupKey: "home",
      tags: ["welcome", "tutorial"],
      data: { title: "2" },
    }); // draft
    await svc.createEntry(orgId, "client-filters", {
      alias: "g3",
      groupKey: "home",
      tags: ["unrelated"],
      data: { title: "3" },
      status: "published",
    });

    const grp = await svc.clientListByGroup(orgId, "client-filters", "home");
    const grpAliases = grp.map((r) => r.alias).sort();
    expect(grpAliases).toEqual(["g1", "g3"]); // g2 is draft

    const tag = await svc.clientListByTag(orgId, "welcome");
    const tagAliases = tag.map((r) => r.alias).sort();
    expect(tagAliases).toEqual(["g1"]); // g2 is draft, g3 has different tag
  });

  test("orgId isolation: another org cannot see types of this org", async () => {
    await svc.createType(orgId, {
      alias: "iso-test",
      name: "Iso",
      schema: baseSchema,
    });
    const otherOrg = await createTestOrg("cms-svc-other");
    try {
      await expect(svc.getType(otherOrg, "iso-test")).rejects.toBeInstanceOf(
        CmsTypeNotFound,
      );
      const list = await svc.listTypes(otherOrg);
      expect(list.items.find((t) => t.alias === "iso-test")).toBeUndefined();
    } finally {
      await deleteTestOrg(otherOrg);
    }
  });
});
