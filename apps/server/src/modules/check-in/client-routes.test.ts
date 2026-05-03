/**
 * Route-layer tests for the C-end client check-in routes.
 *
 * These exercise the HTTP surface under `/api/client/check-in/*`:
 * - requireClientCredential middleware (cpk_ validation, 401 rejection)
 * - requireClientUser middleware (header HMAC verification)
 * - Cross-auth rejection (session cookie or admin key on client route → 401)
 * - devMode bypass
 * - Happy path: check-in + state query with valid HMAC in headers
 *
 * Setup: creates a test org, user/session (for cross-auth tests), a check-in
 * config, and a client credential. Cleanup via org delete cascade.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { computeHmac } from "../../lib/crypto";
import app from "../../index";
import { organization, user } from "../../schema";
import { getDefaultTeamId } from "../../testing/fixtures";
import { createClientCredentialService } from "../client-credentials/service";

const ORIGIN = "http://localhost:8787";
const APP_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret";

type Fixture = {
  orgId: string;
  tenantId: string;
  cookie: string;
  adminUserId: string;
  publishableKey: string;
  secret: string;
};

async function setupFixture(): Promise<Fixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `client-routes-${stamp}@example.test`;

  // Sign up + org create (same flow as check-in routes.test.ts)
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: "apollokit-test-pw-z3xK9fQp", name: "Client Routes Test" }),
  });
  if (signUp.status !== 200) throw new Error(`sign-up failed: ${await signUp.text()}`);

  const cookie = signUp.headers.get("set-cookie")!.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ name: `Client Org ${stamp}`, slug: `client-${stamp}` }),
  });
  if (createOrg.status !== 200) throw new Error(`org create failed: ${await createOrg.text()}`);
  const orgId = ((await createOrg.json()) as { id: string }).id;

  await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;

  // Create a check-in config via admin route
  const cfgRes = await app.request("/api/check-in/configs", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Client Test Config",
      alias: `client-cfg-${stamp}`,
      resetMode: "none",
      timezone: "UTC",
    }),
  });
  if (cfgRes.status !== 201) throw new Error(`config create failed: ${await cfgRes.text()}`);

  const tenantId = await getDefaultTeamId(orgId);
  // Create a client credential directly via service (avoids testing CRUD routes here)
  const credSvc = createClientCredentialService({ db, appSecret: APP_SECRET });
  const cred = await credSvc.create(tenantId, { name: `client-test-${stamp}` });

  return {
    orgId,
    tenantId,
    cookie,
    adminUserId,
    publishableKey: cred.publishableKey,
    secret: cred.secret,
  };
}

describe("client check-in routes", () => {
  let fx: Fixture;
  let configAlias: string;

  beforeAll(async () => {
    fx = await setupFixture();
    // Fetch configs to find our alias
    const cfgListRes = await app.request("/api/check-in/configs", {
      headers: { cookie: fx.cookie },
    });
    const listEnv = (await cfgListRes.json()) as {
      data: { items: Array<{ alias: string }> };
    };
    configAlias = listEnv.data.items.find((c) =>
      c.alias.startsWith("client-cfg-"),
    )!.alias;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  // -------------------------------------------------------------------
  // Middleware: requireClientCredential
  // -------------------------------------------------------------------

  test("POST /api/client/check-in/check-ins without x-api-key → 401", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configKey: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("session cookie on client route → 401 (no cpk_ header)", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({ configKey: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("non-cpk_ key on client route → 401", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "ak_not_a_client_key",
      },
      body: JSON.stringify({ configKey: "x" }),
    });
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------
  // Middleware: requireClientUser
  // -------------------------------------------------------------------

  test("missing x-end-user-id header → 400", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fx.publishableKey,
      },
      body: JSON.stringify({ configKey: configAlias }),
    });
    expect(res.status).toBe(400);
  });

  test("valid cpk_ + correct HMAC header → check-in succeeds", async () => {
    const endUserId = "client-user-1";
    const hash = await computeHmac(endUserId, fx.secret);

    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fx.publishableKey,
        "x-end-user-id": endUserId,
        "x-user-hash": hash,
      },
      body: JSON.stringify({ configKey: configAlias }),
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: { alreadyCheckedIn: boolean; state: { totalDays: number } };
    };
    expect(env.code).toBe("ok");
    expect(env.data.alreadyCheckedIn).toBe(false);
    expect(env.data.state.totalDays).toBe(1);
  });

  test("valid cpk_ + wrong HMAC header → 401", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fx.publishableKey,
        "x-end-user-id": "user-wrong",
        "x-user-hash": "a".repeat(64),
      },
      body: JSON.stringify({ configKey: configAlias }),
    });
    expect(res.status).toBe(401);
  });

  test("valid cpk_ + missing HMAC header → 401", async () => {
    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fx.publishableKey,
        "x-end-user-id": "user-no-hash",
      },
      body: JSON.stringify({ configKey: configAlias }),
    });
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------
  // GET state
  // -------------------------------------------------------------------

  test("GET state with correct HMAC → 200", async () => {
    const endUserId = "client-user-1"; // already checked in above
    const hash = await computeHmac(endUserId, fx.secret);

    const res = await app.request(
      `/api/client/check-in/state?configKey=${configAlias}`,
      {
        headers: {
          "x-api-key": fx.publishableKey,
          "x-end-user-id": endUserId,
          "x-user-hash": hash,
        },
      },
    );
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: { state: { totalDays: number } };
    };
    expect(env.code).toBe("ok");
    expect(env.data.state.totalDays).toBe(1);
  });

  test("GET state without HMAC → 401", async () => {
    const res = await app.request(
      `/api/client/check-in/state?configKey=${configAlias}`,
      {
        headers: {
          "x-api-key": fx.publishableKey,
          "x-end-user-id": "some-user",
        },
      },
    );
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------
  // devMode bypass
  // -------------------------------------------------------------------

  test("devMode=true allows check-in without HMAC", async () => {
    const credSvc = createClientCredentialService({ db, appSecret: APP_SECRET });
    const creds = await credSvc.list(fx.tenantId);
    const cred = creds.find((c) => c.publishableKey === fx.publishableKey)!;
    await credSvc.updateDevMode(fx.tenantId, cred.id, true);

    const res = await app.request("/api/client/check-in/check-ins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": fx.publishableKey,
        "x-end-user-id": "dev-mode-user",
      },
      body: JSON.stringify({ configKey: configAlias }),
    });
    expect(res.status).toBe(200);

    await credSvc.updateDevMode(fx.tenantId, cred.id, false);
  });

  // -------------------------------------------------------------------
  // Cross-auth: client credential on admin route → 401
  // -------------------------------------------------------------------

  test("cpk_ on admin route /api/check-in/configs → 401", async () => {
    const res = await app.request("/api/check-in/configs", {
      headers: { "x-api-key": fx.publishableKey },
    });
    expect(res.status).toBe(401);
  });
});
