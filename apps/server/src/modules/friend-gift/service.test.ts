/**
 * Service-layer tests for friend-gift.
 *
 * Hits the real Neon dev branch via `.dev.vars` (no mocks for DB). The
 * friend service is real (needed for areFriends/isBlocked checks). The item
 * service is a minimal mock that records calls — we can't easily set up
 * real item definitions in this test scope, and the gift service only calls
 * grantItems/deductItems.
 *
 * A single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up all friend-gift tables.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createFriendService } from "../friend/service";
import {
  FriendGiftAlreadyClaimed,
  FriendGiftDailySendLimitReached,
  FriendGiftNotFriends,
  FriendGiftNotFound,
  FriendGiftPackageNotFound,
} from "./errors";
import { createFriendGiftService } from "./service";
import type { ItemServiceDep } from "./service";

describe("friend-gift service", () => {
  const friendSvc = createFriendService({ db });

  // Mock item service — records calls for assertion
  const grantedItems: Array<{
    organizationId: string;
    endUserId: string;
    grants: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }> = [];
  const deductedItems: Array<{
    organizationId: string;
    endUserId: string;
    deductions: Array<{ definitionId: string; quantity: number }>;
    source: string;
    sourceId?: string;
  }> = [];

  const mockItemService: ItemServiceDep = {
    grantItems: async (params) => {
      grantedItems.push(params);
    },
    deductItems: async (params) => {
      deductedItems.push(params);
    },
  };

  const svc = createFriendGiftService({ db }, friendSvc, mockItemService);
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("gift-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Settings ─────────────────────────────────────────────────

  test("getSettings returns null initially", async () => {
    const result = await svc.getSettings(orgId);
    expect(result).toBeNull();
  });

  test("upsertSettings creates settings", async () => {
    const settings = await svc.upsertSettings(orgId, {
      dailySendLimit: 3,
      dailyReceiveLimit: 5,
      timezone: "Asia/Shanghai",
    });

    expect(settings.organizationId).toBe(orgId);
    expect(settings.dailySendLimit).toBe(3);
    expect(settings.dailyReceiveLimit).toBe(5);
    expect(settings.timezone).toBe("Asia/Shanghai");
  });

  test("upsertSettings updates existing settings", async () => {
    const updated = await svc.upsertSettings(orgId, {
      dailySendLimit: 2,
      dailyReceiveLimit: 10,
      timezone: "UTC",
    });

    expect(updated.dailySendLimit).toBe(2);
    expect(updated.dailyReceiveLimit).toBe(10);
    expect(updated.timezone).toBe("UTC");
  });

  test("getSettings returns settings after upsert", async () => {
    const settings = await svc.getSettings(orgId);
    expect(settings).not.toBeNull();
    expect(settings!.dailySendLimit).toBe(2);
  });

  // ─── Package CRUD ─────────────────────────────────────────────

  let packageId: string;

  test("createPackage creates a gift package", async () => {
    const pkg = await svc.createPackage(orgId, {
      name: "Flower Bouquet",
      alias: "flower-bouquet",
      description: "A lovely bouquet",
      giftItems: [{ definitionId: "item-flower", quantity: 1 }],
      isActive: true,
    });

    expect(pkg.organizationId).toBe(orgId);
    expect(pkg.name).toBe("Flower Bouquet");
    expect(pkg.alias).toBe("flower-bouquet");
    expect(pkg.giftItems).toEqual([
      { definitionId: "item-flower", quantity: 1 },
    ]);
    expect(pkg.isActive).toBe(true);
    expect(typeof pkg.sortOrder).toBe("string");
    expect(pkg.sortOrder.length).toBeGreaterThan(0);
    packageId = pkg.id;
  });

  test("getPackage returns package details", async () => {
    const pkg = await svc.getPackage(orgId, packageId);
    expect(pkg.id).toBe(packageId);
    expect(pkg.name).toBe("Flower Bouquet");
  });

  test("getPackage throws for non-existent id", async () => {
    await expect(
      svc.getPackage(orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(FriendGiftPackageNotFound);
  });

  test("listPackages returns all packages", async () => {
    const pkgs = await svc.listPackages(orgId);
    expect(pkgs.items.length).toBeGreaterThanOrEqual(1);
    expect(pkgs.items.some((p) => p.id === packageId)).toBe(true);
  });

  test("updatePackage updates fields", async () => {
    const updated = await svc.updatePackage(orgId, packageId, {
      name: "Rose Bouquet",
      description: "A lovely rose bouquet",
    });
    expect(updated.name).toBe("Rose Bouquet");
    expect(updated.description).toBe("A lovely rose bouquet");
    // Unchanged fields preserved
    expect(updated.alias).toBe("flower-bouquet");
  });

  test("deletePackage removes package", async () => {
    // Create a throwaway package to delete
    const throwaway = await svc.createPackage(orgId, {
      name: "Throwaway",
      giftItems: [{ definitionId: "item-x", quantity: 1 }],
    });
    await svc.deletePackage(orgId, throwaway.id);

    await expect(
      svc.getPackage(orgId, throwaway.id),
    ).rejects.toBeInstanceOf(FriendGiftPackageNotFound);
  });

  test("deletePackage throws for non-existent id", async () => {
    await expect(
      svc.deletePackage(orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(FriendGiftPackageNotFound);
  });

  // ─── Send Gift Flow ───────────────────────────────────────────

  const sender = "gift-sender";
  const receiver = "gift-receiver";
  const stranger = "gift-stranger";

  // Set up friendship before send tests
  test("setup: make sender and receiver friends", async () => {
    const req = await friendSvc.sendRequest(orgId, sender, receiver);
    await friendSvc.acceptRequest(orgId, req.id, receiver);

    const areFriends = await friendSvc.areFriends(orgId, sender, receiver);
    expect(areFriends).toBe(true);
  });

  test("setup: reset settings for send tests (dailySendLimit=2, dailyReceiveLimit=5)", async () => {
    await svc.upsertSettings(orgId, {
      dailySendLimit: 2,
      dailyReceiveLimit: 5,
      timezone: "UTC",
    });
  });

  let sentGiftId: string;

  test("sendGift succeeds between friends and deducts items", async () => {
    const beforeDeductCount = deductedItems.length;

    const send = await svc.sendGift(orgId, sender, {
      packageId,
      receiverUserId: receiver,
      message: "For you!",
    });

    expect(send.senderUserId).toBe(sender);
    expect(send.receiverUserId).toBe(receiver);
    expect(send.packageId).toBe(packageId);
    expect(send.status).toBe("pending");
    expect(send.message).toBe("For you!");
    expect(send.giftItems).toEqual([
      { definitionId: "item-flower", quantity: 1 },
    ]);

    // Verify deductItems was called
    expect(deductedItems.length).toBe(beforeDeductCount + 1);
    const lastDeduct = deductedItems[deductedItems.length - 1]!;
    expect(lastDeduct.organizationId).toBe(orgId);
    expect(lastDeduct.endUserId).toBe(sender);
    expect(lastDeduct.source).toBe("friend_gift_send");

    sentGiftId = send.id;
  });

  test("sendGift fails when not friends", async () => {
    await expect(
      svc.sendGift(orgId, sender, {
        packageId,
        receiverUserId: stranger,
      }),
    ).rejects.toBeInstanceOf(FriendGiftNotFriends);
  });

  test("sendGift respects daily send limit", async () => {
    // We already sent 1 gift, limit is 2. Send one more.
    await svc.sendGift(orgId, sender, {
      packageId,
      receiverUserId: receiver,
    });

    // Third send should fail
    await expect(
      svc.sendGift(orgId, sender, {
        packageId,
        receiverUserId: receiver,
      }),
    ).rejects.toBeInstanceOf(FriendGiftDailySendLimitReached);
  });

  // ─── Claim Gift Flow ─────────────────────────────────────────

  test("claimGift succeeds and grants items to receiver", async () => {
    const beforeGrantCount = grantedItems.length;

    const claimed = await svc.claimGift(orgId, sentGiftId, receiver);

    expect(claimed.status).toBe("claimed");
    expect(claimed.claimedAt).not.toBeNull();

    // Verify grantItems was called
    expect(grantedItems.length).toBe(beforeGrantCount + 1);
    const lastGrant = grantedItems[grantedItems.length - 1]!;
    expect(lastGrant.organizationId).toBe(orgId);
    expect(lastGrant.endUserId).toBe(receiver);
    expect(lastGrant.source).toBe("friend_gift_claim");
    expect(lastGrant.sourceId).toBe(sentGiftId);
  });

  test("claimGift on already claimed gift throws FriendGiftAlreadyClaimed", async () => {
    await expect(
      svc.claimGift(orgId, sentGiftId, receiver),
    ).rejects.toBeInstanceOf(FriendGiftAlreadyClaimed);
  });

  test("claimGift by wrong user fails (FriendGiftNotFound or no rows)", async () => {
    // Create a fresh gift for this test
    // First, bump the send limit so we can send more
    await svc.upsertSettings(orgId, {
      dailySendLimit: 20,
      dailyReceiveLimit: 20,
      timezone: "UTC",
    });

    const send = await svc.sendGift(orgId, sender, {
      packageId,
      receiverUserId: receiver,
    });

    // Wrong user tries to claim — the WHERE clause filters by receiverUserId
    // so the UPDATE returns 0 rows, then the SELECT finds the row but the
    // receiver doesn't match, resulting in a FriendGiftNotFound-like error.
    // The service resolves this as a concurrency/not-found path.
    await expect(
      svc.claimGift(orgId, send.id, stranger),
    ).rejects.toThrow();
  });

  // ─── Daily Status ─────────────────────────────────────────────

  test("getDailyStatus returns current counts", async () => {
    const status = await svc.getDailyStatus(orgId, sender);

    expect(status.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Sender has sent at least 2 gifts in the tests above (before limit bump)
    expect(status.sendCount).toBeGreaterThanOrEqual(2);
    expect(status.dailySendLimit).toBe(20); // updated limit
    expect(status.dailyReceiveLimit).toBe(20);
  });

  test("getDailyStatus returns zeros for unknown user", async () => {
    const status = await svc.getDailyStatus(orgId, "nobody");
    expect(status.sendCount).toBe(0);
    expect(status.receiveCount).toBe(0);
  });

  // ─── Inbox / Sent ─────────────────────────────────────────────

  test("listInbox returns pending gifts for receiver", async () => {
    // Ensure limits are high enough for additional sends
    await svc.upsertSettings(orgId, {
      dailySendLimit: 50,
      dailyReceiveLimit: 50,
      timezone: "UTC",
    });

    // Send a fresh gift so there's at least one pending in inbox
    const send = await svc.sendGift(orgId, sender, {
      packageId,
      receiverUserId: receiver,
      message: "inbox test",
    });

    const inbox = await svc.listInbox(orgId, receiver);
    expect(inbox.length).toBeGreaterThanOrEqual(1);
    const found = inbox.find((g) => g.id === send.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe("pending");
  });

  test("listSent returns sent gifts for sender", async () => {
    const sent = await svc.listSent(orgId, sender);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    // All sent items should have this sender
    expect(sent.every((g) => g.senderUserId === sender)).toBe(true);
  });

  test("listInbox does not include claimed gifts", async () => {
    const inbox = await svc.listInbox(orgId, receiver);
    // The first gift we claimed should not appear
    const claimed = inbox.find((g) => g.id === sentGiftId);
    expect(claimed).toBeUndefined();
  });

  // ─── Admin ────────────────────────────────────────────────────

  test("listSends returns all gift sends", async () => {
    const sends = await svc.listSends(orgId);
    expect(sends.items.length).toBeGreaterThanOrEqual(1);
    // All belong to our org
    expect(sends.items.every((s) => s.organizationId === orgId)).toBe(true);
  });

  test("listSends respects pagination", async () => {
    const page = await svc.listSends(orgId, { limit: 1 });
    expect(page.items.length).toBeLessThanOrEqual(1);
  });

  test("getSend returns a specific send", async () => {
    const send = await svc.getSend(orgId, sentGiftId);
    expect(send.id).toBe(sentGiftId);
    expect(send.organizationId).toBe(orgId);
  });

  test("getSend throws for non-existent id", async () => {
    await expect(
      svc.getSend(orgId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(FriendGiftNotFound);
  });
});
