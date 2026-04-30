/**
 * Route-layer tests for the webhooks module. Exercises only HTTP edges:
 * auth, Zod validation → 400, ModuleError → status mapping, happy path.
 * Business logic is covered in `service.test.ts`.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization, user } from "../../schema";
import { expectFail, expectOk } from "../../testing/envelope";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
  email: string;
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `webhooks-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: "Webhooks Test",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(`sign-up failed ${signUp.status}: ${await signUp.text()}`);
  }
  const setCookie = signUp.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a cookie");
  const cookie = setCookie.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({
      name: `Webhooks Org ${stamp}`,
      slug: `webhooks-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(`org create failed ${createOrg.status}: ${await createOrg.text()}`);
  }
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  const setActive = await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  });
  if (setActive.status !== 200) {
    throw new Error(
      `set-active failed ${setActive.status}: ${await setActive.text()}`,
    );
  }

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;
  return { cookie, orgId, adminUserId, email };
}

describe("webhooks routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/webhooks/endpoints without cookie → 401", async () => {
    const res = await app.request("/api/webhooks/endpoints");
    expect(res.status).toBe(401);
  });

  test("POST create → 201; secret present once; then GET hides secret", async () => {
    const create = await app.request("/api/webhooks/endpoints", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        name: "Happy",
        url: "https://example.test/hook",
      }),
    });
    expect(create.status).toBe(201);
    const created = await expectOk<{
      id: string;
      secret: string;
      secretHint: string;
    }>(create);
    expect(created.secret).toMatch(/^whsec_/);

    const get = await app.request(
      `/api/webhooks/endpoints/${created.id}`,
      { headers: { cookie: fx.cookie } },
    );
    expect(get.status).toBe(200);
    const fetched = await expectOk<Record<string, unknown>>(get);
    expect(fetched.secret).toBeUndefined();
    expect(fetched.secretHint).toBe(created.secretHint);
  });

  test("POST create with non-https URL → 400 validation", async () => {
    const res = await app.request("/api/webhooks/endpoints", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        name: "Bad",
        url: "ftp://example.test/hook",
      }),
    });
    expect(res.status).toBe(400);
    await expectFail(res, "validation_error");
  });

  test("GET unknown id → 404 with typed error code", async () => {
    const res = await app.request(
      "/api/webhooks/endpoints/00000000-0000-4000-8000-000000000000",
      { headers: { cookie: fx.cookie } },
    );
    expect(res.status).toBe(404);
    await expectFail(res, "webhooks.endpoint_not_found");
  });
});
