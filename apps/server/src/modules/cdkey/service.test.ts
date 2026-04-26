/**
 * Service-layer tests for cdkey.
 *
 * Hits the real Neon dev branch per the apps/server/CLAUDE.md convention.
 * A single test org is seeded in beforeAll and ON DELETE CASCADE sweeps
 * every cdkey_* row on deleteTestOrg.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "../item/service";
import { createCdkeyService } from "./service";

describe("cdkey service", () => {
  const itemSvc = createItemService({ db });
  const svc = createCdkeyService({ db }, itemSvc);
  let orgId: string;
  let goldId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("cdkey-svc");
    const gold = await itemSvc.createDefinition(orgId, {
      name: "Gold CDKey",
      alias: "cdkey-gold",
      stackable: true,
    });
    goldId = gold.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Batch CRUD ─────────────────────────────────────────────

  test("createBatch universal inserts one active code", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Universal A",
      alias: "uni-a",
      codeType: "universal",
      universalCode: "SPRINGA",
      reward: [{ type: "item" as const, id: goldId, count: 100 }],
      totalLimit: 100,
      perUserLimit: 1,
    });
    expect(batch.codeType).toBe("universal");
    expect(batch.totalRedeemed).toBe(0);
    expect(batch.perUserLimit).toBe(1);

    const codeRow = await svc.getBatchUniversalCode(orgId, batch.id);
    expect(codeRow?.code).toBe("SPRINGA");
    expect(codeRow?.status).toBe("active");
  });

  test("createBatch unique generates N codes in status=pending", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Unique A",
      alias: "unq-a",
      codeType: "unique",
      reward: [{ type: "item" as const, id: goldId, count: 50 }],
      initialCount: 10,
    });
    expect(batch.codeType).toBe("unique");
    const { items } = await svc.listCodes(orgId, batch.id, { limit: 50 });
    expect(items.length).toBe(10);
    expect(items.every((c) => c.status === "pending")).toBe(true);
  });

  test("generateCodes appends more to a unique batch", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Unique Append",
      alias: "unq-append",
      codeType: "unique",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      initialCount: 3,
    });
    const { generated } = await svc.generateCodes(orgId, batch.id, {
      count: 7,
    });
    expect(generated).toBe(7);
    const { items } = await svc.listCodes(orgId, batch.id, { limit: 200 });
    expect(items.length).toBe(10);
  });

  test("updateBatch patches fields", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Update Me",
      alias: "upd-me",
      codeType: "universal",
      universalCode: "UPDCODE",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
    });
    const updated = await svc.updateBatch(orgId, batch.id, {
      name: "After",
      isActive: false,
    });
    expect(updated.name).toBe("After");
    expect(updated.isActive).toBe(false);
  });

  test("deleteBatch cascades", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Gone",
      alias: "gone",
      codeType: "unique",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      initialCount: 2,
    });
    await svc.deleteBatch(orgId, batch.id);
    const list = await svc.listBatches(orgId);
    expect(list.items.some((b) => b.id === batch.id)).toBe(false);
  });

  // ─── Universal redeem happy + limits ───────────────────────

  test("universal redeem happy path + idempotency", async () => {
    await svc.createBatch(orgId, {
      name: "Universal Redeem",
      alias: "uni-redeem",
      codeType: "universal",
      universalCode: "UNIRED",
      reward: [{ type: "item" as const, id: goldId, count: 10 }],
      totalLimit: 5,
      perUserLimit: 1,
    });

    const r1 = await svc.redeem({
      organizationId: orgId,
      endUserId: "alice",
      code: "UNIRED",
      idempotencyKey: "k-uni-1",
    });
    expect(r1.status).toBe("success");
    expect(r1.reward).toEqual([{ type: "item" as const, id: goldId, count: 10 }]);

    // Same idempotencyKey → already_redeemed cached
    const r1dup = await svc.redeem({
      organizationId: orgId,
      endUserId: "alice",
      code: "UNIRED",
      idempotencyKey: "k-uni-1",
    });
    expect(r1dup.status).toBe("already_redeemed");
    expect(r1dup.logId).toBe(r1.logId);
  });

  test("universal perUserLimit blocks second attempt by same user", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Per-User Limit",
      alias: "uni-perlimit",
      codeType: "universal",
      universalCode: "USERLIM",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      totalLimit: null,
      perUserLimit: 1,
    });

    await svc.redeem({
      organizationId: orgId,
      endUserId: "bob",
      code: "USERLIM",
      idempotencyKey: "bob-1",
    });
    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "bob",
        code: "USERLIM",
        idempotencyKey: "bob-2",
      }),
    ).rejects.toMatchObject({ code: "cdkey.user_limit_reached" });

    // totalRedeemed should have been rolled back to 1
    const reloaded = await svc.getBatch(orgId, batch.id);
    expect(reloaded.totalRedeemed).toBe(1);
  });

  test("universal totalLimit blocks when exhausted", async () => {
    await svc.createBatch(orgId, {
      name: "Total Limit",
      alias: "uni-total",
      codeType: "universal",
      universalCode: "TOTLIM",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      totalLimit: 2,
      perUserLimit: 1,
    });

    await svc.redeem({
      organizationId: orgId,
      endUserId: "u-tot-1",
      code: "TOTLIM",
      idempotencyKey: "tot-1",
    });
    await svc.redeem({
      organizationId: orgId,
      endUserId: "u-tot-2",
      code: "TOTLIM",
      idempotencyKey: "tot-2",
    });
    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "u-tot-3",
        code: "TOTLIM",
        idempotencyKey: "tot-3",
      }),
    ).rejects.toMatchObject({ code: "cdkey.total_limit_reached" });
  });

  // ─── Unique redeem ────────────────────────────────────────

  test("unique code can be redeemed once, then rejects", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Unique Redeem",
      alias: "unq-red",
      codeType: "unique",
      reward: [{ type: "item" as const, id: goldId, count: 5 }],
      initialCount: 3,
    });
    const { items } = await svc.listCodes(orgId, batch.id, { limit: 10 });
    const firstCode = items[0]!.code;

    const r = await svc.redeem({
      organizationId: orgId,
      endUserId: "charlie",
      code: firstCode,
      idempotencyKey: "ch-1",
    });
    expect(r.status).toBe("success");

    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "dave",
        code: firstCode,
        idempotencyKey: "dv-1",
      }),
    ).rejects.toMatchObject({ code: "cdkey.code_already_redeemed" });

    const reloaded = await svc.getBatch(orgId, batch.id);
    expect(reloaded.totalRedeemed).toBe(1);
  });

  test("revoked code cannot be redeemed", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Revoke Test",
      alias: "unq-rev",
      codeType: "unique",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      initialCount: 2,
    });
    const { items } = await svc.listCodes(orgId, batch.id, { limit: 10 });
    await svc.revokeCode(orgId, items[0]!.id);

    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "eve",
        code: items[0]!.code,
        idempotencyKey: "eve-rev",
      }),
    ).rejects.toMatchObject({ code: "cdkey.code_revoked" });
  });

  // ─── Edge / failure paths ─────────────────────────────────

  test("invalid code throws", async () => {
    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "x",
        code: "DOES-NOT-EXIST-XYZ",
        idempotencyKey: "no-code-1",
      }),
    ).rejects.toMatchObject({ code: "cdkey.invalid_code" });
  });

  test("inactive batch throws", async () => {
    const batch = await svc.createBatch(orgId, {
      name: "Inactive",
      alias: "uni-inac",
      codeType: "universal",
      universalCode: "INACCODE",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
    });
    await svc.updateBatch(orgId, batch.id, { isActive: false });
    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "y",
        code: "INACCODE",
        idempotencyKey: "inac-1",
      }),
    ).rejects.toMatchObject({ code: "cdkey.batch_inactive" });
  });

  test("expired batch throws", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const batch = await svc.createBatch(orgId, {
      name: "Expired",
      alias: "uni-exp",
      codeType: "universal",
      universalCode: "EXPCODE",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
      endsAt: yesterday.toISOString(),
    });
    expect(batch.endsAt).not.toBeNull();
    await expect(
      svc.redeem({
        organizationId: orgId,
        endUserId: "z",
        code: "EXPCODE",
        idempotencyKey: "exp-1",
      }),
    ).rejects.toMatchObject({ code: "cdkey.batch_expired" });
  });

  test("universal code collision throws conflict", async () => {
    await svc.createBatch(orgId, {
      name: "First",
      alias: "coll-1",
      codeType: "universal",
      universalCode: "COLLIDE",
      reward: [{ type: "item" as const, id: goldId, count: 1 }],
    });
    await expect(
      svc.createBatch(orgId, {
        name: "Second",
        alias: "coll-2",
        codeType: "universal",
        universalCode: "COLLIDE",
        reward: [{ type: "item" as const, id: goldId, count: 1 }],
      }),
    ).rejects.toMatchObject({ code: "cdkey.universal_code_conflict" });
  });
});
