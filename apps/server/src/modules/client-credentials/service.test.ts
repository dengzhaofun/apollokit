/**
 * Service-layer tests for client-credentials.
 *
 * Hits the real Neon dev branch — no mocks. A single test org is seeded
 * in beforeAll and deleted in afterAll; ON DELETE CASCADE sweeps
 * client_credentials rows.
 *
 * The HMAC verification flow is the core of the module:
 * - Create credential → get cpk_ + csk_
 * - Compute HMAC(endUserId, csk_) → verifyRequest should pass
 * - Wrong HMAC → should throw InvalidHmac
 * - devMode=true → should skip HMAC
 * - Revoked credential → should throw CredentialDisabled
 * - Expired credential → should throw CredentialExpired
 * - Rotated credential → old secret's HMAC should fail
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { computeHmac } from "../../lib/crypto";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";

import { createClientCredentialService } from "./service";
import {
  CredentialNotFound,
  CredentialDisabled,
  CredentialExpired,
  InvalidHmac,
} from "./errors";

const APP_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret";

describe("client-credentials service", () => {
  const svc = createClientCredentialService({ db, appSecret: APP_SECRET });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("client-cred-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("create returns cpk_ + csk_ prefixed keys", async () => {
    const cred = await svc.create(orgId, { name: "test-create" });
    expect(cred.publishableKey).toMatch(/^cpk_/);
    expect(cred.secret).toMatch(/^csk_/);
    expect(cred.name).toBe("test-create");
    expect(cred.organizationId).toBe(orgId);
    expect(cred.enabled).toBe(true);
    expect(cred.devMode).toBe(false);
  });

  test("list returns credentials without secrets", async () => {
    await svc.create(orgId, { name: "test-list" });
    const list = await svc.list(orgId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const item = list.find((c) => c.name === "test-list");
    expect(item).toBeDefined();
    expect(item!.publishableKey).toMatch(/^cpk_/);
    // encryptedSecret should not be in the select
    expect((item as Record<string, unknown>).encryptedSecret).toBeUndefined();
  });

  test("get returns a single credential", async () => {
    const created = await svc.create(orgId, { name: "test-get" });
    const got = await svc.get(orgId, created.id);
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("test-get");
  });

  test("get throws CredentialNotFound for unknown id", async () => {
    await expect(svc.get(orgId, "nonexistent-id")).rejects.toThrow(
      CredentialNotFound,
    );
  });

  test("revoke sets enabled=false", async () => {
    const cred = await svc.create(orgId, { name: "test-revoke" });
    const revoked = await svc.revoke(orgId, cred.id);
    expect(revoked.enabled).toBe(false);
  });

  test("delete removes the credential", async () => {
    const cred = await svc.create(orgId, { name: "test-delete" });
    await svc.delete(orgId, cred.id);
    await expect(svc.get(orgId, cred.id)).rejects.toThrow(CredentialNotFound);
  });

  test("rotate generates new keys", async () => {
    const cred = await svc.create(orgId, { name: "test-rotate" });
    const rotated = await svc.rotate(orgId, cred.id);
    expect(rotated.publishableKey).toMatch(/^cpk_/);
    expect(rotated.secret).toMatch(/^csk_/);
    expect(rotated.publishableKey).not.toBe(cred.publishableKey);
    expect(rotated.secret).not.toBe(cred.secret);
  });

  test("updateDevMode toggles devMode", async () => {
    const cred = await svc.create(orgId, { name: "test-devmode" });
    expect(cred.devMode).toBe(false);
    const updated = await svc.updateDevMode(orgId, cred.id, true);
    expect(updated.devMode).toBe(true);
  });

  // -------------------------------------------------------------------------
  // HMAC verification
  // -------------------------------------------------------------------------

  test("verifyRequest passes with correct HMAC", async () => {
    const cred = await svc.create(orgId, { name: "test-hmac-ok" });
    const endUserId = "end-user-1";
    const hash = await computeHmac(endUserId, cred.secret);

    const result = await svc.verifyRequest(
      cred.publishableKey,
      endUserId,
      hash,
    );
    expect(result.valid).toBe(true);
    expect(result.organizationId).toBe(orgId);
    expect(result.devMode).toBe(false);
  });

  test("verifyRequest throws InvalidHmac for wrong hash", async () => {
    const cred = await svc.create(orgId, { name: "test-hmac-bad" });
    await expect(
      svc.verifyRequest(cred.publishableKey, "user-x", "deadbeef".repeat(8)),
    ).rejects.toThrow(InvalidHmac);
  });

  test("verifyRequest throws InvalidHmac when hash is missing", async () => {
    const cred = await svc.create(orgId, { name: "test-hmac-missing" });
    await expect(
      svc.verifyRequest(cred.publishableKey, "user-x", undefined),
    ).rejects.toThrow(InvalidHmac);
  });

  test("verifyRequest in devMode skips HMAC", async () => {
    const cred = await svc.create(orgId, { name: "test-hmac-dev" });
    await svc.updateDevMode(orgId, cred.id, true);

    const result = await svc.verifyRequest(
      cred.publishableKey,
      "any-user",
      undefined,
    );
    expect(result.valid).toBe(true);
    expect(result.devMode).toBe(true);
  });

  test("verifyRequest throws CredentialDisabled for revoked credential", async () => {
    const cred = await svc.create(orgId, { name: "test-hmac-revoked" });
    await svc.revoke(orgId, cred.id);
    await expect(
      svc.verifyRequest(cred.publishableKey, "user-x", "anything"),
    ).rejects.toThrow(CredentialDisabled);
  });

  test("verifyRequest throws CredentialNotFound for unknown key", async () => {
    await expect(
      svc.verifyRequest("cpk_nonexistent", "user-x", "anything"),
    ).rejects.toThrow(CredentialNotFound);
  });

  test("after rotation, old secret HMAC fails", async () => {
    const cred = await svc.create(orgId, { name: "test-rotate-hmac" });
    const oldHash = await computeHmac("user-rotate", cred.secret);

    // Rotate
    const rotated = await svc.rotate(orgId, cred.id);

    // Old HMAC against new publishable key should fail
    await expect(
      svc.verifyRequest(rotated.publishableKey, "user-rotate", oldHash),
    ).rejects.toThrow(InvalidHmac);

    // New HMAC should succeed
    const newHash = await computeHmac("user-rotate", rotated.secret);
    const result = await svc.verifyRequest(
      rotated.publishableKey,
      "user-rotate",
      newHash,
    );
    expect(result.valid).toBe(true);
  });
});
