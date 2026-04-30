/**
 * Route-layer tests for the coarse role gate.
 *
 * Verifies that within a single organization:
 *   - A `member` role is blocked from every mutating verb on a
 *     business route (we use `/api/check-in/configs` POST as the probe).
 *   - A `member` role can still issue GET (read-only is allowed).
 *   - An `owner` role passes through to the real handler.
 *
 * Why these assertions run against the real Better Auth + Drizzle +
 * Neon stack rather than a mocked middleware unit test: the
 * production wiring that matters here is "requireAuth → requireOrgManage
 * composed in the right order on every business router", which can only
 * regress in route-level tests. Mocked unit tests would miss the day
 * someone forgets to mount the gate on a new module.
 *
 * Owner membership is created implicitly by `POST /organization/create`
 * (the `creatorRole: "owner"` config in `src/auth.ts`). The
 * member-role fixture is inserted directly into the `member` table to
 * avoid spinning up the full invite-accept dance — a shortcut that
 * matches how other fixture helpers in `src/testing/fixtures.ts` work.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../db";
import app from "../index";
import { member, organization, user } from "../schema";

const ORIGIN = "http://localhost:8787";

type Signup = {
  email: string;
  cookie: string;
  userId: string;
};

async function signUp(label: string): Promise<Signup> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${label}-${stamp}@example.test`;
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: label,
    }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed ${res.status}: ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a cookie");
  const cookie = setCookie.split(";")[0]!;
  const rows = await db.select().from(user).where(eq(user.email, email));
  return { email, cookie, userId: rows[0]!.id };
}

describe("requireOrgManage — coarse role gate", () => {
  let ownerCookie: string;
  let ownerUserId: string;
  let memberCookie: string;
  let memberUserId: string;
  let orgId: string;

  beforeAll(async () => {
    // Owner side: sign-up + create org (auto-enrolls owner as `owner`).
    const owner = await signUp("roleowner");
    ownerCookie = owner.cookie;
    ownerUserId = owner.userId;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createOrg = await app.request("/api/auth/organization/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        name: `Role Gate Org ${stamp}`,
        slug: `role-gate-${stamp}`,
      }),
    });
    if (createOrg.status !== 200) {
      throw new Error(
        `org create failed ${createOrg.status}: ${await createOrg.text()}`,
      );
    }
    orgId = ((await createOrg.json()) as { id: string }).id;

    // Member side: sign-up, then insert a member row directly rather
    // than going through invite/accept — we want to pin `role="member"`
    // and avoid depending on the email delivery path (covered by
    // mailer.test.ts).
    const mem = await signUp("rolemember");
    memberCookie = mem.cookie;
    memberUserId = mem.userId;
    await db.insert(member).values({
      id: `test-member-${crypto.randomUUID()}`,
      organizationId: orgId,
      userId: memberUserId,
      role: "member",
      createdAt: new Date(),
    });

    // Switch the member's session over to this org so
    // `session.activeOrganizationId` is populated (the auth.ts session
    // hook only runs at sign-in time, and at sign-in there was no
    // membership yet).
    const setActive = await app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: memberCookie,
        },
        body: JSON.stringify({ organizationId: orgId }),
      },
    );
    if (setActive.status !== 200) {
      throw new Error(
        `set-active failed ${setActive.status}: ${await setActive.text()}`,
      );
    }
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, orgId));
    await db.delete(user).where(eq(user.id, ownerUserId));
    await db.delete(user).where(eq(user.id, memberUserId));
  });

  test("member role: GET /api/check-in/configs → 200 (read allowed)", async () => {
    const res = await app.request("/api/check-in/configs", {
      headers: { cookie: memberCookie },
    });
    expect(res.status).toBe(200);
  });

  test("member role: POST /api/check-in/configs → 403 forbidden", async () => {
    const res = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: memberCookie,
      },
      body: JSON.stringify({
        name: "Blocked by role gate",
        alias: "role-gate-blocked",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("forbidden");
  });

  test("owner role: POST /api/check-in/configs → 201 (write allowed)", async () => {
    const res = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: ownerCookie,
      },
      body: JSON.stringify({
        name: "Allowed by role gate",
        alias: "role-gate-allowed",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    expect(res.status).toBe(201);
  });
});
