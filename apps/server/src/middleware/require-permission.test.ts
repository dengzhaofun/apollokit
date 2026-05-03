/**
 * Route-layer tests for the permission gate.
 *
 * Verifies the four-role matrix end-to-end against a real Better Auth
 * + Drizzle stack:
 *
 *   owner    → can read & write business modules; can read audit-log
 *   admin    → can read & write business modules; can read audit-log
 *   operator → can read & write business modules; CANNOT read audit-log
 *   viewer   → CAN read business modules; CANNOT write; CANNOT read audit-log
 *   member   → alias for operator (backward-compat for old rows)
 *
 * Implementation note — Better Auth's `/sign-up/email` rate limit is
 * 3 / 60s (see `auth.ts` customRules). We only sign up TWO users:
 * an owner (created via `/organization/create`, which auto-enrolls
 * them as `owner`) and a single "subject" user whose `member.role`
 * we mutate per role under test. This keeps us under the limit and
 * also exercises the live `roleHasPermission` path on the real
 * `member` row instead of bypassing through fixtures.
 */
import { and, eq } from "drizzle-orm";
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

describe("requirePermission — four-role matrix", () => {
  let ownerCookie: string;
  let ownerUserId: string;
  let subjectCookie: string;
  let subjectUserId: string;
  let subjectMemberRowId: string;
  let orgId: string;

  beforeAll(async () => {
    const owner = await signUp("ac-owner");
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
        name: `AC Matrix Org ${stamp}`,
        slug: `ac-matrix-${stamp}`,
      }),
    });
    if (createOrg.status !== 200) {
      throw new Error(
        `org create failed ${createOrg.status}: ${await createOrg.text()}`,
      );
    }
    orgId = ((await createOrg.json()) as { id: string }).id;

    // Subject user — single sign-up, role mutated per test.
    const subject = await signUp("ac-subject");
    subjectCookie = subject.cookie;
    subjectUserId = subject.userId;

    subjectMemberRowId = `test-member-${crypto.randomUUID()}`;
    await db.insert(member).values({
      id: subjectMemberRowId,
      organizationId: orgId,
      userId: subjectUserId,
      role: "viewer", // initial; setSubjectRole flips it per test
      createdAt: new Date(),
    });
    const setActive = await app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: subjectCookie,
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
    for (const id of [ownerUserId, subjectUserId]) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  async function setSubjectRole(role: string) {
    await db
      .update(member)
      .set({ role })
      .where(
        and(
          eq(member.userId, subjectUserId),
          eq(member.organizationId, orgId),
        ),
      );
  }

  // --- read business module: every role passes ---

  for (const role of ["admin", "operator", "viewer", "member"] as const) {
    test(`${role}: GET /api/check-in/configs → 200 (read allowed)`, async () => {
      await setSubjectRole(role);
      const res = await app.request("/api/check-in/configs", {
        headers: { cookie: subjectCookie },
      });
      expect(res.status).toBe(200);
    });
  }

  test("owner: GET /api/check-in/configs → 200 (read allowed)", async () => {
    const res = await app.request("/api/check-in/configs", {
      headers: { cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
  });

  // --- write business module: viewer denied, others allowed ---

  for (const role of ["admin", "operator", "member"] as const) {
    test(`${role}: POST /api/check-in/configs → 201 (write allowed)`, async () => {
      await setSubjectRole(role);
      const stamp = Math.random().toString(36).slice(2, 8);
      const res = await app.request("/api/check-in/configs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: subjectCookie,
        },
        body: JSON.stringify({
          name: `AC ${role} ${stamp}`,
          alias: `ac-${role}-${stamp}`,
          resetMode: "none",
          timezone: "Asia/Shanghai",
        }),
      });
      expect(res.status).toBe(201);
    });
  }

  test("viewer: POST /api/check-in/configs → 403 (write denied)", async () => {
    await setSubjectRole("viewer");
    const res = await app.request("/api/check-in/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: subjectCookie,
      },
      body: JSON.stringify({
        name: "blocked",
        alias: "ac-viewer-blocked",
        resetMode: "none",
        timezone: "Asia/Shanghai",
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("forbidden");
  });

  // --- audit-log: only owner/admin can read ---

  test("owner: GET /api/audit-logs → 200", async () => {
    const res = await app.request("/api/audit-logs", {
      headers: { cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
  });

  test("admin: GET /api/audit-logs → 200", async () => {
    await setSubjectRole("admin");
    const res = await app.request("/api/audit-logs", {
      headers: { cookie: subjectCookie },
    });
    expect(res.status).toBe(200);
  });

  for (const role of ["operator", "viewer", "member"] as const) {
    test(`${role}: GET /api/audit-logs → 403`, async () => {
      await setSubjectRole(role);
      const res = await app.request("/api/audit-logs", {
        headers: { cookie: subjectCookie },
      });
      expect(res.status).toBe(403);
    });
  }

  // --- /me/capabilities: shape sanity check per role ---

  test("operator: GET /api/me/capabilities → bag has checkIn read+write but no auditLog", async () => {
    await setSubjectRole("operator");
    const res = await app.request("/api/me/capabilities", {
      headers: { cookie: subjectCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; capabilities: Record<string, string[]> };
    };
    expect(body.data.role).toBe("operator");
    expect(body.data.capabilities.checkIn).toEqual(
      expect.arrayContaining(["read", "write"]),
    );
    expect(body.data.capabilities.auditLog).toBeUndefined();
  });

  test("viewer: GET /api/me/capabilities → bag has read only, no auditLog", async () => {
    await setSubjectRole("viewer");
    const res = await app.request("/api/me/capabilities", {
      headers: { cookie: subjectCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; capabilities: Record<string, string[]> };
    };
    expect(body.data.role).toBe("viewer");
    expect(body.data.capabilities.checkIn).toEqual(["read"]);
    expect(body.data.capabilities.checkIn).not.toContain("write");
    expect(body.data.capabilities.auditLog).toBeUndefined();
  });
});
