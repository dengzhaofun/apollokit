/**
 * Service-layer tests for the currency module.
 *
 * These talk to the real dev database configured in `.dev.vars` —
 * `db.ts` auto-detects Neon vs local Postgres based on the URL host.
 * The service factory is invoked directly with the real `db` singleton,
 * bypassing HTTP and Better Auth entirely. A single test org is seeded
 * in `beforeAll` and deleted in `afterAll`; ON DELETE CASCADE sweeps up
 * every currency, wallet, and ledger row.
 *
 * Aliases are unique within this file because everything shares the
 * single test org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCurrencyService } from "./service";

describe("currency service", () => {
  const svc = createCurrencyService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("currency-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Definition CRUD ──────────────────────────────────────────

  describe("definition CRUD", () => {
    test("create / list / get by alias", async () => {
      const gem = await svc.createDefinition(orgId, {
        name: "Gem",
        alias: "cur-gem",
        icon: "gem-icon",
      });
      expect(gem.name).toBe("Gem");
      expect(gem.alias).toBe("cur-gem");
      expect(typeof gem.sortOrder).toBe("string");
      expect(gem.sortOrder.length).toBeGreaterThan(0);
      expect(gem.isActive).toBe(true);
      expect(gem.activityId).toBeNull();

      const list = await svc.listDefinitions(orgId);
      expect(list.items.some((c) => c.id === gem.id)).toBe(true);

      const viaAlias = await svc.getDefinition(orgId, "cur-gem");
      expect(viaAlias.id).toBe(gem.id);
    });

    test("alias conflict surfaces typed error", async () => {
      await svc.createDefinition(orgId, {
        name: "First",
        alias: "cur-dup",
      });
      await expect(
        svc.createDefinition(orgId, { name: "Second", alias: "cur-dup" }),
      ).rejects.toMatchObject({ code: "currency.alias_conflict" });
    });

    test("update patches fields", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Before",
        alias: "cur-upd",
      });
      const after = await svc.updateDefinition(orgId, c.id, {
        name: "After",
      });
      expect(after.name).toBe("After");
      // sortOrder is now an opaque fractional key, not user-settable on update
      expect(typeof after.sortOrder).toBe("string");
      // alias unchanged
      expect(after.alias).toBe("cur-upd");
    });

    test("activity filter returns only matching rows", async () => {
      const fakeActivityId = "11111111-1111-1111-1111-111111111111";
      const bound = await svc.createDefinition(orgId, {
        name: "EventPoint",
        alias: "cur-evt",
        activityId: fakeActivityId,
      });
      const permOnly = await svc.listDefinitions(orgId, { activityId: null });
      expect(permOnly.items.every((c) => c.activityId === null)).toBe(true);

      const scoped = await svc.listDefinitions(orgId, {
        activityId: fakeActivityId,
      });
      expect(scoped.items.map((c) => c.id)).toContain(bound.id);
      expect(scoped.items.every((c) => c.activityId === fakeActivityId)).toBe(true);
    });

    test("delete removes the row", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "ToDelete",
        alias: "cur-del",
      });
      await svc.deleteDefinition(orgId, c.id);
      await expect(svc.getDefinition(orgId, c.id)).rejects.toMatchObject({
        code: "currency.not_found",
      });
    });
  });

  // ─── Grant / Deduct / Balance ────────────────────────────────

  describe("wallet operations", () => {
    test("grant creates wallet row and ledger entry", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Coin",
        alias: "cur-coin",
      });
      const uid = "user-grant-1";

      const result = await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 100 }],
        source: "test-grant",
      });

      expect(result.grants).toHaveLength(1);
      expect(result.grants[0]!.balanceBefore).toBe(0);
      expect(result.grants[0]!.balanceAfter).toBe(100);
      expect(result.grants[0]!.delta).toBe(100);

      const balance = await svc.getBalance(orgId, uid, c.id);
      expect(balance).toBe(100);

      const ledger = await svc.listLedger(orgId, { endUserId: uid });
      expect(ledger.items.some((e) => e.delta === 100)).toBe(true);
    });

    test("repeated grant accumulates balance", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Point",
        alias: "cur-pt",
      });
      const uid = "user-grant-2";

      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 40 }],
        source: "test-grant",
      });
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 60 }],
        source: "test-grant",
      });
      expect(await svc.getBalance(orgId, uid, c.id)).toBe(100);
    });

    test("deduct happy path", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Coin2",
        alias: "cur-coin2",
      });
      const uid = "user-deduct-1";
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 50 }],
        source: "test-grant",
      });
      const res = await svc.deduct({
        organizationId: orgId,
        endUserId: uid,
        deductions: [{ currencyId: c.id, amount: 30 }],
        source: "test-deduct",
      });
      expect(res.deductions[0]!.balanceAfter).toBe(20);
      expect(await svc.getBalance(orgId, uid, c.id)).toBe(20);
    });

    test("deduct beyond balance throws insufficient_balance", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Coin3",
        alias: "cur-coin3",
      });
      const uid = "user-deduct-2";
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 5 }],
        source: "test-grant",
      });
      await expect(
        svc.deduct({
          organizationId: orgId,
          endUserId: uid,
          deductions: [{ currencyId: c.id, amount: 100 }],
          source: "test-deduct",
        }),
      ).rejects.toMatchObject({ code: "currency.insufficient_balance" });
      // Balance unchanged
      expect(await svc.getBalance(orgId, uid, c.id)).toBe(5);
    });

    test("grant with amount <= 0 is rejected", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Coin4",
        alias: "cur-coin4",
      });
      await expect(
        svc.grant({
          organizationId: orgId,
          endUserId: "user-x",
          grants: [{ currencyId: c.id, amount: 0 }],
          source: "test-grant",
        }),
      ).rejects.toMatchObject({ code: "currency.invalid_input" });
    });

    test("getWallets returns joined currency meta", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Ticket",
        alias: "cur-tk",
        icon: "ticket.png",
      });
      const uid = "user-wallets-1";
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 7 }],
        source: "test-grant",
      });
      const wallets = await svc.getWallets(orgId, uid);
      const row = wallets.find((w) => w.currencyId === c.id);
      expect(row).toBeDefined();
      expect(row!.balance).toBe(7);
      expect(row!.currencyName).toBe("Ticket");
      expect(row!.icon).toBe("ticket.png");
    });
  });

  // ─── Ledger cursor paging ─────────────────────────────────────

  describe("ledger", () => {
    test("source + sourceId filter", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Chip",
        alias: "cur-chip",
      });
      const uid = "user-ledger-1";
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 3 }],
        source: "unit-test",
        sourceId: "txn-A",
      });
      await svc.grant({
        organizationId: orgId,
        endUserId: uid,
        grants: [{ currencyId: c.id, amount: 4 }],
        source: "unit-test",
        sourceId: "txn-B",
      });
      const onlyA = await svc.listLedger(orgId, {
        endUserId: uid,
        source: "unit-test",
        sourceId: "txn-A",
      });
      expect(onlyA.items).toHaveLength(1);
      expect(onlyA.items[0]!.delta).toBe(3);
    });
  });

  // ─── Existence batch check ────────────────────────────────────

  describe("assertAllExist", () => {
    test("throws when any id is unknown in this org", async () => {
      const c = await svc.createDefinition(orgId, {
        name: "Real",
        alias: "cur-real",
      });
      await expect(
        svc.assertAllExist(orgId, [
          c.id,
          "00000000-0000-0000-0000-000000000000",
        ]),
      ).rejects.toMatchObject({ code: "currency.not_found" });
    });

    test("passes for all-existing ids", async () => {
      const a = await svc.createDefinition(orgId, {
        name: "A",
        alias: "cur-aa",
      });
      const b = await svc.createDefinition(orgId, {
        name: "B",
        alias: "cur-bb",
      });
      await expect(
        svc.assertAllExist(orgId, [a.id, b.id, a.id]),
      ).resolves.toBeUndefined();
    });
  });
});
