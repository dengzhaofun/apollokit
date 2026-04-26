/**
 * Route-layer tests for end-user admin router.
 *
 * Thin: HTTP edges only — auth guards, Zod validation, ModuleError →
 * status mapping, one happy path per method. Deep merge semantics and
 * CRUD behavior live in `service.test.ts`.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { endUserService } from "./index";
import { organization, user } from "../../schema";
import { expectOk } from "../../testing/envelope";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
  email: string;
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `end-user-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "End-User Routes Test",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(
      `sign-up returned ${signUp.status}: ${await signUp.text()}`,
    );
  }
  const setCookie = signUp.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not set cookie");
  const cookie = setCookie.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({
      name: `End-User Org ${stamp}`,
      slug: `end-user-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(
      `org create failed ${createOrg.status}: ${await createOrg.text()}`,
    );
  }
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;

  return { cookie, orgId, adminUserId, email };
}

describe("end-user admin routes", () => {
  let fx: SignedInFixture;
  let seededUserId: string;

  beforeAll(async () => {
    fx = await signUpAndOrg();
    // Seed an end-user via the service so we have something to CRUD
    const r = await endUserService.syncUser(fx.orgId, {
      externalId: "u_route_seed",
      email: "seed@example.com",
      name: "Seed Player",
    });
    seededUserId = r.euUserId;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("401 without cookie on GET /", async () => {
    const res = await app.request("/api/end-user");
    expect(res.status).toBe(401);
  });

  test("401 without cookie on POST /sync", async () => {
    const res = await app.request("/api/end-user/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@x.com", name: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /sync → 201 on create", async () => {
    const res = await app.request("/api/end-user/sync", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        externalId: "u_route_new",
        email: "route-new@example.com",
        name: "Route New",
      }),
    });
    expect(res.status).toBe(201);
    const data = await expectOk<{ euUserId: string; created: boolean }>(res);
    expect(data.created).toBe(true);
    expect(data.euUserId).toBeTruthy();
  });

  test("POST /sync → 200 on merge", async () => {
    const res = await app.request("/api/end-user/sync", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        externalId: "u_route_seed",
        email: "seed@example.com",
        name: "Seed Player Renamed",
      }),
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{ euUserId: string; created: boolean }>(res);
    expect(data.created).toBe(false);
  });

  test("POST /sync → 400 on invalid body", async () => {
    const res = await app.request("/api/end-user/sync", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", name: "x" }),
    });
    expect(res.status).toBe(400);
  });

  test("GET / → happy path with unscoped email", async () => {
    const res = await app.request("/api/end-user?limit=50", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{
      items: Array<{ email: string; origin: string }>;
      nextCursor: string | null;
    }>(res);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    // All emails should be raw (no {orgId}__ prefix)
    expect(data.items.every((i) => !i.email.includes("__"))).toBe(true);
  });

  test("GET /:id → 200 for valid, 404 for unknown", async () => {
    const ok = await app.request(`/api/end-user/${seededUserId}`, {
      headers: { cookie: fx.cookie },
    });
    expect(ok.status).toBe(200);

    const notFound = await app.request("/api/end-user/does-not-exist", {
      headers: { cookie: fx.cookie },
    });
    expect(notFound.status).toBe(404);
  });

  test("PATCH /:id updates name", async () => {
    const res = await app.request(`/api/end-user/${seededUserId}`, {
      method: "PATCH",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Patched Name" }),
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{ name: string }>(res);
    expect(data.name).toBe("Patched Name");
  });

  test("PATCH /:id → 400 on empty body", async () => {
    const res = await app.request(`/api/end-user/${seededUserId}`, {
      method: "PATCH",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("POST /:id/disable → disabled:true, /enable → disabled:false", async () => {
    const dis = await app.request(
      `/api/end-user/${seededUserId}/disable`,
      { method: "POST", headers: { cookie: fx.cookie } },
    );
    expect(dis.status).toBe(200);
    const disData = await expectOk<{ disabled: boolean }>(dis);
    expect(disData.disabled).toBe(true);

    const en = await app.request(`/api/end-user/${seededUserId}/enable`, {
      method: "POST",
      headers: { cookie: fx.cookie },
    });
    expect(en.status).toBe(200);
    const enData = await expectOk<{ disabled: boolean }>(en);
    expect(enData.disabled).toBe(false);
  });

  test("POST /:id/sign-out-all → 200", async () => {
    const res = await app.request(
      `/api/end-user/${seededUserId}/sign-out-all`,
      { method: "POST", headers: { cookie: fx.cookie } },
    );
    expect(res.status).toBe(200);
    const data = await expectOk<{ revoked: number }>(res);
    expect(typeof data.revoked).toBe("number");
  });

  test("DELETE /:id → 200 with null data, subsequent GET → 404", async () => {
    const created = await endUserService.syncUser(fx.orgId, {
      externalId: "u_delete_me",
      email: "delete-me@example.com",
      name: "Delete Me",
    });
    const del = await app.request(`/api/end-user/${created.euUserId}`, {
      method: "DELETE",
      headers: { cookie: fx.cookie },
    });
    expect(del.status).toBe(200);
    const delData = await expectOk<null>(del);
    expect(delData).toBeNull();

    const check = await app.request(`/api/end-user/${created.euUserId}`, {
      headers: { cookie: fx.cookie },
    });
    expect(check.status).toBe(404);
  });
});
