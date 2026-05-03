/**
 * Service-layer tests for announcement.
 *
 * Hits the real Neon dev branch. Covers:
 *   - CRUD + alias uniqueness per org
 *   - visibility window filtering on the client resolver
 *   - priority DESC, createdAt DESC ordering
 *   - visibleFrom / visibleUntil validation (from must be < until)
 *   - impression / click event emission
 *   - tenant isolation (one org can't read another's announcements)
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { EventBus } from "../../lib/event-bus";
import { createEventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createAnnouncementService } from "./service";

describe("announcement service", () => {
  let events: EventBus;
  let svc: ReturnType<typeof createAnnouncementService>;
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    events = createEventBus();
    svc = createAnnouncementService({ db, events });
    orgId = await createTestOrg("announcement-svc");
    otherOrgId = await createTestOrg("announcement-svc-other");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
    await deleteTestOrg(otherOrgId);
  });

  test("create + get by alias roundtrip", async () => {
    const row = await svc.create(
      orgId,
      {
        alias: "welcome",
        kind: "modal",
        title: "Welcome",
        body: "# Hello",
      },
      null,
    );
    expect(row.alias).toBe("welcome");
    expect(row.kind).toBe("modal");
    expect(row.priority).toBe(0);
    expect(row.severity).toBe("info");
    expect(row.isActive).toBe(true);

    const fetched = await svc.getByAlias(orgId, "welcome");
    expect(fetched.id).toBe(row.id);
  });

  test("duplicate alias within org is rejected", async () => {
    await svc.create(
      orgId,
      { alias: "dup", kind: "feed", title: "first", body: "x" },
      null,
    );
    await expect(
      svc.create(
        orgId,
        { alias: "dup", kind: "feed", title: "second", body: "y" },
        null,
      ),
    ).rejects.toMatchObject({ code: "announcement.alias_conflict" });
  });

  test("same alias allowed across different orgs", async () => {
    await svc.create(
      orgId,
      { alias: "shared", kind: "modal", title: "orgA", body: "a" },
      null,
    );
    // Should NOT throw — the unique index is scoped to (org, alias).
    const other = await svc.create(
      otherOrgId,
      { alias: "shared", kind: "modal", title: "orgB", body: "b" },
      null,
    );
    expect(other.tenantId).toBe(otherOrgId);
  });

  test("getByAlias is tenant-isolated", async () => {
    await svc.create(
      otherOrgId,
      { alias: "other-only", kind: "ticker", title: "x", body: "x" },
      null,
    );
    await expect(svc.getByAlias(orgId, "other-only")).rejects.toMatchObject({
      code: "announcement.not_found",
    });
  });

  test("update patches only provided fields, re-validates window", async () => {
    await svc.create(
      orgId,
      {
        alias: "upd",
        kind: "modal",
        title: "before",
        body: "b",
        priority: 1,
      },
      null,
    );
    const updated = await svc.update(orgId, "upd", { title: "after" });
    expect(updated.title).toBe("after");
    expect(updated.priority).toBe(1); // untouched

    // Reject inverted window.
    const now = Date.now();
    await expect(
      svc.update(orgId, "upd", {
        visibleFrom: new Date(now + 1000).toISOString(),
        visibleUntil: new Date(now).toISOString(),
      }),
    ).rejects.toMatchObject({
      code: "announcement.invalid_visibility_window",
    });
  });

  test("remove is tenant-isolated + emits deleted event", async () => {
    const row = await svc.create(
      orgId,
      { alias: "del", kind: "feed", title: "del", body: "d" },
      null,
    );

    let deletedPayload:
      | {
          tenantId: string;
          announcementId: string;
          alias: string;
        }
      | null = null;
    events.on("announcement.deleted", (p) => {
      deletedPayload = p;
    });

    // Wrong org → 404.
    await expect(svc.remove(otherOrgId, "del")).rejects.toMatchObject({
      code: "announcement.not_found",
    });

    await svc.remove(orgId, "del");
    expect(deletedPayload).not.toBeNull();
    expect(deletedPayload!.announcementId).toBe(row.id);

    await expect(svc.getByAlias(orgId, "del")).rejects.toMatchObject({
      code: "announcement.not_found",
    });
  });

  test("getActiveForClient filters by isActive + visibility window", async () => {
    // Seed scratch org so ordering expectations don't collide with other tests.
    const scratch = await createTestOrg("announcement-active");
    try {
      const now = Date.now();
      const past = new Date(now - 60 * 60 * 1000).toISOString();
      const veryPast = new Date(now - 2 * 60 * 60 * 1000).toISOString();
      const future = new Date(now + 60 * 60 * 1000).toISOString();

      await svc.create(
        scratch,
        {
          alias: "now-live",
          kind: "modal",
          title: "live",
          body: "x",
          visibleFrom: past,
          visibleUntil: future,
        },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "ended",
          kind: "modal",
          title: "ended",
          body: "x",
          visibleFrom: veryPast,
          visibleUntil: past, // already over
        },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "future",
          kind: "modal",
          title: "future",
          body: "x",
          visibleFrom: future,
        },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "inactive",
          kind: "modal",
          title: "off",
          body: "x",
          isActive: false,
        },
        null,
      );

      const items = await svc.getActiveForClient(scratch, "user-123");
      const aliases = items.map((i) => i.alias);
      expect(aliases).toEqual(["now-live"]);
    } finally {
      await deleteTestOrg(scratch);
    }
  });

  test("getActiveForClient orders by priority DESC then createdAt DESC", async () => {
    const scratch = await createTestOrg("announcement-order");
    try {
      // Insert in reverse priority order to confirm ORDER BY is doing the work.
      await svc.create(
        scratch,
        { alias: "low", kind: "feed", title: "low", body: "x", priority: 1 },
        null,
      );
      await svc.create(
        scratch,
        { alias: "mid", kind: "feed", title: "mid", body: "x", priority: 5 },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "high",
          kind: "feed",
          title: "high",
          body: "x",
          priority: 10,
        },
        null,
      );
      const items = await svc.getActiveForClient(scratch, "u");
      expect(items.map((i) => i.alias)).toEqual(["high", "mid", "low"]);
    } finally {
      await deleteTestOrg(scratch);
    }
  });

  test("recordImpression + recordClick emit events and 404 on unknown alias", async () => {
    await svc.create(
      orgId,
      {
        alias: "evt",
        kind: "modal",
        title: "evt",
        body: "b",
        ctaUrl: "https://example.com/buy",
      },
      null,
    );

    let imp: unknown = null;
    let click: unknown = null;
    events.on("announcement.impression", (p) => {
      imp = p;
    });
    events.on("announcement.click", (p) => {
      click = p;
    });

    await svc.recordImpression(orgId, "evt", "player-1");
    await svc.recordClick(orgId, "evt", "player-1");

    expect(imp).toMatchObject({
      tenantId: orgId,
      endUserId: "player-1",
      alias: "evt",
      kind: "modal",
    });
    expect(click).toMatchObject({
      tenantId: orgId,
      endUserId: "player-1",
      alias: "evt",
      ctaUrl: "https://example.com/buy",
    });

    await expect(
      svc.recordImpression(orgId, "nonesuch", "p"),
    ).rejects.toMatchObject({ code: "announcement.not_found" });
  });

  test("list filters by kind / isActive / q substring", async () => {
    const scratch = await createTestOrg("announcement-list");
    try {
      await svc.create(
        scratch,
        {
          alias: "list-modal-on",
          kind: "modal",
          title: "Active modal",
          body: "x",
        },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "list-modal-off",
          kind: "modal",
          title: "Disabled modal",
          body: "x",
          isActive: false,
        },
        null,
      );
      await svc.create(
        scratch,
        {
          alias: "list-feed",
          kind: "feed",
          title: "Feed item",
          body: "x",
        },
        null,
      );

      const onlyModal = await svc.list(scratch, { kind: "modal" });
      expect(onlyModal.items.map((r) => r.alias).sort()).toEqual(
        ["list-modal-off", "list-modal-on"].sort(),
      );

      const onlyActive = await svc.list(scratch, { isActive: "true" });
      expect(onlyActive.items.map((r) => r.alias).sort()).toEqual(
        ["list-feed", "list-modal-on"].sort(),
      );

      const bySearch = await svc.list(scratch, { q: "feed" });
      expect(bySearch.items.map((r) => r.alias)).toEqual(["list-feed"]);
    } finally {
      await deleteTestOrg(scratch);
    }
  });
});
