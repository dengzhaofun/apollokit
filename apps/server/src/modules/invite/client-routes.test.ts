/**
 * Route-layer tests for invite client router.
 *
 * Covers:
 *  - 401 missing x-api-key
 *  - HMAC happy path for /my-code
 *  - Server-secret happy path for /bind
 *  - 400 Zod for /bind
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { clientCredentialService } from "../client-credentials";

describe("invite client routes", () => {
  let orgId: string;
  let publishableKey: string;
  let secret: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-client-routes");
    // devMode=true so we don't have to compute HMAC in tests
    const created = await clientCredentialService.create(orgId, {
      name: "invite-client-test",
    });
    publishableKey = created.publishableKey;
    secret = created.secret;
    await clientCredentialService.updateDevMode(orgId, created.id, true);
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("401 without x-api-key", async () => {
    const res = await app.request(
      "/api/invite/client/my-code?endUserId=u1",
    );
    expect(res.status).toBe(401);
  });

  test("GET /my-code in devMode returns code", async () => {
    const res = await app.request(
      "/api/invite/client/my-code?endUserId=u1",
      { headers: { "x-api-key": publishableKey } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(
      /^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/,
    );
  });

  test("POST /bind with correct secret returns relationship", async () => {
    // Get an inviter code first
    const codeRes = await app.request(
      "/api/invite/client/my-code?endUserId=inviter-1",
      { headers: { "x-api-key": publishableKey } },
    );
    const { code } = await codeRes.json();

    const bindRes = await app.request("/api/invite/client/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-api-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code, inviteeEndUserId: "invitee-1" }),
    });
    expect(bindRes.status).toBe(200);
    const body = await bindRes.json();
    expect(body.alreadyBound).toBe(false);
    expect(body.relationship.inviterEndUserId).toBe("inviter-1");
  });

  test("POST /bind 400 on missing code", async () => {
    const res = await app.request("/api/invite/client/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-api-secret": secret,
        "content-type": "application/json",
      },
      body: JSON.stringify({ inviteeEndUserId: "invitee-2" }),
    });
    expect(res.status).toBe(400);
  });

  // Note: devMode bypasses HMAC and server-secret both. Testing the real
  // verification paths (HMAC mismatch → 401, secret mismatch → 401) is
  // covered in service-layer tests. Here we only care about HTTP wiring.
});

// Suppress unused-import warning if we don't need db directly.
void db;
