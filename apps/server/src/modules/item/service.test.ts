/**
 * Service-layer tests for the item module.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` —
 * no mocks. The `createItemService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every category, definition, inventory,
 * and grant-log row.
 *
 * All test-specific aliases must be unique within this file because
 * they share the single test org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "./service";

describe("item service", () => {
  const svc = createItemService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("item-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Category CRUD ──────────────────────────────────────────────

  describe("category CRUD", () => {
    test("create and list categories", async () => {
      const cat = await svc.createCategory(orgId, {
        name: "Weapons",
        alias: "cat-weapons",
        icon: "sword",
      });
      expect(cat.name).toBe("Weapons");
      expect(cat.alias).toBe("cat-weapons");
      expect(cat.icon).toBe("sword");
      expect(typeof cat.sortOrder).toBe("string");
      expect(cat.sortOrder.length).toBeGreaterThan(0);
      expect(cat.isActive).toBe(true);
      expect(cat.tenantId).toBe(orgId);

      const page = await svc.listCategories(orgId);
      expect(page.items.some((c) => c.id === cat.id)).toBe(true);
    });

    test("get category by alias", async () => {
      const cat = await svc.createCategory(orgId, {
        name: "Armor",
        alias: "cat-armor",
      });
      const fetched = await svc.getCategory(orgId, "cat-armor");
      expect(fetched.id).toBe(cat.id);
      expect(fetched.name).toBe("Armor");
    });

    test("update category", async () => {
      const cat = await svc.createCategory(orgId, {
        name: "Potions",
        alias: "cat-potions",
      });
      const updated = await svc.updateCategory(orgId, cat.id, {
        name: "Elixirs",
        icon: "flask",
      });
      expect(updated.name).toBe("Elixirs");
      expect(updated.icon).toBe("flask");
      expect(updated.alias).toBe("cat-potions");
    });

    test("delete category", async () => {
      const cat = await svc.createCategory(orgId, {
        name: "Junk",
        alias: "cat-junk",
      });
      await svc.deleteCategory(orgId, cat.id);
      await expect(
        svc.getCategory(orgId, cat.id),
      ).rejects.toMatchObject({ code: "item.category_not_found" });
    });

    test("alias conflict surfaces typed error", async () => {
      await svc.createCategory(orgId, {
        name: "First",
        alias: "cat-dup",
      });
      await expect(
        svc.createCategory(orgId, {
          name: "Second",
          alias: "cat-dup",
        }),
      ).rejects.toMatchObject({ code: "item.category_alias_conflict" });
    });
  });

  // ─── Definition CRUD ────────────────────────────────────────────

  describe("definition CRUD", () => {
    test("create currency (stackable, no limits)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Gold",
        alias: "def-gold",
        stackable: true,
        // stackLimit and holdLimit default to null → unlimited
      });
      expect(def.name).toBe("Gold");
      expect(def.alias).toBe("def-gold");
      expect(def.stackable).toBe(true);
      expect(def.stackLimit).toBeNull();
      expect(def.holdLimit).toBeNull();
      expect(def.isActive).toBe(true);
    });

    test("create limited-stack item (stackLimit=99)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Arrow",
        alias: "def-arrow",
        stackable: true,
        stackLimit: 99,
      });
      expect(def.stackable).toBe(true);
      expect(def.stackLimit).toBe(99);
    });

    test("create non-stackable item (stackable=false)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Unique Sword",
        alias: "def-unique-sword",
        stackable: false,
        holdLimit: 5,
      });
      expect(def.stackable).toBe(false);
      expect(def.stackLimit).toBeNull();
      expect(def.holdLimit).toBe(5);
    });

    test("definition alias conflict surfaces typed error", async () => {
      await svc.createDefinition(orgId, {
        name: "Gem A",
        alias: "def-dup",
      });
      await expect(
        svc.createDefinition(orgId, {
          name: "Gem B",
          alias: "def-dup",
        }),
      ).rejects.toMatchObject({ code: "item.definition_alias_conflict" });
    });

    test("non-stackable rejects stackLimit", async () => {
      await expect(
        svc.createDefinition(orgId, {
          name: "Bad Item",
          alias: "def-bad-stack",
          stackable: false,
          stackLimit: 10,
        }),
      ).rejects.toMatchObject({ code: "item.invalid_input" });
    });
  });

  // ─── Currency grant/deduct (unlimited stack) ────────────────────

  describe("currency grant/deduct (unlimited stack)", () => {
    let goldDefId: string;

    beforeAll(async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Gold Coin",
        alias: "def-gold-coin",
        stackable: true,
      });
      goldDefId = def.id;
    });

    test("grant 100 gold, check balance=100", async () => {
      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-gold",
        grants: [{ definitionId: goldDefId, quantity: 100 }],
        source: "test",
      });
      const balance = await svc.getBalance({
        tenantId: orgId,
        endUserId: "u-gold",
        definitionId: goldDefId,
      });
      expect(balance).toBe(100);
    });

    test("grant 50 more → balance=150", async () => {
      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-gold",
        grants: [{ definitionId: goldDefId, quantity: 50 }],
        source: "test",
      });
      const balance = await svc.getBalance({
        tenantId: orgId,
        endUserId: "u-gold",
        definitionId: goldDefId,
      });
      expect(balance).toBe(150);
    });

    test("deduct 30 → balance=120", async () => {
      await svc.deductItems({
        tenantId: orgId,
        endUserId: "u-gold",
        deductions: [{ definitionId: goldDefId, quantity: 30 }],
        source: "test",
      });
      const balance = await svc.getBalance({
        tenantId: orgId,
        endUserId: "u-gold",
        definitionId: goldDefId,
      });
      expect(balance).toBe(120);
    });

    test("deduct too much → insufficient_balance error", async () => {
      await expect(
        svc.deductItems({
          tenantId: orgId,
          endUserId: "u-gold",
          deductions: [{ definitionId: goldDefId, quantity: 999 }],
          source: "test",
        }),
      ).rejects.toMatchObject({ code: "item.insufficient_balance" });
    });
  });

  // ─── Limited-stack grant ────────────────────────────────────────

  describe("limited-stack grant", () => {
    test("grant 12 with stackLimit=5 creates 3 stacks (5+5+2)", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Potion",
        alias: "def-potion-stack",
        stackable: true,
        stackLimit: 5,
      });

      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-stack",
        grants: [{ definitionId: def.id, quantity: 12 }],
        source: "test",
      });

      const inv = await svc.getInventory({
        tenantId: orgId,
        endUserId: "u-stack",
        definitionId: def.id,
      });

      expect(inv).toHaveLength(1); // one group for the definition
      expect(inv[0]!.totalQuantity).toBe(12);
      expect(inv[0]!.stacks).toHaveLength(3);

      const quantities = inv[0]!.stacks.map((s) => s.quantity).sort((a, b) => a - b);
      expect(quantities).toEqual([2, 5, 5]);
    });
  });

  // ─── Non-stackable grant ────────────────────────────────────────

  describe("non-stackable grant", () => {
    let swordDefId: string;

    beforeAll(async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Magic Sword",
        alias: "def-magic-sword",
        stackable: false,
        holdLimit: 3,
      });
      swordDefId = def.id;
    });

    test("grant 2, check inventory has 2 individual stacks", async () => {
      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-nonstak",
        grants: [{ definitionId: swordDefId, quantity: 2 }],
        source: "test",
      });

      const inv = await svc.getInventory({
        tenantId: orgId,
        endUserId: "u-nonstak",
        definitionId: swordDefId,
      });

      expect(inv).toHaveLength(1);
      expect(inv[0]!.totalQuantity).toBe(2);
      expect(inv[0]!.stacks).toHaveLength(2);
      for (const stack of inv[0]!.stacks) {
        expect(stack.quantity).toBe(1);
      }
    });

    test("grant 2 more → holdLimit error", async () => {
      await expect(
        svc.grantItems({
          tenantId: orgId,
          endUserId: "u-nonstak",
          grants: [{ definitionId: swordDefId, quantity: 2 }],
          source: "test",
        }),
      ).rejects.toMatchObject({ code: "item.hold_limit_reached" });
    });
  });

  // ─── Deduct non-stackable ──────────────────────────────────────

  describe("deduct non-stackable", () => {
    test("grant 3, deduct 1, check 2 remain", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Shield",
        alias: "def-shield-deduct",
        stackable: false,
      });

      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-deduct-ns",
        grants: [{ definitionId: def.id, quantity: 3 }],
        source: "test",
      });

      await svc.deductItems({
        tenantId: orgId,
        endUserId: "u-deduct-ns",
        deductions: [{ definitionId: def.id, quantity: 1 }],
        source: "test",
      });

      const balance = await svc.getBalance({
        tenantId: orgId,
        endUserId: "u-deduct-ns",
        definitionId: def.id,
      });
      expect(balance).toBe(2);

      const inv = await svc.getInventory({
        tenantId: orgId,
        endUserId: "u-deduct-ns",
        definitionId: def.id,
      });
      expect(inv[0]!.stacks).toHaveLength(2);
    });
  });

  // ─── getInventory groups by definition ─────────────────────────

  describe("getInventory groups by definition", () => {
    test("grant 2 different items to same user, getInventory returns 2 groups", async () => {
      const defA = await svc.createDefinition(orgId, {
        name: "Ruby",
        alias: "def-ruby-inv",
        stackable: true,
      });
      const defB = await svc.createDefinition(orgId, {
        name: "Sapphire",
        alias: "def-sapphire-inv",
        stackable: true,
      });

      await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-multi",
        grants: [
          { definitionId: defA.id, quantity: 10 },
          { definitionId: defB.id, quantity: 20 },
        ],
        source: "test",
      });

      const inv = await svc.getInventory({
        tenantId: orgId,
        endUserId: "u-multi",
      });

      expect(inv.length).toBeGreaterThanOrEqual(2);

      const ruby = inv.find((v) => v.definitionId === defA.id);
      const sapphire = inv.find((v) => v.definitionId === defB.id);
      expect(ruby).toBeDefined();
      expect(ruby!.totalQuantity).toBe(10);
      expect(sapphire).toBeDefined();
      expect(sapphire!.totalQuantity).toBe(20);
    });
  });

  // ─── Grant logs are written ────────────────────────────────────

  describe("grant logs are written", () => {
    test("grant result contains correct before/after quantities", async () => {
      const def = await svc.createDefinition(orgId, {
        name: "Experience",
        alias: "def-xp-log",
        stackable: true,
      });

      const result1 = await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-log",
        grants: [{ definitionId: def.id, quantity: 50 }],
        source: "quest",
        sourceId: "quest-001",
      });

      expect(result1.grants).toHaveLength(1);
      expect(result1.grants[0]!.quantityBefore).toBe(0);
      expect(result1.grants[0]!.quantityAfter).toBe(50);
      expect(result1.grants[0]!.delta).toBe(50);

      const result2 = await svc.grantItems({
        tenantId: orgId,
        endUserId: "u-log",
        grants: [{ definitionId: def.id, quantity: 25 }],
        source: "quest",
        sourceId: "quest-002",
      });

      expect(result2.grants[0]!.quantityBefore).toBe(50);
      expect(result2.grants[0]!.quantityAfter).toBe(75);
      expect(result2.grants[0]!.delta).toBe(25);

      // Deduct also writes logs with negative delta
      const deductResult = await svc.deductItems({
        tenantId: orgId,
        endUserId: "u-log",
        deductions: [{ definitionId: def.id, quantity: 10 }],
        source: "shop",
        sourceId: "purchase-001",
      });

      expect(deductResult.deductions).toHaveLength(1);
      expect(deductResult.deductions[0]!.quantityBefore).toBe(75);
      expect(deductResult.deductions[0]!.quantityAfter).toBe(65);
      expect(deductResult.deductions[0]!.delta).toBe(-10);
    });
  });
});
