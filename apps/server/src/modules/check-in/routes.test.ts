/**
 * Route-layer tests for check-in.
 *
 * These exist to catch HTTP-surface regressions that service-layer tests
 * can't see: `requireAuth` 401, path prefix (`/api/check-in`), zod input
 * validation, and the router-level `onError` mapping of `ModuleError`
 * subclasses onto status codes.
 *
 * Auth flow: we drive sign-up and organization-create through the same
 * `app.request()` machinery the service tests bypass, so we exercise the
 * real Better Auth cookie dance in-process — no curl, no wrangler, no
 * live HTTP. This is the "routes pipe is connected" test, not a
 * business-logic test.
 *
 * Cleanup strategy: the `afterAll` hook deletes the test organization
 * (cascades member / invitation / check_in_configs / check_in_user_states)
 * and then the test user (cascades session / account). Better Auth's
 * `/api/auth/organization/create` call may re-insert a member row after
 * our delete if any tests run against the org post-cleanup, so test
 * order matters: sign-up → org-create → all business tests → afterAll.
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

/**
 * Sign up a fresh user, create an organization, and set it active —
 * returning the session cookie so subsequent requests can present it.
 * Every call uses a unique email/slug to avoid cross-run collisions on
 * the shared dev database.
 */
async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "Routes Test",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(
      `sign-up failed ${signUp.status}: ${await signUp.text()}`,
    );
  }

  // Better Auth returns the session cookie in `set-cookie`; we only need
  // the `name=value` pair (everything before the first `;`).
  const setCookie = signUp.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a cookie");
  const cookie = setCookie.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify({
      name: `Routes Org ${stamp}`,
      slug: `routes-${stamp}`,
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

describe("check-in routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    // Org delete cascades: member, invitation, check_in_configs,
    // check_in_user_states.
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    // User delete cascades: session, account.
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/check-in/configs without cookie → 401", async () => {
    const res = await app.request("/api/check-in/configs");
    expect(res.status).toBe(401);
  });

  test("happy path: create config, check-in, fetch state", async () => {
    const create = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Route Happy",
        alias: "route-happy",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    expect(create.status).toBe(201);
    const cfgEnv = (await create.json()) as {
      code: string;
      data: { id: string; alias: string };
    };
    expect(cfgEnv.code).toBe("ok");
    expect(cfgEnv.data.alias).toBe("route-happy");

    const checkIn = await app.request(
      "/api/check-in/configs/route-happy/check-ins",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: fx.cookie,
        },
        body: JSON.stringify({ endUserId: "biz-user-route" }),
      },
    );
    expect(checkIn.status).toBe(200);
    const env = (await checkIn.json()) as {
      code: string;
      data: {
        alreadyCheckedIn: boolean;
        state: { totalDays: number; currentStreak: number };
      };
    };
    expect(env.code).toBe("ok");
    expect(env.data.alreadyCheckedIn).toBe(false);
    expect(env.data.state.totalDays).toBe(1);
    expect(env.data.state.currentStreak).toBe(1);

    const state = await app.request(
      "/api/check-in/configs/route-happy/users/biz-user-route/state",
      { headers: { cookie: fx.cookie } },
    );
    expect(state.status).toBe(200);
  });

  test("zod validation: week target > 7 → 400", async () => {
    const res = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Bad Week",
        resetMode: "week",
        target: 8,
        timezone: "Asia/Shanghai",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("ModuleError mapping: duplicate alias → 409", async () => {
    await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Dup1",
        alias: "route-dup",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    const res = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Dup2",
        alias: "route-dup",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("check_in.alias_conflict");
  });

  test("unknown alias → 404 from service layer via onError", async () => {
    const res = await app.request(
      "/api/check-in/configs/does-not-exist/check-ins",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: fx.cookie,
        },
        body: JSON.stringify({ endUserId: "u" }),
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("check_in.config_not_found");
  });
});
