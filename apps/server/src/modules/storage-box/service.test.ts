/**
 * Service-layer tests for storage-box.
 *
 * Talks to the real Neon dev branch configured in `.dev.vars` — no mocks.
 * Test data is seeded through the item and storage-box service factories
 * (never via raw SQL). A single test org is created in `beforeAll` and
 * deleted in `afterAll`; ON DELETE CASCADE sweeps configs, deposits, and
 * logs.
 *
 * Clock injection via the `now` parameter is what lets us verify
 * maturity transitions and interest accrual in-process without
 * round-tripping through `sleep`.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCurrencyService } from "../currency/service";
import { createItemService } from "../item/service";
import { createStorageBoxService } from "./service";

describe("storage-box service", () => {
  const itemSvc = createItemService({ db });
  const currencySvc = createCurrencyService({ db });
  const svc = createStorageBoxService({ db }, currencySvc);
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("storage-box-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  async function makeCurrency(alias: string) {
    return currencySvc.createDefinition(orgId, {
      name: `Currency ${alias}`,
      alias,
    });
  }

  async function grantCurrency(
    endUserId: string,
    currencyId: string,
    amount: number,
  ) {
    await currencySvc.grant({
      organizationId: orgId,
      endUserId,
      grants: [{ currencyId, amount }],
      source: "test-seed",
    });
  }

  // ─── Config CRUD ─────────────────────────────────────────────

  test("createConfig with demand type and default interest", async () => {
    const gold = await makeCurrency("sb-cfg-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Demand Wallet",
      alias: "demand-wallet",
      type: "demand",
      acceptedCurrencyIds: [gold.id],
    });
    expect(cfg.type).toBe("demand");
    expect(cfg.lockupDays).toBeNull();
    expect(cfg.interestRateBps).toBe(0);
    expect(cfg.acceptedCurrencyIds).toEqual([gold.id]);
  });

  test("createConfig rejects fixed without lockupDays", async () => {
    const gold = await makeCurrency("sb-cfg-fixed-no-lock");
    await expect(
      svc.createConfig(orgId, {
        name: "bad fixed",
        alias: "bad-fixed",
        type: "fixed",
        acceptedCurrencyIds: [gold.id],
      }),
    ).rejects.toMatchObject({ code: "storage_box.invalid_input" });
  });

  test("createConfig rejects non-currency acceptedCurrencyIds", async () => {
    // A plain item.id is not a valid currency — the validator now checks
    // the dedicated `currencies` table.
    const item = await itemSvc.createDefinition(orgId, {
      name: "Sword",
      alias: "sb-cfg-sword",
      stackable: false,
      holdLimit: 1,
    });
    await expect(
      svc.createConfig(orgId, {
        name: "non-curr",
        alias: "non-curr",
        type: "demand",
        acceptedCurrencyIds: [item.id],
      }),
    ).rejects.toMatchObject({ code: "storage_box.invalid_currency" });
  });

  test("updateConfig patches fields", async () => {
    const gold = await makeCurrency("sb-cfg-upd-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Before",
      alias: "sb-upd",
      type: "demand",
      acceptedCurrencyIds: [gold.id],
    });
    const updated = await svc.updateConfig(orgId, cfg.id, {
      name: "After",
      interestRateBps: 500,
    });
    expect(updated.name).toBe("After");
    expect(updated.interestRateBps).toBe(500);
  });

  test("alias conflict surfaces typed error", async () => {
    const gold = await makeCurrency("sb-cfg-dup-gold");
    await svc.createConfig(orgId, {
      name: "First",
      alias: "sb-dup",
      type: "demand",
      acceptedCurrencyIds: [gold.id],
    });
    await expect(
      svc.createConfig(orgId, {
        name: "Second",
        alias: "sb-dup",
        type: "demand",
        acceptedCurrencyIds: [gold.id],
      }),
    ).rejects.toMatchObject({ code: "storage_box.alias_conflict" });
  });

  // ─── Deposits: demand ─────────────────────────────────────────

  test("demand deposit merges into single row per (user, box, currency)", async () => {
    const gold = await makeCurrency("sb-demand-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Demand Merge",
      alias: "demand-merge",
      type: "demand",
      interestRateBps: 0,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-demand-1", gold.id, 1000);

    const r1 = await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-demand-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 300,
      },
    });
    const r2 = await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-demand-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 200,
      },
    });
    expect(r2.deposit.id).toBe(r1.deposit.id);
    expect(r2.deposit.principal).toBe(500);

    // Wallet now holds 1000 - 500 = 500 gold.
    const bal = await currencySvc.getBalance(orgId, "u-demand-1", gold.id);
    expect(bal).toBe(500);
  });

  test("demand deposit rejected for currency not in accepted list", async () => {
    const gold = await makeCurrency("sb-rej-gold");
    const silver = await makeCurrency("sb-rej-silver");
    const cfg = await svc.createConfig(orgId, {
      name: "Only Gold",
      alias: "only-gold",
      type: "demand",
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-rej-1", silver.id, 100);
    await expect(
      svc.deposit({
        organizationId: orgId,
        input: {
          endUserId: "u-rej-1",
          boxConfigId: cfg.id,
          currencyDefinitionId: silver.id,
          amount: 50,
        },
      }),
    ).rejects.toMatchObject({ code: "storage_box.currency_not_accepted" });
  });

  test("demand deposit rejected below minDeposit", async () => {
    const gold = await makeCurrency("sb-min-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Min Gold",
      alias: "min-gold",
      type: "demand",
      minDeposit: 100,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-min-1", gold.id, 500);
    await expect(
      svc.deposit({
        organizationId: orgId,
        input: {
          endUserId: "u-min-1",
          boxConfigId: cfg.id,
          currencyDefinitionId: gold.id,
          amount: 50,
        },
      }),
    ).rejects.toMatchObject({ code: "storage_box.deposit_out_of_range" });
  });

  test("demand withdraw returns currency + accrued interest", async () => {
    const gold = await makeCurrency("sb-withdraw-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Interest Demand",
      alias: "interest-demand",
      type: "demand",
      // 10% per 365 days
      interestRateBps: 1000,
      interestPeriodDays: 365,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-withdraw-1", gold.id, 1000);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2027-01-01T00:00:00Z");

    await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-withdraw-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 1000,
      },
      now: t0,
    });
    // Wallet now has 0 gold.
    const midBal = await currencySvc.getBalance(
      orgId,
      "u-withdraw-1",
      gold.id,
    );
    expect(midBal).toBe(0);

    const w = await svc.withdraw({
      organizationId: orgId,
      input: {
        endUserId: "u-withdraw-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
      },
      now: t1,
    });
    expect(w.principalPaid).toBe(1000);
    expect(w.interestPaid).toBe(100); // 1000 * 10%
    expect(w.currencyGranted).toBe(1100);

    const finalBal = await currencySvc.getBalance(
      orgId,
      "u-withdraw-1",
      gold.id,
    );
    expect(finalBal).toBe(1100);
  });

  test("demand partial withdraw leaves deposit active", async () => {
    const gold = await makeCurrency("sb-partial-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Partial Demand",
      alias: "partial-demand",
      type: "demand",
      interestRateBps: 0,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-partial-1", gold.id, 1000);
    await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-partial-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 1000,
      },
    });
    const w = await svc.withdraw({
      organizationId: orgId,
      input: {
        endUserId: "u-partial-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 400,
      },
    });
    expect(w.principalPaid).toBe(400);
    expect(w.deposit.principal).toBe(600);
    expect(w.deposit.status).toBe("active");
  });

  // ─── Deposits: fixed ──────────────────────────────────────────

  test("fixed deposit locks until maturesAt, rejects early withdraw", async () => {
    const gold = await makeCurrency("sb-lock-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "7d Lock",
      alias: "lock-7",
      type: "fixed",
      lockupDays: 7,
      interestRateBps: 5000, // 50% per period for obvious math
      interestPeriodDays: 7,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-lock-1", gold.id, 1000);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const d = await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-lock-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 1000,
      },
      now: t0,
    });
    expect(d.deposit.maturesAt).not.toBeNull();

    // Try to withdraw before maturity.
    const tEarly = new Date("2026-01-05T00:00:00Z");
    await expect(
      svc.withdraw({
        organizationId: orgId,
        input: {
          endUserId: "u-lock-1",
          depositId: d.deposit.id,
        },
        now: tEarly,
      }),
    ).rejects.toMatchObject({ code: "storage_box.lockup_not_matured" });

    // Withdraw after maturity pays principal + interest.
    const tMature = new Date("2026-01-08T00:00:00Z");
    const w = await svc.withdraw({
      organizationId: orgId,
      input: {
        endUserId: "u-lock-1",
        depositId: d.deposit.id,
      },
      now: tMature,
    });
    expect(w.principalPaid).toBe(1000);
    expect(w.interestPaid).toBe(500);
    expect(w.deposit.status).toBe("withdrawn");
  });

  test("fixed deposit with allowEarlyWithdraw forfeits interest", async () => {
    const gold = await makeCurrency("sb-early-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "Early OK",
      alias: "early-ok",
      type: "fixed",
      lockupDays: 30,
      interestRateBps: 1000,
      interestPeriodDays: 365,
      allowEarlyWithdraw: true,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-early-1", gold.id, 1000);
    const t0 = new Date("2026-01-01T00:00:00Z");
    const d = await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-early-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 1000,
      },
      now: t0,
    });
    const tEarly = new Date("2026-01-10T00:00:00Z");
    const w = await svc.withdraw({
      organizationId: orgId,
      input: {
        endUserId: "u-early-1",
        depositId: d.deposit.id,
      },
      now: tEarly,
    });
    expect(w.principalPaid).toBe(1000);
    expect(w.interestPaid).toBe(0);
    expect(w.currencyGranted).toBe(1000);
  });

  test("listDepositsForUser projects live interest without writing", async () => {
    const gold = await makeCurrency("sb-list-gold");
    const cfg = await svc.createConfig(orgId, {
      name: "List Demand",
      alias: "list-demand",
      type: "demand",
      interestRateBps: 1000,
      interestPeriodDays: 365,
      acceptedCurrencyIds: [gold.id],
    });
    await grantCurrency("u-list-1", gold.id, 1000);
    const t0 = new Date("2026-01-01T00:00:00Z");
    await svc.deposit({
      organizationId: orgId,
      input: {
        endUserId: "u-list-1",
        boxConfigId: cfg.id,
        currencyDefinitionId: gold.id,
        amount: 1000,
      },
      now: t0,
    });
    const t1 = new Date("2027-01-01T00:00:00Z");
    const views = await svc.listDepositsForUser({
      organizationId: orgId,
      endUserId: "u-list-1",
      now: t1,
    });
    const view = views.find((v) => v.boxConfigId === cfg.id);
    expect(view).toBeDefined();
    expect(view!.principal).toBe(1000);
    expect(view!.accruedInterest).toBe(0); // not yet flushed
    expect(view!.projectedInterest).toBe(100); // 10% over a year
  });
});
