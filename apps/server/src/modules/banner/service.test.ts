/**
 * Service-layer tests for banner.
 *
 * Hits the real Neon dev branch. Covers:
 *   - group CRUD + alias uniqueness (partial unique index)
 *   - banner CRUD inside a group
 *   - visibility window filtering on the client resolver
 *   - multicast targeting
 *   - reorder full-set validation
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import type { LinkAction } from "../link/types";
import { createBannerService } from "./service";

describe("banner service", () => {
  const svc = createBannerService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("banner-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("create group + reject duplicate alias", async () => {
    const g = await svc.createGroup(orgId, {
      alias: "home-main-dup",
      name: "Home main",
    });
    expect(g.alias).toBe("home-main-dup");

    await expect(
      svc.createGroup(orgId, { alias: "home-main-dup", name: "dup" }),
    ).rejects.toMatchObject({ code: "banner.group_alias_conflict" });
  });

  test("create group without alias allowed (null)", async () => {
    const g = await svc.createGroup(orgId, { name: "draft group" });
    expect(g.alias).toBeNull();
    // Drafts can't be resolved by the client:
    await expect(
      svc.getClientGroupByAlias(orgId, "non-existent", "u-1"),
    ).rejects.toMatchObject({ code: "banner.group_not_found" });
  });

  test("create banner defaults sortOrder to tail", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "sort-test",
      name: "sort test",
    });
    const link: LinkAction = {
      type: "external",
      url: "https://example.com/a",
    };
    const b1 = await svc.createBanner(orgId, group.id, {
      title: "A",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
    });
    const b2 = await svc.createBanner(orgId, group.id, {
      title: "B",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
    });
    expect(b1.sortOrder).toBe(0);
    expect(b2.sortOrder).toBe(1);
  });

  test("multicast banner requires non-empty targetUserIds", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "mc-test",
      name: "mc",
    });
    const link: LinkAction = { type: "none" };
    await expect(
      svc.createBanner(orgId, group.id, {
        title: "mc",
        imageUrlMobile: "https://cdn.example.com/m.png",
        imageUrlDesktop: "https://cdn.example.com/d.png",
        linkAction: link,
        targetType: "multicast",
        targetUserIds: [],
      }),
    ).rejects.toMatchObject({ code: "banner.invalid_target" });
  });

  test("visibility window filters client banners", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "vis-test",
      name: "vis",
    });
    const link: LinkAction = { type: "none" };
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const veryPast = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // visible now
    await svc.createBanner(orgId, group.id, {
      title: "nowVisible",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
      visibleFrom: past,
      visibleUntil: future,
    });
    // already ended
    await svc.createBanner(orgId, group.id, {
      title: "ended",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
      visibleFrom: veryPast,
      visibleUntil: past,
    });
    // not started yet
    await svc.createBanner(orgId, group.id, {
      title: "future",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
      visibleFrom: future,
    });

    const resolved = await svc.getClientGroupByAlias(orgId, "vis-test", "u-x");
    expect(resolved.banners.map((b) => b.title)).toEqual(["nowVisible"]);
  });

  test("multicast targeting — only listed end users see the banner", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "mc-filter",
      name: "mc-filter",
    });
    const link: LinkAction = { type: "none" };
    await svc.createBanner(orgId, group.id, {
      title: "broadcast-slide",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
    });
    await svc.createBanner(orgId, group.id, {
      title: "mc-slide",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
      targetType: "multicast",
      targetUserIds: ["u-whitelisted"],
    });

    const forListed = await svc.getClientGroupByAlias(
      orgId,
      "mc-filter",
      "u-whitelisted",
    );
    const forOthers = await svc.getClientGroupByAlias(
      orgId,
      "mc-filter",
      "u-outsider",
    );
    expect(forListed.banners.map((b) => b.title).sort()).toEqual([
      "broadcast-slide",
      "mc-slide",
    ]);
    expect(forOthers.banners.map((b) => b.title)).toEqual([
      "broadcast-slide",
    ]);
  });

  test("reorder rejects partial/drifted id sets", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "reorder-test",
      name: "reorder",
    });
    const link: LinkAction = { type: "none" };
    const a = await svc.createBanner(orgId, group.id, {
      title: "A",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
    });
    const b = await svc.createBanner(orgId, group.id, {
      title: "B",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: link,
    });

    // missing id
    await expect(
      svc.reorderBanners(orgId, group.id, [a.id]),
    ).rejects.toMatchObject({ code: "banner.reorder_mismatch" });

    // duplicate id
    await expect(
      svc.reorderBanners(orgId, group.id, [a.id, a.id]),
    ).rejects.toMatchObject({ code: "banner.reorder_mismatch" });

    // valid full swap
    const reordered = await svc.reorderBanners(orgId, group.id, [b.id, a.id]);
    expect(reordered.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(reordered[0]!.sortOrder).toBe(0);
    expect(reordered[1]!.sortOrder).toBe(1);
  });

  test("delete group cascades to banners", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "cascade-test",
      name: "cascade",
    });
    await svc.createBanner(orgId, group.id, {
      title: "X",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: { type: "none" },
    });
    await svc.deleteGroup(orgId, group.id);
    const list = await svc.listGroups(orgId);
    expect(list.items.find((g) => g.id === group.id)).toBeUndefined();
  });

  test("inactive group returns empty banners instead of 404", async () => {
    const group = await svc.createGroup(orgId, {
      alias: "inactive-test",
      name: "inactive",
      isActive: false,
    });
    await svc.createBanner(orgId, group.id, {
      title: "Y",
      imageUrlMobile: "https://cdn.example.com/m.png",
      imageUrlDesktop: "https://cdn.example.com/d.png",
      linkAction: { type: "none" },
    });
    const resolved = await svc.getClientGroupByAlias(
      orgId,
      "inactive-test",
      "u-1",
    );
    expect(resolved.banners).toEqual([]);
    expect(resolved.id).toBe(group.id);
  });
});
