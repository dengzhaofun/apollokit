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
