/**
 * Route-layer smoke tests for the CMS admin routes.
 *
 * Goals:
 *   - `requireTenantSessionOrApiKey` 401 without a session cookie
 *   - Path prefix `/api/v1/cms` is mounted
 *   - Zod validation → 400 with `code: "validation_error"`
 *   - Module errors translated to typed envelope (alias conflict 409)
 *   - Happy path: create type → create entry → publish → fetch as admin
 *
 * Business correctness lives in service.test.ts. This file only confirms
 * the HTTP wiring.
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
  const email = `cms-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: "CMS Routes",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(`sign-up failed: ${await signUp.text()}`);
  }
  const cookie = signUp.headers.get("set-cookie")!.split(";")[0]!;

  const createOrg = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({
      name: `CMS Org ${stamp}`,
      slug: `cms-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(`org create failed: ${await createOrg.text()}`);
  }
  const orgId = ((await createOrg.json()) as { id: string }).id;

  await app.request("/api/auth/organization/set-active", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const userRows = await db.select().from(user).where(eq(user.email, email));
  return { cookie, orgId, adminUserId: userRows[0]!.id };
}

const baseSchema = {
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "body", label: "Body", type: "markdown" },
  ],
};

describe("cms admin routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/v1/cms/types without cookie → 401", async () => {
    const res = await app.request("/api/v1/cms/types");
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/cms/types: create type → 201", async () => {
    const res = await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "blog-post",
        name: "Blog Post",
        schema: baseSchema,
      }),
    });
    expect(res.status).toBe(201);
    const t = await expectOk<{ id: string; alias: string; schemaVersion: number }>(res);
    expect(t.alias).toBe("blog-post");
    expect(t.schemaVersion).toBe(1);
  });

  test("POST /api/v1/cms/types: zod validation rejects bad alias → 400", async () => {
    const res = await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "Bad Alias With Spaces",
        name: "x",
        schema: baseSchema,
      }),
    });
    expect(res.status).toBe(400);
    await expectFail(res, "validation_error");
  });

  test("POST /api/v1/cms/types: duplicate alias → 409", async () => {
    const r1 = await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "dup-route",
        name: "Dup",
        schema: baseSchema,
      }),
    });
    expect(r1.status).toBe(201);

    const r2 = await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "dup-route",
        name: "Dup 2",
        schema: baseSchema,
      }),
    });
    expect(r2.status).toBe(409);
    await expectFail(r2, "cms.type_alias_conflict");
  });

  test("GET /api/v1/cms/types/{key} works for both id and alias", async () => {
    const create = await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "key-test",
        name: "K",
        schema: baseSchema,
      }),
    });
    const t = await expectOk<{ id: string; alias: string }>(create);

    const byAlias = await app.request("/api/v1/cms/types/key-test", {
      headers: { cookie: fx.cookie },
    });
    expect(byAlias.status).toBe(200);
    expect((await expectOk<{ id: string }>(byAlias)).id).toBe(t.id);

    const byId = await app.request(`/api/v1/cms/types/${t.id}`, {
      headers: { cookie: fx.cookie },
    });
    expect(byId.status).toBe(200);
    expect((await expectOk<{ alias: string }>(byId)).alias).toBe("key-test");
  });

  test("entry create + publish + list filters", async () => {
    // Create type
    await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "faq",
        name: "FAQ",
        schema: baseSchema,
      }),
    });

    // Bad data → CmsInvalidData (400)
    const bad = await app.request("/api/v1/cms/types/faq/entries", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "missing-title",
        data: { body: "no title here" },
      }),
    });
    expect(bad.status).toBe(400);
    await expectFail(bad, "cms.invalid_data");

    // Good entry → 201, draft
    const create = await app.request("/api/v1/cms/types/faq/entries", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "first",
        groupKey: "general",
        tags: ["welcome"],
        data: { title: "Hello", body: "World" },
      }),
    });
    expect(create.status).toBe(201);
    const e = await expectOk<{
      id: string;
      version: number;
      status: string;
    }>(create);
    expect(e.status).toBe("draft");

    // Publish
    const pub = await app.request(
      "/api/v1/cms/types/faq/entries/first/publish",
      {
        method: "POST",
        headers: { cookie: fx.cookie },
      },
    );
    expect(pub.status).toBe(200);
    const published = await expectOk<{ status: string; publishedAt: string | null }>(pub);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    // List with status filter
    const list = await app.request(
      "/api/v1/cms/types/faq/entries?status=published",
      { headers: { cookie: fx.cookie } },
    );
    expect(list.status).toBe(200);
    const lr = await expectOk<{
      items: Array<{ alias: string; status: string }>;
      nextCursor: string | null;
    }>(list);
    expect(lr.items.find((x) => x.alias === "first")).toBeDefined();
  });

  test("PATCH entry with stale version → 409", async () => {
    await app.request("/api/v1/cms/types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "ver-route",
        name: "V",
        schema: baseSchema,
      }),
    });
    await app.request("/api/v1/cms/types/ver-route/entries", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        alias: "x",
        data: { title: "v1" },
      }),
    });
    const stale = await app.request(
      "/api/v1/cms/types/ver-route/entries/x",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: fx.cookie },
        body: JSON.stringify({
          version: 999,
          data: { title: "v2" },
        }),
      },
    );
    expect(stale.status).toBe(409);
    await expectFail(stale, "cms.entry_version_conflict");
  });
});
