/**
 * End-user Better Auth integration test.
 *
 * These tests drive the full auth pipeline — `hooks.before` email
 * namespacing, `databaseHooks.user.create.before` org injection,
 * `session.create.before` disabled-check — to make sure the behaviors
 * that span the Better Auth instance + our hooks actually hold.
 *
 * We go through the Hono app (`app.request`) rather than calling
 * `endUserAuth.api.*` directly, so the `x-api-key → x-apollo-eu-org-id`
 * bridge in `src/index.ts` is also exercised.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "./db";
import { scopeEmail } from "./end-user-auth";
import app from "./index";
import { clientCredentials } from "./schema/client-credential";
import { euAccount, euSession, euUser } from "./schema/end-user-auth";
import { organization } from "./schema/auth";
import { createTestOrg, deleteTestOrg } from "./testing/fixtures";

type Tenant = { orgId: string; cpk: string };

/**
 * Seed a client credential in dev mode (HMAC bypassed) so the test can
 * drive /api/client/auth/* with only `x-api-key: cpk_...`.
 */
async function createTenant(label: string): Promise<Tenant> {
  const orgId = await createTestOrg(label);
  const cpk = `cpk_iauth_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(clientCredentials).values({
    id: crypto.randomUUID(),
    tenantId: orgId,
    name: label,
    publishableKey: cpk,
    encryptedSecret: "dev-placeholder",
    devMode: true,
    enabled: true,
  });
  return { orgId, cpk };
}

async function dropTenant({ orgId }: Tenant) {
  await db.delete(organization).where(eq(organization.id, orgId));
}

type SignUpResponse = {
  user: { id: string; email: string; name: string };
  token?: string;
};

async function signUp(
  t: Tenant,
  email: string,
  password: string,
  name: string,
): Promise<Response> {
  return app.request("/api/client/auth/sign-up/email", {
    method: "POST",
    headers: {
      "x-api-key": t.cpk,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, name }),
  });
}

async function signIn(
  t: Tenant,
  email: string,
  password: string,
): Promise<Response> {
  return app.request("/api/client/auth/sign-in/email", {
    method: "POST",
    headers: {
      "x-api-key": t.cpk,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
}

describe("end-user-auth — email namespacing + org injection", () => {
  let a: Tenant;

  beforeAll(async () => {
    a = await createTenant("eu-auth-ns");
  });

  afterAll(async () => {
    await dropTenant(a);
  });

  test("sign-up stores scoped email and injects tenantId", async () => {
    const res = await signUp(a, "alice@example.com", "pw12345678", "Alice");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SignUpResponse;
    expect(body.user.id).toBeTruthy();

    const [row] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, body.user.id));
    expect(row).toBeTruthy();
    expect(row!.email).toBe(scopeEmail(a.orgId, "alice@example.com"));
    expect(row!.tenantId).toBe(a.orgId);

    // Credential account is created with a non-null password hash
    const [acc] = await db
      .select()
      .from(euAccount)
      .where(
        and(
          eq(euAccount.userId, body.user.id),
          eq(euAccount.providerId, "credential"),
        ),
      );
    expect(acc).toBeTruthy();
    expect(acc!.password).toBeTruthy();
  });

  test("sign-up without x-api-key → 401", async () => {
    const res = await app.request("/api/client/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "x@x.com",
        password: "pw12345678",
        name: "X",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("second sign-up in same org with same email → conflict (422)", async () => {
    const res = await signUp(a, "alice@example.com", "pw12345678", "Alice");
    expect(res.status).toBe(422);
  });

  test("sign-in with scoped email finds the user and mints a session row with org id", async () => {
    const res = await signIn(a, "alice@example.com", "pw12345678");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SignUpResponse;
    expect(body.user.id).toBeTruthy();
    expect(body.token).toBeTruthy();

    const [sess] = await db
      .select()
      .from(euSession)
      .where(eq(euSession.userId, body.user.id));
    expect(sess!.tenantId).toBe(a.orgId);
  });
});

describe("end-user-auth — tenant isolation", () => {
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    a = await createTenant("eu-auth-iso-a");
    b = await createTenant("eu-auth-iso-b");
  });

  afterAll(async () => {
    await dropTenant(a);
    await dropTenant(b);
  });

  test("same email sign-up in two different orgs both succeed (per-org email uniqueness)", async () => {
    const ra = await signUp(a, "shared@example.com", "pw12345678", "A-Shared");
    expect(ra.status).toBe(200);
    const rb = await signUp(b, "shared@example.com", "pw12345678", "B-Shared");
    expect(rb.status).toBe(200);

    const ua = (await ra.json()) as SignUpResponse;
    const ub = (await rb.json()) as SignUpResponse;
    expect(ua.user.id).not.toBe(ub.user.id);

    // Each row lives under its own org id
    const [rowA] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, ua.user.id));
    const [rowB] = await db
      .select()
      .from(euUser)
      .where(eq(euUser.id, ub.user.id));
    expect(rowA!.tenantId).toBe(a.orgId);
    expect(rowB!.tenantId).toBe(b.orgId);
  });

  test("sign-in with orgA's cpk can't resolve orgB's user — wrong tenant email lookup", async () => {
    // First establish a user in orgB
    await signUp(b, "only-in-b@example.com", "pw12345678", "B Only");
    // Try to sign them in via orgA's cpk — email is scoped to A, so lookup misses
    const res = await signIn(a, "only-in-b@example.com", "pw12345678");
    // Better Auth returns 401 INVALID_EMAIL_OR_PASSWORD for missing users
    expect(res.status).toBe(401);
  });
});

describe("end-user-auth — cross-tenant session guard on business routes", () => {
  let a: Tenant;
  let b: Tenant;
  let cookieA: string;

  beforeAll(async () => {
    a = await createTenant("eu-auth-xsess-a");
    b = await createTenant("eu-auth-xsess-b");

    await signUp(a, "carol@example.com", "pw12345678", "Carol");
    const signInRes = await signIn(a, "carol@example.com", "pw12345678");
    const setCookie = signInRes.headers.get("set-cookie");
    if (!setCookie) throw new Error("no set-cookie on sign-in");
    cookieA = setCookie.split(",").map((s) => s.split(";")[0]).join("; ");
  });

  afterAll(async () => {
    await dropTenant(a);
    await dropTenant(b);
  });

  test("orgA session + orgA cpk on /api/client/rank/* reaches the router (requireClientUser passes)", async () => {
    const res = await app.request("/api/client/rank/seasons", {
      headers: { "x-api-key": a.cpk, cookie: cookieA },
    });
    // 200 if the route has a handler, 404 if no such path but middleware
    // let it through. Either way, it's NOT 401/403 — that's what we care
    // about.
    expect([200, 404]).toContain(res.status);
  });

  test("orgA session + orgB cpk → 403 session_tenant_mismatch", async () => {
    const res = await app.request("/api/client/rank/seasons", {
      headers: { "x-api-key": b.cpk, cookie: cookieA },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("session_tenant_mismatch");
  });
});

describe("end-user-auth — disabled sign-in and mid-session block", () => {
  let t: Tenant;

  beforeAll(async () => {
    t = await createTenant("eu-auth-disabled");
  });

  afterAll(async () => {
    await dropTenant(t);
  });

  test("disabled user cannot sign in (session.create.before rejects)", async () => {
    const up = await signUp(t, "banned@example.com", "pw12345678", "Banned");
    expect(up.status).toBe(200);
    const body = (await up.json()) as SignUpResponse;

    // Flip the disabled flag directly in DB (admin operation is tested
    // separately; this test is about what happens to sign-in afterward).
    await db
      .update(euUser)
      .set({ disabled: true })
      .where(eq(euUser.id, body.user.id));

    const inRes = await signIn(t, "banned@example.com", "pw12345678");
    // Session creation refused → non-200 (Better Auth maps APIError to 403).
    expect(inRes.status).toBeGreaterThanOrEqual(400);
  });
});
