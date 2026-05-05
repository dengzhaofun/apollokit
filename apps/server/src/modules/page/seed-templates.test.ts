/**
 * Seed-template integration tests (PR 7).
 *
 * Verifies:
 *   - the seeded set is non-empty + has the 8 expected official slugs
 *   - upsertTemplate is idempotent (run seed twice → same row count)
 *   - every template's schema parses against pageProjectSchemaSchema
 *     (caught at runtime; otherwise a malformed template would only
 *     fail at first project create)
 *   - every block referenced by a template is in the catalog (so the
 *     pages worker can render the seeded v1 draft without falling to
 *     the unknown-block stub)
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { aiMetadata } from "@repo/page-blocks/ai-metadata";
import { pageProjectSchemaSchema } from "@repo/page-blocks/schema";

import { db } from "../../db";
import { pageTemplates } from "../../schema/page";
import { eq } from "drizzle-orm";

import {
  OFFICIAL_PAGE_TEMPLATES,
  seedOfficialTemplates,
} from "./seed-templates";

const CATALOG_TYPES = new Set(Object.keys(aiMetadata));

describe("seed-templates fixture", () => {
  test("ships the 8 expected official slugs in stable sort order", () => {
    expect(OFFICIAL_PAGE_TEMPLATES.map((t) => t.slug)).toEqual([
      "daily-checkin-promo",
      "seasonal-shop",
      "lottery-spin",
      "cdkey-redeem-simple",
      "leaderboard-arena",
      "marketing-hero-only",
      "achievement-wall",
      "event-signup",
    ]);
  });

  test("every template's schema validates against pageProjectSchemaSchema", () => {
    for (const t of OFFICIAL_PAGE_TEMPLATES) {
      expect(() => pageProjectSchemaSchema.parse(t.schema)).not.toThrow();
    }
  });

  test("every block referenced by a template is registered in the catalog", () => {
    for (const t of OFFICIAL_PAGE_TEMPLATES) {
      for (const page of t.schema.pages) {
        for (const block of page.blocks) {
          expect(CATALOG_TYPES.has(block.type)).toBe(true);
        }
      }
    }
  });

  test("every block.binding.module is in the template's requiredModules", () => {
    for (const t of OFFICIAL_PAGE_TEMPLATES) {
      const required = new Set(t.requiredModules);
      for (const page of t.schema.pages) {
        for (const block of page.blocks) {
          if (block.binding) {
            expect(
              required.has(block.binding.module),
              `template ${t.slug} block ${block.id} binds module ${block.binding.module} but template.requiredModules doesn't include it`,
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("seedOfficialTemplates (DB integration)", () => {
  // Capture which slugs we touch so we can clean up at the end. The
  // templates are global (no tenantId) so a parallel test seeding the
  // same slugs would race; vitest runs files serially with
  // fileParallelism: false (see apps/server/vitest.config.ts) so
  // that's not a concern here.
  const seededSlugs = OFFICIAL_PAGE_TEMPLATES.map((t) => t.slug);

  afterAll(async () => {
    // Best-effort cleanup. If the DB connection is already closed
    // (test env teardown) just swallow; the next run will re-upsert.
    try {
      for (const slug of seededSlugs) {
        await db.delete(pageTemplates).where(eq(pageTemplates.slug, slug));
      }
    } catch {
      /* ignore */
    }
  });

  test("first call inserts all templates", async () => {
    const result = await seedOfficialTemplates();
    expect(result.upserted).toBe(seededSlugs.length);

    const rows = await db.select().from(pageTemplates);
    const seededRows = rows.filter((r) => seededSlugs.includes(r.slug));
    expect(seededRows.length).toBe(seededSlugs.length);
  });

  test("second call is idempotent (upsert by slug)", async () => {
    const before = await db.select().from(pageTemplates);
    const beforeIds = new Map(before.map((r) => [r.slug, r.id]));

    await seedOfficialTemplates();

    const after = await db.select().from(pageTemplates);
    expect(after.length).toBe(before.length);
    for (const slug of seededSlugs) {
      const a = after.find((r) => r.slug === slug);
      expect(a?.id).toBe(beforeIds.get(slug));
    }
  });
});
