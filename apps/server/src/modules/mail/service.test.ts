/**
 * Service-layer tests for mail.
 *
 * Hits the real Neon dev branch via `.dev.vars` (no mocks). The factory is
 * instantiated directly with the real `db` singleton and a real
 * `itemService` — `grantItems` writes to `item_grant_logs` and
 * `item_inventories`, so claim idempotency is genuinely end-to-end.
 *
 * A single test org is seeded in `beforeAll` and deleted in `afterAll`;
 * ON DELETE CASCADE sweeps up `mail_messages`, `mail_user_states`,
 * `item_definitions`, `item_inventories`, and `item_grant_logs`.
 *
 * All aliases / endUserIds within this file must be unique — we share one
 * org across the whole file.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createItemService } from "../item/service";
import { createMailService } from "./service";

describe("mail service", () => {
  const itemSvc = createItemService({ db });
  const svc = createMailService({ db }, itemSvc);
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("mail-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  // ─── createMessage — validation ─────────────────────────────

  test("broadcast with targetUserIds rejected", async () => {
    await expect(
      svc.createMessage(orgId, {
        title: "bad",
        content: "bad",
        rewards: [],
        targetType: "broadcast",
        targetUserIds: ["u-1"],
      }),
    ).rejects.toMatchObject({ code: "mail.invalid_target" });
  });

  test("multicast with empty targetUserIds rejected", async () => {
    await expect(
      svc.createMessage(orgId, {
        title: "bad",
        content: "bad",
        rewards: [],
        targetType: "multicast",
        targetUserIds: [],
      }),
    ).rejects.toMatchObject({ code: "mail.invalid_target" });
  });

  test("originSource without originSourceId rejected", async () => {
    await expect(
      svc.createMessage(orgId, {
        title: "bad",
        content: "bad",
        rewards: [],
        targetType: "broadcast",
        originSource: "task_complete",
      }),
    ).rejects.toMatchObject({ code: "mail.invalid_origin" });
  });

  // ─── Programmatic idempotency ──────────────────────────────

  test("repeated programmatic send with same origin pair returns same mail id", async () => {
    const first = await svc.createMessage(orgId, {
      title: "Task 42 reward",
      content: "Your task-42 reward",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-origin"],
      originSource: "task_complete",
      originSourceId: "task-42:u-origin",
    });
    const second = await svc.createMessage(orgId, {
      title: "Task 42 reward (retry)",
      content: "retried body",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-origin"],
      originSource: "task_complete",
      originSourceId: "task-42:u-origin",
    });
    expect(second.id).toBe(first.id);
    // Returned row is the original, untouched by the retry.
    expect(second.title).toBe("Task 42 reward");
  });

  test("sendUnicast wires into createMessage with multicast+1", async () => {
    const row = await svc.sendUnicast(orgId, "u-unicast", {
      title: "Refund",
      content: "Order refund",
      rewards: [],
      originSource: "order_refund",
      originSourceId: "order-7:u-unicast",
    });
    expect(row.targetType).toBe("multicast");
    expect(row.targetUserIds).toEqual(["u-unicast"]);
    expect(row.originSource).toBe("order_refund");
  });

  // ─── Inbox listing — broadcast vs multicast / since / expiry ─

  test("broadcast filtered by since; multicast unaffected by since", async () => {
    const tBase = new Date();
    // M1: broadcast sent now — a "historical" mail relative to a future join.
    const m1 = await svc.createMessage(orgId, {
      title: "B1",
      content: "b1",
      rewards: [],
      targetType: "broadcast",
    });
    // M2: multicast to a different user, also "historical".
    const m2 = await svc.createMessage(orgId, {
      title: "M2",
      content: "m2",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-newbie"],
    });

    // Simulated "new user" join happens AFTER both m1 and m2.
    // Wait a beat so `since` is strictly greater than both `sentAt`s.
    await new Promise((r) => setTimeout(r, 50));
    const joinedAt = new Date();

    const inboxBefore = await svc.listInbox(orgId, "u-newbie", {
      since: joinedAt,
    });
    const ids = inboxBefore.items.map((i) => i.id);
    // Broadcast M1 is filtered out (sent before join).
    expect(ids).not.toContain(m1.id);
    // Multicast M2 survives — since filter doesn't apply.
    expect(ids).toContain(m2.id);

    // Now send a NEW broadcast after join.
    const m3 = await svc.createMessage(orgId, {
      title: "B3",
      content: "b3",
      rewards: [],
      targetType: "broadcast",
    });

    const inboxAfter = await svc.listInbox(orgId, "u-newbie", {
      since: joinedAt,
    });
    const ids2 = inboxAfter.items.map((i) => i.id);
    expect(ids2).toContain(m3.id);
    expect(ids2).not.toContain(m1.id);

    // Keep `tBase` referenced so the lint rule doesn't flag an unused var
    // (it's kept for clarity in case this test gets extended).
    void tBase;
  });

  test("multicast only visible to listed endUserIds", async () => {
    const m = await svc.createMessage(orgId, {
      title: "vip only",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-vip"],
    });
    const vipInbox = await svc.listInbox(orgId, "u-vip", {});
    expect(vipInbox.items.map((i) => i.id)).toContain(m.id);

    const outsiderInbox = await svc.listInbox(orgId, "u-outsider", {});
    expect(outsiderInbox.items.map((i) => i.id)).not.toContain(m.id);
  });

  test("expired and revoked messages are hidden from inbox", async () => {
    // Expired: set expiresAt in the past.
    const expired = await svc.createMessage(orgId, {
      title: "expired",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-exp"],
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    // Revoked: create, then revoke.
    const revoked = await svc.createMessage(orgId, {
      title: "revoked",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-exp"],
    });
    await svc.revokeMessage(orgId, revoked.id);

    const inbox = await svc.listInbox(orgId, "u-exp", {});
    const ids = inbox.items.map((i) => i.id);
    expect(ids).not.toContain(expired.id);
    expect(ids).not.toContain(revoked.id);
  });

  // ─── Claim — happy path, grants items, updates state ────────

  test("claim grants rewards and updates state", async () => {
    const goldDef = await itemSvc.createDefinition(orgId, {
      name: "Gold Claim",
      alias: "gold-claim",
      stackable: true,
    });
    const mail = await svc.createMessage(orgId, {
      title: "100 gold",
      content: "free",
      rewards: [{ definitionId: goldDef.id, quantity: 100 }],
      targetType: "multicast",
      targetUserIds: ["u-claim"],
    });

    const result = await svc.claim(orgId, "u-claim", mail.id);
    expect(result.messageId).toBe(mail.id);
    expect(result.rewards).toEqual([
      { definitionId: goldDef.id, quantity: 100 },
    ]);
    expect(result.claimedAt).toBeInstanceOf(Date);

    const bal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-claim",
      definitionId: goldDef.id,
    });
    expect(bal).toBe(100);
  });

  test("double-claim is blocked; balance unchanged", async () => {
    const def = await itemSvc.createDefinition(orgId, {
      name: "Gold Dup",
      alias: "gold-dup",
      stackable: true,
    });
    const mail = await svc.createMessage(orgId, {
      title: "dup",
      content: "x",
      rewards: [{ definitionId: def.id, quantity: 10 }],
      targetType: "multicast",
      targetUserIds: ["u-dup"],
    });
    await svc.claim(orgId, "u-dup", mail.id);
    await expect(svc.claim(orgId, "u-dup", mail.id)).rejects.toMatchObject({
      code: "mail.already_claimed",
    });

    const bal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-dup",
      definitionId: def.id,
    });
    expect(bal).toBe(10);
  });

  // ─── requireRead gate ───────────────────────────────────────

  test("requireRead=true: claim without read → must_read_first", async () => {
    const def = await itemSvc.createDefinition(orgId, {
      name: "Gold Gate",
      alias: "gold-gate",
      stackable: true,
    });
    const mail = await svc.createMessage(orgId, {
      title: "read me",
      content: "x",
      rewards: [{ definitionId: def.id, quantity: 5 }],
      targetType: "multicast",
      targetUserIds: ["u-gate"],
      requireRead: true,
    });

    await expect(svc.claim(orgId, "u-gate", mail.id)).rejects.toMatchObject({
      code: "mail.must_read_first",
    });

    // No grant happened.
    const bal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-gate",
      definitionId: def.id,
    });
    expect(bal).toBe(0);

    // Mark read → claim → should succeed.
    await svc.markRead(orgId, "u-gate", mail.id);
    const result = await svc.claim(orgId, "u-gate", mail.id);
    expect(result.claimedAt).toBeInstanceOf(Date);
    expect(result.readAt).toBeInstanceOf(Date);

    const bal2 = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-gate",
      definitionId: def.id,
    });
    expect(bal2).toBe(5);
  });

  // ─── Targeting guard on claim ──────────────────────────────

  test("outsider cannot claim a multicast mail", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "vip only",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-insider"],
    });
    await expect(svc.claim(orgId, "u-outsider2", mail.id)).rejects.toMatchObject(
      {
        code: "mail.not_targeted",
      },
    );
  });

  // ─── markRead is idempotent ────────────────────────────────

  test("markRead is idempotent (readAt stays fixed)", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "idem-read",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-ir"],
    });
    const s1 = await svc.markRead(orgId, "u-ir", mail.id);
    expect(s1.readAt).toBeInstanceOf(Date);
    const readAt1 = s1.readAt!.getTime();

    await new Promise((r) => setTimeout(r, 10));
    const s2 = await svc.markRead(orgId, "u-ir", mail.id);
    expect(s2.readAt!.getTime()).toBe(readAt1);
  });

  // ─── Concurrent claim: only one wins ───────────────────────

  test("concurrent claim: exactly one succeeds", async () => {
    const def = await itemSvc.createDefinition(orgId, {
      name: "Gold Race",
      alias: "gold-race",
      stackable: true,
    });
    const mail = await svc.createMessage(orgId, {
      title: "race",
      content: "x",
      rewards: [{ definitionId: def.id, quantity: 50 }],
      targetType: "multicast",
      targetUserIds: ["u-race"],
    });

    const [a, b] = await Promise.allSettled([
      svc.claim(orgId, "u-race", mail.id),
      svc.claim(orgId, "u-race", mail.id),
    ]);

    const fulfilled = [a, b].filter((x) => x.status === "fulfilled");
    const rejected = [a, b].filter((x) => x.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "mail.already_claimed",
    });

    // Items granted exactly once.
    const bal = await itemSvc.getBalance({
      organizationId: orgId,
      endUserId: "u-race",
      definitionId: def.id,
    });
    expect(bal).toBe(50);
  });

  // ─── getMessage — stats ────────────────────────────────────

  test("getMessage returns aggregate stats", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "stats",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-s1", "u-s2", "u-s3"],
    });
    await svc.markRead(orgId, "u-s1", mail.id);
    await svc.markRead(orgId, "u-s2", mail.id);
    await svc.claim(orgId, "u-s1", mail.id);

    const detail = await svc.getMessage(orgId, mail.id);
    expect(detail.readCount).toBe(2);
    expect(detail.claimCount).toBe(1);
    expect(detail.targetCount).toBe(3);
  });

  test("broadcast message detail has targetCount=null", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "bcast-stats",
      content: "x",
      rewards: [],
      targetType: "broadcast",
    });
    const detail = await svc.getMessage(orgId, mail.id);
    expect(detail.targetCount).toBeNull();
  });

  // ─── revoke is idempotent; claim-after-revoke throws ───────

  test("revoke is idempotent; claim on revoked throws", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "revoke-me",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-rv"],
    });
    await svc.revokeMessage(orgId, mail.id);
    // Second revoke is a no-op (does not throw).
    await svc.revokeMessage(orgId, mail.id);

    await expect(svc.claim(orgId, "u-rv", mail.id)).rejects.toMatchObject({
      code: "mail.revoked",
    });
  });

  // ─── deleteMessage removes everything (cascade) ────────────

  test("deleteMessage hard-deletes and blocks subsequent ops", async () => {
    const mail = await svc.createMessage(orgId, {
      title: "del",
      content: "x",
      rewards: [],
      targetType: "multicast",
      targetUserIds: ["u-del"],
    });
    await svc.markRead(orgId, "u-del", mail.id);
    await svc.deleteMessage(orgId, mail.id);
    await expect(
      svc.claim(orgId, "u-del", mail.id),
    ).rejects.toMatchObject({ code: "mail.message_not_found" });
  });
});
