/**
 * Route-layer tests for the admin agent.
 *
 * Covers what `service.test.ts` can't:
 *   - `requireAuth` returns 401 when no session cookie is present
 *   - body validation (invalid JSON / missing surface / unknown surface)
 *
 * The streaming-success path (200 + `text/event-stream`) is exercised
 * by `service.test.ts` via `toUIMessageStreamResponse()` — we don't run
 * it here because doing so via `app.request()` would invoke the real
 * `adminAgentService` singleton (which is wired to the real OpenRouter
 * provider), and there's no clean way to swap that without a global
 * `vi.mock` of the module barrel. Validation tests below are sufficient
 * to confirm the route is mounted and gating works.
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
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `agent-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: "Agent Routes Test",
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
      name: `Agent Routes Org ${stamp}`,
      slug: `agent-routes-${stamp}`,
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
  return { cookie, orgId, adminUserId };
}

describe("admin-agent routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("POST /api/v1/ai/admin/chat without cookie → 401", async () => {
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [],
        context: { surface: "check-in:create" },
      }),
    });
    expect(res.status).toBe(401);
  });

  test("invalid JSON body → 400", async () => {
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: "not-json{",
    });
    expect(res.status).toBe(400);
  });

  test("missing context.surface → 400", async () => {
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({ messages: [], context: {} }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_surface");
  });

  test("unknown surface → 400 (whitelist enforced)", async () => {
    // Use a clearly-fake module name + invalid intent — unrelated to
    // any real ADMIN_MODULES entry so it can't drift back to passing.
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        messages: [],
        context: { surface: "fake-module-xyz:create" },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_surface");
  });

  test("invalid intent → 400", async () => {
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        messages: [],
        context: { surface: "check-in:nope" },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_surface");
  });

  test("messages must be an array → 400", async () => {
    const res = await app.request("/api/v1/ai/admin/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: fx.cookie },
      body: JSON.stringify({
        messages: "nope",
        context: { surface: "check-in:create" },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_messages");
  });

  test("GET /api/v1/ai/admin/mentions/types without cookie → 401", async () => {
    const res = await app.request("/api/v1/ai/admin/mentions/types", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/v1/ai/admin/mentions/types with cookie → registered types", async () => {
    const res = await app.request("/api/v1/ai/admin/mentions/types", {
      method: "GET",
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      types: { type: string; label: string; writable: boolean }[];
    };
    // The 7 Tier-1 descriptors registered via the side-effect barrel
    // import should all be present.
    const typeIds = body.types.map((t) => t.type);
    expect(typeIds).toContain("check-in");
    expect(typeIds).toContain("task");
    expect(typeIds).toContain("activity");
    expect(typeIds).toContain("item");
    expect(typeIds).toContain("character");
    expect(typeIds).toContain("dialogue");
    expect(typeIds).toContain("announcement");
    // check-in has an apply tool registered → writable.
    const checkIn = body.types.find((t) => t.type === "check-in");
    expect(checkIn?.writable).toBe(true);
    // task has no apply tool yet → read-only mention.
    const task = body.types.find((t) => t.type === "task");
    expect(task?.writable).toBe(false);
  });

  test("GET /api/v1/ai/admin/mentions/search without cookie → 401", async () => {
    const res = await app.request("/api/v1/ai/admin/mentions/search?q=x", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/v1/ai/admin/mentions/search with cookie → empty results for fresh org", async () => {
    // Fresh org has no resources yet. We're verifying the route
    // dispatches without throwing — `results: []` is the success shape.
    const res = await app.request(
      "/api/v1/ai/admin/mentions/search?types=check-in,task&q=zzz_no_match",
      {
        method: "GET",
        headers: { cookie: fx.cookie },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  });
});
