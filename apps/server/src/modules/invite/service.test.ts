/**
 * Service-layer tests for invite module.
 *
 * Hits the real Neon dev branch configured in `.dev.vars`. Each test
 * file seeds its own test org in beforeAll and cleans via cascade.
 * End-user ids are unique per test to avoid cross-test interference.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createEventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createInviteService } from "./service";

describe("invite service — settings", () => {
  const events = createEventBus();
  const svc = createInviteService({ db, events });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-settings");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getSettings returns null when no row exists", async () => {
    const result = await svc.getSettings(orgId);
    expect(result).toBeNull();
  });

  test("upsertSettings creates a row with defaults merged", async () => {
    const result = await svc.upsertSettings(orgId, {
      enabled: true,
      codeLength: 12,
      allowSelfInvite: false,
      metadata: { tier: "pro" },
    });
    expect(result.organizationId).toBe(orgId);
    expect(result.enabled).toBe(true);
    expect(result.codeLength).toBe(12);
    expect(result.allowSelfInvite).toBe(false);
    expect(result.metadata).toEqual({ tier: "pro" });
  });

  test("upsertSettings updates existing row", async () => {
    const result = await svc.upsertSettings(orgId, {
      enabled: false,
      codeLength: 8,
    });
    expect(result.enabled).toBe(false);
    expect(result.codeLength).toBe(8);
    // unset fields keep their previous value (allowSelfInvite was false)
    expect(result.allowSelfInvite).toBe(false);
  });
});

describe("invite service — codes", () => {
  const events = createEventBus();
  const svc = createInviteService({ db, events });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-codes");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getOrCreateMyCode generates a new code on first call", async () => {
    const result = await svc.getOrCreateMyCode(orgId, "user-A");
    expect(result.code).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
    expect(result.rotatedAt).toBeNull();
  });

  test("getOrCreateMyCode returns the same code on second call", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-B");
    const second = await svc.getOrCreateMyCode(orgId, "user-B");
    expect(second.code).toBe(first.code);
  });

  test("resetCode rotates to a different code and sets rotatedAt", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-C");
    const rotated = await svc.resetCode(orgId, "user-C");
    expect(rotated.code).not.toBe(first.code);
    expect(rotated.rotatedAt).toBeInstanceOf(Date);
  });

  test("lookupByCode finds an active code (normalized input)", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "user-D");
    const normalized = code.replace("-", "");
    const hit = await svc.lookupByCode(orgId, normalized);
    expect(hit).toEqual({ endUserId: "user-D" });
  });

  test("lookupByCode accepts dashed input", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "user-E");
    const hit = await svc.lookupByCode(orgId, code);
    expect(hit).toEqual({ endUserId: "user-E" });
  });

  test("lookupByCode returns null for unknown code", async () => {
    const hit = await svc.lookupByCode(orgId, "ZZZZZZZZ");
    expect(hit).toBeNull();
  });

  test("lookupByCode returns null for malformed code", async () => {
    const hit = await svc.lookupByCode(orgId, "abc-with-0-in-it");
    expect(hit).toBeNull();
  });

  test("lookupByCode returns null for rotated-away old code", async () => {
    const first = await svc.getOrCreateMyCode(orgId, "user-F");
    await svc.resetCode(orgId, "user-F");
    const hit = await svc.lookupByCode(orgId, first.code);
    expect(hit).toBeNull();
  });
});

describe("invite service — bind", () => {
  let events: ReturnType<typeof createEventBus>;
  let svc: ReturnType<typeof createInviteService>;
  let orgId: string;
  // 全局订阅收集器：每个 test 开头清空
  const emitted: Array<{ type: string; payload: unknown }> = [];

  beforeAll(async () => {
    orgId = await createTestOrg("invite-svc-bind");
    events = createEventBus();
    svc = createInviteService({ db, events });
    events.on("invite.bound", (p) => {
      emitted.push({ type: "invite.bound", payload: p });
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("bind落关系、发 invite.bound 一次", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-1");
    const result = await svc.bind(orgId, {
      code,
      inviteeEndUserId: "invitee-1",
    });
    expect(result.alreadyBound).toBe(false);
    expect(result.relationship.inviterEndUserId).toBe("inviter-1");
    expect(result.relationship.inviteeEndUserId).toBe("invitee-1");
    expect(result.relationship.inviterCodeSnapshot).toBe(
      code.replace("-", ""),
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.type).toBe("invite.bound");
    expect(emitted[0]!.payload).toMatchObject({
      organizationId: orgId,
      endUserId: "inviter-1", // task 归属
      inviterEndUserId: "inviter-1",
      inviteeEndUserId: "invitee-1",
      code: code, // 带 "-" 的人类可读形式
    });
  });

  test("bind 幂等：相同 inviter 再 bind → alreadyBound=true，事件不重复", async () => {
    emitted.length = 0;
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-2");
    await svc.bind(orgId, { code, inviteeEndUserId: "invitee-2" });
    emitted.length = 0; // 清前一次
    const again = await svc.bind(orgId, { code, inviteeEndUserId: "invitee-2" });
    expect(again.alreadyBound).toBe(true);
    expect(again.relationship.inviterEndUserId).toBe("inviter-2");
    expect(emitted).toHaveLength(0);
  });

  test("bind 冲突：换个 inviter 再 bind 同 invitee → InviteAlreadyBound", async () => {
    const { code: codeA } = await svc.getOrCreateMyCode(orgId, "inviter-3a");
    const { code: codeB } = await svc.getOrCreateMyCode(orgId, "inviter-3b");
    await svc.bind(orgId, { code: codeA, inviteeEndUserId: "invitee-3" });
    await expect(
      svc.bind(orgId, { code: codeB, inviteeEndUserId: "invitee-3" }),
    ).rejects.toThrow(/already.*bound/i);
  });

  test("bind 自邀默认被禁 → InviteSelfInviteForbidden", async () => {
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-4");
    await expect(
      svc.bind(orgId, { code, inviteeEndUserId: "inviter-4" }),
    ).rejects.toThrow(/cannot invite yourself/i);
  });

  test("bind 自邀在 allowSelfInvite=true 下通过", async () => {
    await svc.upsertSettings(orgId, { allowSelfInvite: true });
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-5");
    const result = await svc.bind(orgId, {
      code,
      inviteeEndUserId: "inviter-5",
    });
    expect(result.relationship.inviterEndUserId).toBe("inviter-5");
    expect(result.relationship.inviteeEndUserId).toBe("inviter-5");
    // 恢复 — 否则污染后续 test
    await svc.upsertSettings(orgId, { allowSelfInvite: false });
  });

  test("bind 用不存在的码 → InviteCodeNotFound", async () => {
    await expect(
      svc.bind(orgId, {
        code: "ZZZZZZZZ",
        inviteeEndUserId: "invitee-noop",
      }),
    ).rejects.toThrow(/not found|has been reset/i);
  });

  test("bind 被禁用的租户 → InviteDisabled", async () => {
    await svc.upsertSettings(orgId, { enabled: false });
    const { code } = await svc.getOrCreateMyCode(orgId, "inviter-6");
    await expect(
      svc.bind(orgId, { code, inviteeEndUserId: "invitee-6" }),
    ).rejects.toThrow(/disabled/i);
    await svc.upsertSettings(orgId, { enabled: true });
  });
});
