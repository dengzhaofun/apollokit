/**
 * Route-layer tests for the collection module.
 *
 * These drive the real Hono app through `app.request()` in-process, to
 * catch HTTP-surface regressions the service tests can't see:
 *   - requireAdminOrApiKey 401 when no cookie
 *   - Zod validation mapping to 400
 *   - ModuleError subclasses mapped to typed JSON responses via onError
 *   - Path prefixes actually connected
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
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `col-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: "Collection Routes Test",
    }),
  });
  if (signUp.status !== 200) throw new Error(await signUp.text());
  const cookie = signUp.headers.get("set-cookie")!.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({
      name: `Col Org ${stamp}`,
      slug: `col-${stamp}`,
    }),
  });
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const userRows = await db.select().from(user).where(eq(user.email, email));
  return { cookie, orgId, adminUserId: userRows[0]!.id };
}

describe("collection routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/v1/collection/albums without cookie → 401", async () => {
    const res = await app.request("/api/v1/collection/albums");
    expect(res.status).toBe(401);
  });

  test("happy path: create album → create group → create entry", async () => {
    // 1. Create album
    const a = await app.request("/api/v1/collection/albums", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        name: "Route Dragon Codex",
        alias: "route-dragons",
        scope: "hero",
      }),
    });
    expect(a.status).toBe(201);
    const album = await expectOk<{ id: string; alias: string }>(a);
    expect(album.alias).toBe("route-dragons");

    // 2. Create group under album
    const g = await app.request(
      "/api/v1/collection/albums/route-dragons/groups",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: fx.cookie },
        body: JSON.stringify({ name: "Elemental" }),
      },
    );
    expect(g.status).toBe(201);
    const group = await expectOk<{ id: string }>(g);

    // 3. We need an item definition to bind to.
    const defRes = await app.request("/api/v1/item/definitions", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        name: "Route Fire Dragon",
        alias: "route-def-fire",
        stackable: true,
      }),
    });
    expect(defRes.status).toBe(201);
    const def = await expectOk<{ id: string }>(defRes);

    // 4. Create entry
    const e = await app.request(
      "/api/v1/collection/albums/route-dragons/entries",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: fx.cookie },
        body: JSON.stringify({
          name: "Fire Dragon",
          groupId: group.id,
          triggerItemDefinitionId: def.id,
        }),
      },
    );
    expect(e.status).toBe(201);
  });

  test("zod validation: milestone with entry scope missing entryId → 400", async () => {
    const res = await app.request(
      "/api/v1/collection/albums/route-dragons/milestones",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: fx.cookie },
        body: JSON.stringify({
          scope: "entry",
          rewardItems: [
            { definitionId: "00000000-0000-0000-0000-000000000000", quantity: 1 },
          ],
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("ModuleError mapping: duplicate alias → 409", async () => {
    const res = await app.request("/api/v1/collection/albums", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        name: "Dup",
        alias: "route-dragons",
      }),
    });
    expect(res.status).toBe(409);
    await expectFail(res, "collection.alias_conflict");
  });

  test("unknown album alias → 404", async () => {
    const res = await app.request("/api/v1/collection/albums/does-not-exist", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(404);
    await expectFail(res, "collection.album_not_found");
  });
});
