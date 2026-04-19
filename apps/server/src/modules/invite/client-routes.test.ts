/**
 * Route-layer tests for invite client router.
 *
 * Covers:
 *  - 401 missing x-api-key
 *  - 400 missing x-end-user-id header (requireClientUser middleware)
 *  - devMode happy path for /my-code
 *  - devMode happy path for /bind
 *  - 400 Zod for /bind (missing code in body)
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { clientCredentialService } from "../client-credentials";

describe("invite client routes", () => {
  let orgId: string;
  let publishableKey: string;

  beforeAll(async () => {
    orgId = await createTestOrg("invite-client-routes");
    // devMode=true so we don't have to compute HMAC in tests
    const created = await clientCredentialService.create(orgId, {
      name: "invite-client-test",
    });
    publishableKey = created.publishableKey;
    await clientCredentialService.updateDevMode(orgId, created.id, true);
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("401 without x-api-key", async () => {
    const res = await app.request("/api/client/invite/my-code");
    expect(res.status).toBe(401);
  });

  test("400 on missing x-end-user-id header", async () => {
    const res = await app.request(
      "/api/client/invite/my-code",
      { headers: { "x-api-key": publishableKey } }, // no x-end-user-id
    );
    expect(res.status).toBe(400);
  });

  test("GET /my-code in devMode returns code", async () => {
    const res = await app.request(
      "/api/client/invite/my-code",
      { headers: { "x-api-key": publishableKey, "x-end-user-id": "u1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(
      /^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/,
    );
  });

  test("POST /bind in devMode returns relationship", async () => {
    // Get an inviter code first
    const codeRes = await app.request(
      "/api/client/invite/my-code",
      { headers: { "x-api-key": publishableKey, "x-end-user-id": "inviter-1" } },
    );
    const { code } = (await codeRes.json()) as { code: string };

    const bindRes = await app.request("/api/client/invite/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-end-user-id": "invitee-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    expect(bindRes.status).toBe(200);
    const body = (await bindRes.json()) as {
      alreadyBound: boolean;
      relationship: { inviterEndUserId: string };
    };
    expect(body.alreadyBound).toBe(false);
    expect(body.relationship.inviterEndUserId).toBe("inviter-1");
  });

  test("POST /bind 400 on missing code", async () => {
    const res = await app.request("/api/client/invite/bind", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-end-user-id": "invitee-2",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // Note: devMode bypasses HMAC. Testing the real verification paths
  // (HMAC mismatch → 401) is covered in service-layer tests. Here we only
  // care about HTTP wiring.
});

// Suppress unused-import warning if we don't need db directly.
void db;
