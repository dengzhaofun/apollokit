/**
 * Service-layer tests for friend module.
 *
 * These talk to the real Neon dev branch configured in `.dev.vars` —
 * no mocks. The `createFriendService` factory is invoked directly with
 * the real `db` singleton, bypassing HTTP and Better Auth entirely. A
 * single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up every relationship, request, block, and
 * settings row.
 *
 * All end-user ids are unique per test to avoid cross-test interference.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createFriendService } from "./service";
import {
  FriendAlreadyExists,
  FriendBlockedUser,
  FriendRequestAlreadyExists,
  FriendRequestNotFound,
  FriendSelfAction,
} from "./errors";

describe("friend service", () => {
  const svc = createFriendService({ db });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("friend-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── Settings ───────────────────────────────────────────────────

  test("getSettings returns null when no settings exist", async () => {
    const result = await svc.getSettings(orgId);
    expect(result).toBeNull();
  });

  test("upsertSettings creates settings with correct values", async () => {
    const result = await svc.upsertSettings(orgId, {
      maxFriends: 100,
      maxBlocked: 30,
      maxPendingRequests: 10,
      metadata: { tier: "premium" },
    });
    expect(result.tenantId).toBe(orgId);
    expect(result.maxFriends).toBe(100);
    expect(result.maxBlocked).toBe(30);
    expect(result.maxPendingRequests).toBe(10);
    expect(result.metadata).toEqual({ tier: "premium" });
  });

  test("upsertSettings updates existing settings", async () => {
    const result = await svc.upsertSettings(orgId, {
      maxFriends: 200,
      maxBlocked: 60,
      maxPendingRequests: 25,
      metadata: { tier: "enterprise" },
    });
    expect(result.maxFriends).toBe(200);
    expect(result.maxBlocked).toBe(60);
    expect(result.maxPendingRequests).toBe(25);
    expect(result.metadata).toEqual({ tier: "enterprise" });

    // Verify via getSettings
    const fetched = await svc.getSettings(orgId);
    expect(fetched).not.toBeNull();
    expect(fetched!.maxFriends).toBe(200);
  });

  // ─── Friend Requests ───────────────────────────────────────────

  test("sendRequest creates a pending request", async () => {
    const req = await svc.sendRequest(orgId, "fr-u1", "fr-u2", "hi!");
    expect(req.tenantId).toBe(orgId);
    expect(req.fromUserId).toBe("fr-u1");
    expect(req.toUserId).toBe("fr-u2");
    expect(req.status).toBe("pending");
    expect(req.message).toBe("hi!");
  });

  test("sendRequest to self throws FriendSelfAction", async () => {
    await expect(
      svc.sendRequest(orgId, "fr-u3", "fr-u3"),
    ).rejects.toThrow(FriendSelfAction);
  });

  test("sendRequest duplicate pending throws FriendRequestAlreadyExists", async () => {
    // fr-u1 → fr-u2 already exists from the earlier test
    await expect(
      svc.sendRequest(orgId, "fr-u1", "fr-u2"),
    ).rejects.toThrow(FriendRequestAlreadyExists);
  });

  test("sendRequest when already friends throws FriendAlreadyExists", async () => {
    // Create and accept a friendship: fr-u4 → fr-u5
    const req = await svc.sendRequest(orgId, "fr-u4", "fr-u5");
    await svc.acceptRequest(orgId, req.id, "fr-u5");

    // Now sending another request should throw
    await expect(
      svc.sendRequest(orgId, "fr-u4", "fr-u5"),
    ).rejects.toThrow(FriendAlreadyExists);
  });

  // ─── Accept / Reject / Cancel ──────────────────────────────────

  test("acceptRequest transitions to accepted and creates friendship", async () => {
    const req = await svc.sendRequest(orgId, "fr-u6", "fr-u7");
    const accepted = await svc.acceptRequest(orgId, req.id, "fr-u7");

    expect(accepted.status).toBe("accepted");
    expect(accepted.respondedAt).not.toBeNull();

    // Verify friendship exists
    const isFriend = await svc.areFriends(orgId, "fr-u6", "fr-u7");
    expect(isFriend).toBe(true);
  });

  test("acceptRequest by wrong user throws FriendRequestNotFound", async () => {
    const req = await svc.sendRequest(orgId, "fr-u8", "fr-u9");

    // fr-u8 is the sender, not the receiver — should fail
    await expect(
      svc.acceptRequest(orgId, req.id, "fr-u8"),
    ).rejects.toThrow(FriendRequestNotFound);
  });

  test("rejectRequest transitions to rejected", async () => {
    const req = await svc.sendRequest(orgId, "fr-u10", "fr-u11");
    const rejected = await svc.rejectRequest(orgId, req.id, "fr-u11");

    expect(rejected.status).toBe("rejected");
    expect(rejected.respondedAt).not.toBeNull();
  });

  test("cancelRequest by sender transitions to cancelled", async () => {
    const req = await svc.sendRequest(orgId, "fr-u12", "fr-u13");
    const cancelled = await svc.cancelRequest(orgId, req.id, "fr-u12");

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.respondedAt).not.toBeNull();
  });

  test("cancelRequest by receiver throws FriendRequestNotFound", async () => {
    const req = await svc.sendRequest(orgId, "fr-u14", "fr-u15");

    // fr-u15 is the receiver, only sender can cancel
    await expect(
      svc.cancelRequest(orgId, req.id, "fr-u15"),
    ).rejects.toThrow(FriendRequestNotFound);
  });

  // ─── Friend List ───────────────────────────────────────────────

  test("listFriends includes accepted friends", async () => {
    const req = await svc.sendRequest(orgId, "fr-u16", "fr-u17");
    await svc.acceptRequest(orgId, req.id, "fr-u17");

    const friends = await svc.listFriends(orgId, "fr-u16");
    const friendIds = friends.map((f) =>
      f.userA === "fr-u16" ? f.userB : f.userA,
    );
    expect(friendIds).toContain("fr-u17");
  });

  test("areFriends returns true after accept", async () => {
    // fr-u16 and fr-u17 are friends from the previous test
    expect(await svc.areFriends(orgId, "fr-u16", "fr-u17")).toBe(true);
    // Reversed order should also work
    expect(await svc.areFriends(orgId, "fr-u17", "fr-u16")).toBe(true);
  });

  test("removeFriend removes the relationship", async () => {
    const req = await svc.sendRequest(orgId, "fr-u18", "fr-u19");
    await svc.acceptRequest(orgId, req.id, "fr-u19");

    // Get the friendship to find its id
    const friends = await svc.listFriends(orgId, "fr-u18");
    const rel = friends.find(
      (f) =>
        (f.userA === "fr-u18" && f.userB === "fr-u19") ||
        (f.userA === "fr-u19" && f.userB === "fr-u18"),
    );
    expect(rel).toBeDefined();

    await svc.removeFriend(orgId, rel!.id);
    expect(await svc.areFriends(orgId, "fr-u18", "fr-u19")).toBe(false);
  });

  // ─── Incoming / Outgoing Requests ──────────────────────────────

  test("listIncomingRequests shows pending requests to a user", async () => {
    const req = await svc.sendRequest(orgId, "fr-u20", "fr-u21");
    const incoming = await svc.listIncomingRequests(orgId, "fr-u21");
    const ids = incoming.map((r) => r.id);
    expect(ids).toContain(req.id);
  });

  test("listOutgoingRequests shows pending requests from a user", async () => {
    // fr-u20 → fr-u21 was sent above
    const outgoing = await svc.listOutgoingRequests(orgId, "fr-u20");
    const toUserIds = outgoing.map((r) => r.toUserId);
    expect(toUserIds).toContain("fr-u21");
  });

  // ─── Mutual Friends ────────────────────────────────────────────

  test("getMutualFriends returns shared friends", async () => {
    // Setup: A-B, A-C, B-C friendships
    const a = "fr-mut-a";
    const b = "fr-mut-b";
    const c = "fr-mut-c";

    const r1 = await svc.sendRequest(orgId, a, b);
    await svc.acceptRequest(orgId, r1.id, b);

    const r2 = await svc.sendRequest(orgId, a, c);
    await svc.acceptRequest(orgId, r2.id, c);

    const r3 = await svc.sendRequest(orgId, b, c);
    await svc.acceptRequest(orgId, r3.id, c);

    // A and B should have C as a mutual friend
    const mutual = await svc.getMutualFriends(orgId, a, b);
    const mutualUserIds = mutual.map((m) =>
      m.user_a === a ? m.user_b : m.user_a,
    );
    expect(mutualUserIds).toContain(c);
  });

  // ─── Block ─────────────────────────────────────────────────────

  test("blockUser inserts block and isBlocked returns true", async () => {
    await svc.blockUser(orgId, "fr-u30", "fr-u31");
    expect(await svc.isBlocked(orgId, "fr-u30", "fr-u31")).toBe(true);
    // Reverse direction should be false (only one-way block)
    expect(await svc.isBlocked(orgId, "fr-u31", "fr-u30")).toBe(false);
  });

  test("blockUser removes existing friendship", async () => {
    // Create friendship first
    const req = await svc.sendRequest(orgId, "fr-u32", "fr-u33");
    await svc.acceptRequest(orgId, req.id, "fr-u33");
    expect(await svc.areFriends(orgId, "fr-u32", "fr-u33")).toBe(true);

    // Now block
    await svc.blockUser(orgId, "fr-u32", "fr-u33");
    expect(await svc.areFriends(orgId, "fr-u32", "fr-u33")).toBe(false);
    expect(await svc.isBlocked(orgId, "fr-u32", "fr-u33")).toBe(true);
  });

  test("blockUser cancels pending requests in both directions", async () => {
    // Send a request from u34 → u35
    const req = await svc.sendRequest(orgId, "fr-u34", "fr-u35");
    expect(req.status).toBe("pending");

    // u35 blocks u34 — should cancel the pending request
    await svc.blockUser(orgId, "fr-u35", "fr-u34");

    // Verify no pending incoming requests for u35 from u34
    const incoming = await svc.listIncomingRequests(orgId, "fr-u35");
    const fromU34 = incoming.filter((r) => r.fromUserId === "fr-u34");
    expect(fromU34).toHaveLength(0);

    // And no pending outgoing from u34 to u35
    const outgoing = await svc.listOutgoingRequests(orgId, "fr-u34");
    const toU35 = outgoing.filter((r) => r.toUserId === "fr-u35");
    expect(toU35).toHaveLength(0);
  });

  test("sendRequest from blocked user throws FriendBlockedUser", async () => {
    // fr-u30 blocked fr-u31 earlier
    await expect(
      svc.sendRequest(orgId, "fr-u31", "fr-u30"),
    ).rejects.toThrow(FriendBlockedUser);

    // Also the blocker trying to send to blocked should throw
    await expect(
      svc.sendRequest(orgId, "fr-u30", "fr-u31"),
    ).rejects.toThrow(FriendBlockedUser);
  });

  test("unblockUser removes the block", async () => {
    await svc.blockUser(orgId, "fr-u36", "fr-u37");
    expect(await svc.isBlocked(orgId, "fr-u36", "fr-u37")).toBe(true);

    await svc.unblockUser(orgId, "fr-u36", "fr-u37");
    expect(await svc.isBlocked(orgId, "fr-u36", "fr-u37")).toBe(false);
  });

  test("listBlocks returns blocks for a user", async () => {
    await svc.blockUser(orgId, "fr-u38", "fr-u39");
    const blocks = await svc.listBlocks(orgId, "fr-u38");
    const blockedIds = blocks.map((b) => b.blockedUserId);
    expect(blockedIds).toContain("fr-u39");
  });

  // ─── Admin ─────────────────────────────────────────────────────

  test("listRelationships returns all relationships with total", async () => {
    const req = await svc.sendRequest(orgId, "fr-u40", "fr-u41");
    await svc.acceptRequest(orgId, req.id, "fr-u41");

    const result = await svc.listRelationships(orgId);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeGreaterThanOrEqual(1);

    // Check that fr-u40/fr-u41 appears
    const found = result.items.some(
      (r) =>
        (r.userA === "fr-u40" && r.userB === "fr-u41") ||
        (r.userA === "fr-u41" && r.userB === "fr-u40"),
    );
    expect(found).toBe(true);
  });

  test("deleteRelationship removes a friendship", async () => {
    const req = await svc.sendRequest(orgId, "fr-u42", "fr-u43");
    await svc.acceptRequest(orgId, req.id, "fr-u43");

    const friends = await svc.listFriends(orgId, "fr-u42");
    const rel = friends.find(
      (f) =>
        (f.userA === "fr-u42" && f.userB === "fr-u43") ||
        (f.userA === "fr-u43" && f.userB === "fr-u42"),
    );
    expect(rel).toBeDefined();

    await svc.deleteRelationship(orgId, rel!.id);
    expect(await svc.areFriends(orgId, "fr-u42", "fr-u43")).toBe(false);
  });
});
