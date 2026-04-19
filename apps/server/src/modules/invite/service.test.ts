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
