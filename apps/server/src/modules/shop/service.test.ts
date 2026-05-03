/**
 * Service-layer tests for shop.
 *
 * Hits the real Neon dev branch in `.dev.vars` — no mocks. Each section
 * focuses on one piece of the surface area:
 *
 *   - Category / tag CRUD + cascade
 *   - Product CRUD + tag M2M + descendant-category filtering
 *   - Eligibility per `timeWindowType` (none / absolute / relative / cyclic)
 *   - userLimit / globalLimit
 *   - Idempotent re-execution
 *   - Growth-pack purchase-without-grant + stage claim + AlreadyClaimed
 *   - listUserProducts statuses
 *
 * `now` is injected for the cyclic / relative time-window tests so we can
 * cross day/month boundaries deterministically without tripping over the
 * shared dev branch's wall clock.
 *
 * Aliases must be unique within this file because all tests share one
 * test org. We append the test name to keep collisions impossible.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "../item/service";
import { createShopService } from "./service";

describe("shop service", () => {
  const itemSvc = createItemService({ db });
  const svc = createShopService({ db }, itemSvc);
  let orgId: string;

  // Per-test currency / reward definitions are created on demand. We
  // reuse a shared "gold" + "gem" definition for the simple cases and
  // create dedicated ones where balance assertions need clean slate.
  let goldId: string;
  let gemId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("shop-svc");
    const gold = await itemSvc.createDefinition(orgId, {
      name: "Gold",
      alias: "shop-gold",
      stackable: true,
    });
    const gem = await itemSvc.createDefinition(orgId, {
      name: "Gem",
      alias: "shop-gem",
      stackable: true,
    });
    goldId = gold.id;
    gemId = gem.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Categories ──────────────────────────────────────────────

  test("create / get / update / delete category by alias", async () => {
    const cat = await svc.createCategory(orgId, {
      name: "Main City",
      alias: "cat-main",
    });
    expect(cat.level).toBe(0);
    expect(cat.parentId).toBeNull();

    const fetched = await svc.getCategory(orgId, "cat-main");
    expect(fetched.id).toBe(cat.id);

    const patched = await svc.updateCategory(orgId, cat.id, {
      name: "Main City v2",
    });
    expect(patched.name).toBe("Main City v2");

    await svc.deleteCategory(orgId, cat.id);
    await expect(svc.getCategory(orgId, "cat-main")).rejects.toMatchObject({
      code: "shop.category_not_found",
    });
  });

  test("category alias conflict surfaces typed error", async () => {
    await svc.createCategory(orgId, { name: "A", alias: "cat-dup" });
    await expect(
      svc.createCategory(orgId, { name: "B", alias: "cat-dup" }),
    ).rejects.toMatchObject({ code: "shop.category_alias_conflict" });
  });

  test("nested categories — level computed from parent, listCategoryTree builds hierarchy", async () => {
    const root = await svc.createCategory(orgId, {
      name: "Tree Root",
      alias: "tree-root",
    });
    const child = await svc.createCategory(orgId, {
      name: "Tree Child",
      alias: "tree-child",
      parentId: root.id,
    });
    expect(child.level).toBe(1);

    const tree = await svc.listCategoryTree(orgId);
    const rootNode = tree.find((n) => n.id === root.id);
    expect(rootNode).toBeDefined();
    expect(rootNode!.children.some((c) => c.id === child.id)).toBe(true);
  });

  // ─── Tags ────────────────────────────────────────────────────

  test("tag CRUD", async () => {
    const tag = await svc.createTag(orgId, {
      name: "Hot",
      alias: "tag-hot",
      color: "#ff0000",
    });
    expect(tag.color).toBe("#ff0000");
    const fetched = await svc.getTag(orgId, "tag-hot");
    expect(fetched.id).toBe(tag.id);

    const updated = await svc.updateTag(orgId, tag.id, { name: "Super Hot" });
    expect(updated.name).toBe("Super Hot");

    await svc.deleteTag(orgId, tag.id);
    await expect(svc.getTag(orgId, "tag-hot")).rejects.toMatchObject({
      code: "shop.tag_not_found",
    });
  });

  // ─── Product CRUD + filtering ────────────────────────────────

  test("product CRUD with tag M2M + listProducts filtering", async () => {
    const cat = await svc.createCategory(orgId, {
      name: "Gear",
      alias: "cat-gear",
    });
    const tag = await svc.createTag(orgId, {
      name: "Featured",
      alias: "tag-featured",
    });

    const prod = await svc.createProduct(orgId, {
      name: "Helmet",
      alias: "prod-helmet",
      categoryId: cat.id,
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 100 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "none",
      tagIds: [tag.id],
    });
    expect(prod.tags).toBeDefined();
    expect(prod.tags!.map((t) => t.id)).toContain(tag.id);

    const updated = await svc.updateProduct(orgId, prod.id, {
      name: "Helmet v2",
    });
    expect(updated.name).toBe("Helmet v2");

    const filtered = await svc.listProducts(orgId, {
      categoryId: cat.id,
      tagId: tag.id,
    });
    expect(filtered.items.some((p) => p.id === prod.id)).toBe(true);
  });

  // ─── Purchase: timeWindowType = none (happy path + balances) ──

  test("regular product purchase deducts cost and grants reward", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-happy",
      grants: [{ definitionId: goldId, quantity: 1000 }],
      source: "test",
    });

    const prod = await svc.createProduct(orgId, {
      name: "Buy Gem 10",
      alias: "prod-happy",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 100 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 10 }],
      timeWindowType: "none",
    });

    const result = await svc.purchase({
      tenantId: orgId,
      endUserId: "u-happy",
      productKey: prod.id,
    });
    expect(result.success).toBe(true);
    expect(result.productId).toBe(prod.id);

    const goldBal = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-happy",
      definitionId: goldId,
    });
    expect(goldBal).toBe(900);

    const gemBal = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-happy",
      definitionId: gemId,
    });
    expect(gemBal).toBe(10);
  });

  // ─── Purchase: timeWindowType = absolute ─────────────────────

  test("absolute window — outside the window throws OutsideTimeWindow", async () => {
    const from = new Date("2030-01-01T00:00:00Z");
    const to = new Date("2030-12-31T00:00:00Z");
    const prod = await svc.createProduct(orgId, {
      name: "Future Gem",
      alias: "prod-absolute",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "absolute",
      availableFrom: from.toISOString(),
      availableTo: to.toISOString(),
    });

    await expect(
      svc.purchase({
        tenantId: orgId,
        endUserId: "u-abs",
        productKey: prod.id,
        now: new Date("2029-01-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "shop.outside_time_window" });

    await expect(
      svc.purchase({
        tenantId: orgId,
        endUserId: "u-abs",
        productKey: prod.id,
        now: new Date("2031-01-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "shop.outside_time_window" });
  });

  // ─── Purchase: timeWindowType = cyclic (daily) ───────────────

  test("cyclic daily — refresh resets cycleCount and lifts the limit", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-cyc",
      grants: [{ definitionId: goldId, quantity: 1000 }],
      source: "test",
    });

    const prod = await svc.createProduct(orgId, {
      name: "Daily Gem",
      alias: "prod-cyclic",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "cyclic",
      refreshCycle: "daily",
      refreshLimit: 1,
    });

    const day1 = new Date("2026-04-14T10:00:00Z");
    await svc.purchase({
      tenantId: orgId,
      endUserId: "u-cyc",
      productKey: prod.id,
      now: day1,
    });

    // Same day: should hit the cycle limit
    await expect(
      svc.purchase({
        tenantId: orgId,
        endUserId: "u-cyc",
        productKey: prod.id,
        now: new Date("2026-04-14T23:59:00Z"),
      }),
    ).rejects.toMatchObject({ code: "shop.cycle_limit_reached" });

    // Next day: limit refreshes
    const day2 = new Date("2026-04-15T10:00:00Z");
    const r2 = await svc.purchase({
      tenantId: orgId,
      endUserId: "u-cyc",
      productKey: prod.id,
      now: day2,
    });
    expect(r2.success).toBe(true);
  });

  // ─── userLimit ───────────────────────────────────────────────

  test("userLimit — third purchase blocked", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-userlim",
      grants: [{ definitionId: goldId, quantity: 1000 }],
      source: "test",
    });
    const prod = await svc.createProduct(orgId, {
      name: "Capped",
      alias: "prod-userlim",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "none",
      userLimit: 2,
    });

    await svc.purchase({
      tenantId: orgId,
      endUserId: "u-userlim",
      productKey: prod.id,
    });
    await svc.purchase({
      tenantId: orgId,
      endUserId: "u-userlim",
      productKey: prod.id,
    });
    await expect(
      svc.purchase({
        tenantId: orgId,
        endUserId: "u-userlim",
        productKey: prod.id,
      }),
    ).rejects.toMatchObject({ code: "shop.user_limit_reached" });
  });

  // ─── globalLimit ─────────────────────────────────────────────

  test("globalLimit — second user blocked once pool is exhausted", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-glob-a",
      grants: [{ definitionId: goldId, quantity: 100 }],
      source: "test",
    });
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-glob-b",
      grants: [{ definitionId: goldId, quantity: 100 }],
      source: "test",
    });

    const prod = await svc.createProduct(orgId, {
      name: "Scarce",
      alias: "prod-globlim",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "none",
      globalLimit: 1,
    });

    await svc.purchase({
      tenantId: orgId,
      endUserId: "u-glob-a",
      productKey: prod.id,
    });
    await expect(
      svc.purchase({
        tenantId: orgId,
        endUserId: "u-glob-b",
        productKey: prod.id,
      }),
    ).rejects.toMatchObject({ code: "shop.global_limit_reached" });
  });

  // ─── Idempotency ─────────────────────────────────────────────

  test("idempotency key — second call returns same purchaseId, no double-deduct", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-idemp",
      grants: [{ definitionId: goldId, quantity: 500 }],
      source: "test",
    });
    const prod = await svc.createProduct(orgId, {
      name: "Idemp",
      alias: "prod-idemp",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 50 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 5 }],
      timeWindowType: "none",
    });
    const key = crypto.randomUUID();
    const r1 = await svc.purchase({
      tenantId: orgId,
      endUserId: "u-idemp",
      productKey: prod.id,
      idempotencyKey: key,
    });
    const r2 = await svc.purchase({
      tenantId: orgId,
      endUserId: "u-idemp",
      productKey: prod.id,
      idempotencyKey: key,
    });
    expect(r2.purchaseId).toBe(r1.purchaseId);

    const goldBal = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-idemp",
      definitionId: goldId,
    });
    expect(goldBal).toBe(450);
  });

  // ─── Growth pack: purchase-once + stage claim ────────────────

  test("growth_pack — purchase grants nothing; claimStage requires entitlement and respects threshold", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-grow",
      grants: [{ definitionId: goldId, quantity: 5000 }],
      source: "test",
    });
    const prod = await svc.createProduct(orgId, {
      name: "Growth Pack",
      alias: "prod-growth",
      productType: "growth_pack",
      costItems: [{ type: "item" as const, id: goldId, count: 1000 }],
      rewardItems: [], // growth pack: rewards live on stages
      timeWindowType: "none",
    });

    // Stage 1 — accumulated_cost threshold smaller than the cost we'll spend
    const stage = await svc.createStage(orgId, prod.id, {
      stageIndex: 1,
      name: "Stage 1",
      triggerType: "accumulated_cost",
      triggerConfig: { threshold: 500 },
      rewardItems: [{ type: "item" as const, id: gemId, count: 50 }],
    });

    // Cannot claim before purchasing (no entitlement)
    await expect(
      svc.claimGrowthStage({
        tenantId: orgId,
        endUserId: "u-grow",
        stageId: stage.id,
      }),
    ).rejects.toMatchObject({ code: "shop.not_entitled" });

    const beforeGem = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-grow",
      definitionId: gemId,
    });

    const purchaseRes = await svc.purchase({
      tenantId: orgId,
      endUserId: "u-grow",
      productKey: prod.id,
    });
    expect(purchaseRes.rewardItems).toEqual([]);

    // Purchase did NOT grant any gem
    const midGem = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-grow",
      definitionId: gemId,
    });
    expect(midGem).toBe(beforeGem);

    // Now claim — accumulated_cost on this product is 1000 ≥ threshold 500
    const claim = await svc.claimGrowthStage({
      tenantId: orgId,
      endUserId: "u-grow",
      stageId: stage.id,
    });
    expect(claim.success).toBe(true);
    expect(claim.stageId).toBe(stage.id);

    const afterGem = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-grow",
      definitionId: gemId,
    });
    expect(afterGem).toBe(beforeGem + 50);

    // Second claim of the same stage by the same user is rejected
    await expect(
      svc.claimGrowthStage({
        tenantId: orgId,
        endUserId: "u-grow",
        stageId: stage.id,
      }),
    ).rejects.toMatchObject({ code: "shop.already_claimed" });
  });

  test("growth_pack — manual trigger always claimable once entitled", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-grow-manual",
      grants: [{ definitionId: goldId, quantity: 1000 }],
      source: "test",
    });
    const prod = await svc.createProduct(orgId, {
      name: "Manual Growth",
      alias: "prod-growth-manual",
      productType: "growth_pack",
      costItems: [{ type: "item" as const, id: goldId, count: 100 }],
      rewardItems: [],
      timeWindowType: "none",
    });
    const stage = await svc.createStage(orgId, prod.id, {
      stageIndex: 1,
      name: "Manual",
      triggerType: "manual",
      triggerConfig: null,
      rewardItems: [{ type: "item" as const, id: gemId, count: 7 }],
    });

    await svc.purchase({
      tenantId: orgId,
      endUserId: "u-grow-manual",
      productKey: prod.id,
    });

    const before = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-grow-manual",
      definitionId: gemId,
    });
    await svc.claimGrowthStage({
      tenantId: orgId,
      endUserId: "u-grow-manual",
      stageId: stage.id,
    });
    const after = await itemSvc.getBalance({
      tenantId: orgId,
      endUserId: "u-grow-manual",
      definitionId: gemId,
    });
    expect(after - before).toBe(7);
  });

  // ─── listUserProducts ─────────────────────────────────────────

  test("listUserProducts — returns eligibility status per product", async () => {
    await itemSvc.grantItems({
      tenantId: orgId,
      endUserId: "u-list",
      grants: [{ definitionId: goldId, quantity: 50 }],
      source: "test",
    });

    // Active, in-window
    const ok = await svc.createProduct(orgId, {
      name: "Visible",
      alias: "prod-list-ok",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "none",
    });
    // Outside future window
    const future = await svc.createProduct(orgId, {
      name: "Not Yet",
      alias: "prod-list-future",
      productType: "regular",
      costItems: [{ type: "item" as const, id: goldId, count: 1 }],
      rewardItems: [{ type: "item" as const, id: gemId, count: 1 }],
      timeWindowType: "absolute",
      availableFrom: "2099-01-01T00:00:00.000Z",
      availableTo: "2099-12-31T00:00:00.000Z",
    });

    const views = await svc.listUserProducts({
      tenantId: orgId,
      endUserId: "u-list",
      query: {},
    });

    const okView = views.find((v) => v.id === ok.id);
    expect(okView?.eligibility.status).toBe("available");

    const futureView = views.find((v) => v.id === future.id);
    expect(futureView?.eligibility.status).toBe("not_started");
  });

  // ─── Activity-bound writable gate ──────────────────────────────
  describe("activity-bound writable gate", () => {
    const HOUR = 3_600_000;

    async function seedActivity(opts: {
      alias: string;
      phaseAt: "active" | "ended";
    }): Promise<string> {
      const { activityConfigs } = await import("../../schema/activity");
      const offsetMap = { active: 0, ended: +2.5 * HOUR };
      const anchor = new Date(Date.now() - offsetMap[opts.phaseAt]);
      const [row] = await db
        .insert(activityConfigs)
        .values({
          tenantId: orgId,
          alias: opts.alias,
          name: `gate-${opts.alias}`,
          kind: "generic",
          status: "active",
          visibleAt: new Date(anchor.getTime() - 2 * HOUR),
          startAt: new Date(anchor.getTime() - HOUR),
          endAt: new Date(anchor.getTime() + HOUR),
          hiddenAt: new Date(anchor.getTime() + 24 * HOUR),
        })
        .returning({ id: activityConfigs.id });
      return row!.id;
    }

    test("ended activity → purchase throws activity.not_in_writable_phase", async () => {
      const goldDef = await itemSvc.createDefinition(orgId, {
        name: "Gold gate",
        alias: "gold-gate-shop",
        stackable: true,
      });
      const gemDef = await itemSvc.createDefinition(orgId, {
        name: "Gem gate",
        alias: "gem-gate-shop",
        stackable: true,
      });
      await itemSvc.grantItems({
        tenantId: orgId,
        endUserId: "u-gate-shop-ended",
        grants: [{ definitionId: goldDef.id, quantity: 1000 }],
        source: "test",
      });

      const activityId = await seedActivity({
        alias: "gate-shop-ended",
        phaseAt: "ended",
      });
      const prod = await svc.createProduct(orgId, {
        name: "Ended product",
        alias: "prod-gate-ended",
        productType: "regular",
        costItems: [{ type: "item" as const, id: goldDef.id, count: 100 }],
        rewardItems: [{ type: "item" as const, id: gemDef.id, count: 10 }],
        timeWindowType: "none",
        activityId,
      });

      await expect(
        svc.purchase({
          tenantId: orgId,
          endUserId: "u-gate-shop-ended",
          productKey: prod.id,
        }),
      ).rejects.toMatchObject({ code: "activity.not_in_writable_phase" });

      // No deduction occurred.
      const goldBal = await itemSvc.getBalance({
        tenantId: orgId,
        endUserId: "u-gate-shop-ended",
        definitionId: goldDef.id,
      });
      expect(goldBal).toBe(1000);
    });
  });
});
