/**
 * Route-layer tests for invite admin router.
 *
 * Thin: only covers HTTP edges — requireAuth 401, Zod 400, one happy path.
 * Business logic is exhaustively tested at service layer.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization, user } from "../../schema";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
  email: string;
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `invite-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "Invite Routes Test",
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
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify({
      name: `Invite Org ${stamp}`,
      slug: `invite-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(
      `org create failed ${createOrg.status}: ${await createOrg.text()}`,
    );
  }
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  const setActive = await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
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

describe("invite admin routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("401 without cookie", async () => {
    const res = await app.request("/api/invite/settings");
    expect(res.status).toBe(401);
  });

  test("PUT /settings happy path", async () => {
    const res = await app.request("/api/invite/settings", {
      method: "PUT",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, codeLength: 8 }),
    });
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: { codeLength: number; enabled: boolean };
    };
    expect(env.data.codeLength).toBe(8);
    expect(env.data.enabled).toBe(true);
  });

  test("PUT /settings 400 on invalid codeLength", async () => {
    const res = await app.request("/api/invite/settings", {
      method: "PUT",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({ codeLength: 5 }),
    });
    expect(res.status).toBe(400);
  });
});
