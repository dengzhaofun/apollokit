/**
 * Route-layer tests — auth guards + happy path on the read-only audit
 * log endpoints. The deep filter / cursor logic lives in
 * `service.test.ts`; this file only checks HTTP edges.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { member, organization, user } from "../../schema";
import { auditLogs } from "../../schema/audit-log";
import { expectOk } from "../../testing/envelope";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
  email: string;
};

async function signUpAndOrg(label: string): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `audit-${label}-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: `Audit ${label} Test`,
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
      name: `Audit Org ${label} ${stamp}`,
      slug: `audit-${label}-${stamp}`,
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

describe("audit-log admin routes — owner happy path", () => {
  let fx: SignedInFixture;
  let seedId: string;

  beforeAll(async () => {
    fx = await signUpAndOrg("owner");

    // Seed one row so list/get have something to return.
    const [row] = await db
      .insert(auditLogs)
      .values({
        organizationId: fx.orgId,
        actorType: "user",
        actorId: fx.adminUserId,
        actorLabel: fx.email,
        resourceType: "module:cdkey",
        resourceId: "seed-1",
        resourceLabel: "seed batch",
        action: "create",
        method: "POST",
        path: "/api/cdkey/batches",
        status: 201,
      })
      .returning({ id: auditLogs.id });
    seedId = row!.id;
  });

  afterAll(async () => {
    // Cascade from organization deletes audit_logs / member rows.
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("401 without cookie on GET /", async () => {
    const res = await app.request("/api/audit-logs");
    expect(res.status).toBe(401);
  });

  test("GET / → 200 with seeded row", async () => {
    const res = await app.request("/api/audit-logs", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{
      items: Array<{ id: string; resourceType: string; action: string }>;
      nextCursor: string | null;
    }>(res);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    const seed = data.items.find((i) => i.id === seedId);
    expect(seed?.resourceType).toBe("module:cdkey");
    expect(seed?.action).toBe("create");
  });

  test("GET /resource-types → contains seeded resourceType", async () => {
    const res = await app.request("/api/audit-logs/resource-types", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{ items: string[] }>(res);
    expect(data.items).toContain("module:cdkey");
  });

  test("GET /:id → 200 for valid, 404 for unknown", async () => {
    const ok = await app.request(`/api/audit-logs/${seedId}`, {
      headers: { cookie: fx.cookie },
    });
    expect(ok.status).toBe(200);
    const data = await expectOk<{ id: string }>(ok);
    expect(data.id).toBe(seedId);

    const notFound = await app.request(
      "/api/audit-logs/00000000-0000-0000-0000-000000000000",
      { headers: { cookie: fx.cookie } },
    );
    expect(notFound.status).toBe(404);
  });

  test("GET /:id → 400 for non-uuid id", async () => {
    const res = await app.request("/api/audit-logs/not-a-uuid", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(400);
  });

  test("filter by actorType=user works end-to-end", async () => {
    const res = await app.request("/api/audit-logs?actorType=user", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{ items: Array<{ actorType: string }> }>(res);
    for (const item of data.items) expect(item.actorType).toBe("user");
  });

  test("validation: actorType outside enum → 400", async () => {
    const res = await app.request("/api/audit-logs?actorType=bogus", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(400);
  });
});

describe("audit-log admin routes — member 403", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg("member");
    // Demote this user to `member` role inside their own org so the
    // sensitive-read gate triggers. They created the org so default
    // role is `owner`; flip it directly.
    await db
      .update(member)
      .set({ role: "member" })
      .where(eq(member.userId, fx.adminUserId));
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET / → 403 for member role", async () => {
    const res = await app.request("/api/audit-logs", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(403);
  });

  test("GET /resource-types → 403 for member role", async () => {
    const res = await app.request("/api/audit-logs/resource-types", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(403);
  });
});
