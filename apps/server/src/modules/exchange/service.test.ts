/**
 * Service-layer tests for exchange.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` —
 * no mocks. The `createExchangeService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every config, option, and user_state row.
 *
 * The exchange module depends on the item module for grant/deduct
 * operations. Item definitions and grants are set up through the item
 * service — never via raw SQL.
 *
 * All test-specific aliases must be unique within this file because
 * they share the single test org.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createCurrencyService } from "../currency/service";
import { createItemService } from "../item/service";
import { createExchangeService } from "./service";

describe("exchange service", () => {
  const itemSvc = createItemService({ db });
  const currencySvc = createCurrencyService({ db });
  const svc = createExchangeService({ db }, itemSvc, currencySvc);
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("exchange-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Config CRUD ─────────────────────────────────────────────

  test("createConfig and getConfig by alias", async () => {
    const cfg = await svc.createConfig(orgId, {
      name: "Shop",
      alias: "shop-get",
      description: "Test shop",
    });
    expect(cfg.name).toBe("Shop");
    expect(cfg.alias).toBe("shop-get");
    expect(cfg.isActive).toBe(true);
    expect(cfg.organizationId).toBe(orgId);

    const fetched = await svc.getConfig(orgId, "shop-get");
    expect(fetched.id).toBe(cfg.id);
  });

  test("listConfigs returns configs for org", async () => {
    await svc.createConfig(orgId, { name: "List A", alias: "list-a" });
    await svc.createConfig(orgId, { name: "List B", alias: "list-b" });
    const rows = await svc.listConfigs(orgId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.organizationId).toBe(orgId);
    }
  });

  test("updateConfig patches fields", async () => {
    const cfg = await svc.createConfig(orgId, {
      name: "Before",
      alias: "upd-cfg",
    });
    const updated = await svc.updateConfig(orgId, cfg.id, {
      name: "After",
      description: "patched",
    });
    expect(updated.name).toBe("After");
    expect(updated.description).toBe("patched");
    expect(updated.alias).toBe("upd-cfg");
  });

  test("deleteConfig removes config", async () => {
    const cfg = await svc.createConfig(orgId, {
      name: "To Remove",
      alias: "del-cfg",
    });
    await svc.deleteConfig(orgId, cfg.id);
    await expect(
      svc.getConfig(orgId, "del-cfg"),
    ).rejects.toMatchObject({ code: "exchange.config_not_found" });
  });

  test("alias conflict surfaces typed error", async () => {
    await svc.createConfig(orgId, { name: "First", alias: "dup-exch" });
    await expect(
      svc.createConfig(orgId, { name: "Second", alias: "dup-exch" }),
    ).rejects.toMatchObject({ code: "exchange.config_alias_conflict" });
  });

  // ─── Option CRUD ─────────────────────────────────────────────

  test("createOption, listOptions, updateOption, deleteOption", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold CRUD",
      alias: "gold-crud",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem CRUD",
      alias: "gem-crud",
      stackable: true,
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Option CRUD Shop",
      alias: "opt-crud",
    });

    // create
    const opt = await svc.createOption(orgId, "opt-crud", {
      name: "Buy Gem",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 50 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 5 }],
      userLimit: 10,
    });
    expect(opt.name).toBe("Buy Gem");
    expect(opt.configId).toBe(cfg.id);
    expect(opt.costItems).toHaveLength(1);
    expect(opt.rewardItems).toHaveLength(1);

    // list
    const opts = await svc.listOptions(orgId, "opt-crud");
    expect(opts.some((o) => o.id === opt.id)).toBe(true);

    // update
    const updated = await svc.updateOption(orgId, opt.id, {
      name: "Buy Gem V2",
      userLimit: 20,
    });
    expect(updated.name).toBe("Buy Gem V2");
    expect(updated.userLimit).toBe(20);

    // delete
    await svc.deleteOption(orgId, opt.id);
    const after = await svc.listOptions(orgId, "opt-crud");
    expect(after.some((o) => o.id === opt.id)).toBe(false);
  });

  // ─── Execute exchange — happy path ──────────────────────────

  test("execute deducts cost and grants reward", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Happy",
      alias: "gold-happy",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Happy",
      alias: "gem-happy",
      stackable: true,
    });

    // Seed 1000 gold
    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-exchange",
      grants: [{ definitionId: goldDef.id, quantity: 1000 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Happy Shop",
      alias: "happy-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "100 Gold → 10 Gem",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 100 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 10 }],
    });

    const result = await svc.execute({
      organizationId: orgId,
      endUserId: "u-exchange",
      optionId: opt.id,
    });
    expect(result.success).toBe(true);
    expect(result.optionId).toBe(opt.id);

    // Verify balances
    const goldBal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-exchange",
      definitionId: goldDef.id,
    });
    expect(goldBal).toBe(900);

    const gemBal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-exchange",
      definitionId: gemDef.id,
    });
    expect(gemBal).toBe(10);
  });

  // ─── Execute exchange — insufficient balance ────────────────

  test("execute throws when user has insufficient balance", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Insuf",
      alias: "gold-insuf",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Insuf",
      alias: "gem-insuf",
      stackable: true,
    });

    // Grant only 10 gold — not enough for exchange costing 100
    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-insuf",
      grants: [{ definitionId: goldDef.id, quantity: 10 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Insuf Shop",
      alias: "insuf-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "Expensive",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 100 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 10 }],
    });

    await expect(
      svc.execute({
        organizationId: orgId,
        endUserId: "u-insuf",
        optionId: opt.id,
      }),
    ).rejects.toMatchObject({ code: "item.insufficient_balance" });
  });

  // ─── User limit ─────────────────────────────────────────────

  test("user limit blocks after reaching max exchanges", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Limit",
      alias: "gold-limit",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Limit",
      alias: "gem-limit",
      stackable: true,
    });

    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-limit",
      grants: [{ definitionId: goldDef.id, quantity: 1000 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Limit Shop",
      alias: "limit-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "Limited",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 10 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 1 }],
      userLimit: 2,
    });

    // First two should succeed
    await svc.execute({
      organizationId: orgId,
      endUserId: "u-limit",
      optionId: opt.id,
    });
    await svc.execute({
      organizationId: orgId,
      endUserId: "u-limit",
      optionId: opt.id,
    });

    // Third should fail
    await expect(
      svc.execute({
        organizationId: orgId,
        endUserId: "u-limit",
        optionId: opt.id,
      }),
    ).rejects.toMatchObject({ code: "exchange.user_limit_reached" });

    // Verify the state
    const state = await svc.getUserOptionState({
      organizationId: orgId,
      endUserId: "u-limit",
      optionId: opt.id,
    });
    expect(state.count).toBe(2);
  });

  // ─── Global limit ──────────────────────────────────────────

  test("global limit blocks after pool is exhausted", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Global",
      alias: "gold-global",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Global",
      alias: "gem-global",
      stackable: true,
    });

    // Grant gold to both users
    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-global-a",
      grants: [{ definitionId: goldDef.id, quantity: 500 }],
      source: "test",
    });
    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-global-b",
      grants: [{ definitionId: goldDef.id, quantity: 500 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Global Shop",
      alias: "global-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "Scarce",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 10 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 1 }],
      globalLimit: 1,
    });

    // User A succeeds
    await svc.execute({
      organizationId: orgId,
      endUserId: "u-global-a",
      optionId: opt.id,
    });

    // User B hits global limit
    await expect(
      svc.execute({
        organizationId: orgId,
        endUserId: "u-global-b",
        optionId: opt.id,
      }),
    ).rejects.toMatchObject({ code: "exchange.global_limit_reached" });
  });

  // ─── Idempotency ───────────────────────────────────────────

  test("idempotency key prevents double execution", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Idemp",
      alias: "gold-idemp",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Idemp",
      alias: "gem-idemp",
      stackable: true,
    });

    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-idemp",
      grants: [{ definitionId: goldDef.id, quantity: 1000 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Idemp Shop",
      alias: "idemp-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "Idemp Option",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 100 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 10 }],
    });

    const idemKey = crypto.randomUUID();

    const r1 = await svc.execute({
      organizationId: orgId,
      endUserId: "u-idemp",
      optionId: opt.id,
      idempotencyKey: idemKey,
    });
    expect(r1.success).toBe(true);

    // Second call with same key — should return without double-deducting
    const r2 = await svc.execute({
      organizationId: orgId,
      endUserId: "u-idemp",
      optionId: opt.id,
      idempotencyKey: idemKey,
    });
    expect(r2.success).toBe(true);
    expect(r2.exchangeId).toBe(r1.exchangeId);

    // Verify gold was only deducted once (1000 - 100 = 900)
    const goldBal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-idemp",
      definitionId: goldDef.id,
    });
    expect(goldBal).toBe(900);
  });

  // ─── Inactive config ──────────────────────────────────────

  test("execute rejects when config is inactive", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Inactive",
      alias: "gold-inactive",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Inactive",
      alias: "gem-inactive",
      stackable: true,
    });

    await itemSvc.grantItems({
      organizationId: orgId,
      endUserId: "u-inactive",
      grants: [{ definitionId: goldDef.id, quantity: 500 }],
      source: "test",
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Inactive Shop",
      alias: "inactive-shop",
    });
    const opt = await svc.createOption(orgId, cfg.id, {
      name: "Inactive Option",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 10 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 1 }],
    });

    // Deactivate the config
    await svc.updateConfig(orgId, cfg.id, { isActive: false });

    await expect(
      svc.execute({
        organizationId: orgId,
        endUserId: "u-inactive",
        optionId: opt.id,
      }),
    ).rejects.toMatchObject({ code: "exchange.config_inactive" });
  });

  // ─── deleteConfig cascades options ─────────────────────────

  test("deleteConfig cascades options", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Cascade",
      alias: "gold-cascade",
      stackable: true,
    });
    const gemDef = await itemSvc.createDefinition(orgId, {
      name: "Gem Cascade",
      alias: "gem-cascade",
      stackable: true,
    });

    const cfg = await svc.createConfig(orgId, {
      name: "Cascade Shop",
      alias: "cascade-shop",
    });
    await svc.createOption(orgId, cfg.id, {
      name: "Cascade Option",
      costItems: [{ type: "item" as const, id: goldDef.id, count: 10 }],
      rewardItems: [{ type: "item" as const, id: gemDef.id, count: 1 }],
    });

    // Verify option exists
    const before = await svc.listOptions(orgId, cfg.id);
    expect(before.length).toBe(1);

    // Delete config
    await svc.deleteConfig(orgId, cfg.id);

    // Config should be gone
    await expect(
      svc.getConfig(orgId, "cascade-shop"),
    ).rejects.toMatchObject({ code: "exchange.config_not_found" });

    // Options should also be gone — but we can't list by config key
    // since the config is deleted. Verify by trying to get the option
    // directly via the service's getOption (if exposed) or checking
    // that listOptions on the deleted config throws config_not_found.
    await expect(
      svc.listOptions(orgId, cfg.id),
    ).rejects.toMatchObject({ code: "exchange.config_not_found" });
  });
});
