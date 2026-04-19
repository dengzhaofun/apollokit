/**
 * Route-layer tests for /api/event-catalog.
 *
 * Verifies the auth gate, internal + external merge, PATCH upgrade to
 * canonical, and the read-only guard on internal events.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization, user } from "../../schema";
import { eventCatalogService } from "./index";

const ORIGIN = "http://localhost:8787";

type SignedInFixture = {
  cookie: string;
  orgId: string;
  adminUserId: string;
  email: string;
};

async function signUpAndOrg(): Promise<SignedInFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `catalog-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "Catalog Routes Test",
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
      name: `Catalog Routes Org ${stamp}`,
      slug: `catalog-routes-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(
      `org create failed ${createOrg.status}: ${await createOrg.text()}`,
    );
  }
  const orgBody = (await createOrg.json()) as { id: string };
  const orgId = orgBody.id;

  const setActive = await app.request(
    "/api/auth/organization/set-active",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ organizationId: orgId }),
    },
  );
  if (setActive.status !== 200) {
    throw new Error(
      `set-active failed ${setActive.status}: ${await setActive.text()}`,
    );
  }

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;

  return { cookie, orgId, adminUserId, email };
}

describe("event-catalog routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/event-catalog without cookie → 401", async () => {
    const res = await app.request("/api/event-catalog");
    expect(res.status).toBe(401);
  });

  test("GET /api/event-catalog returns internal events (level.cleared)", async () => {
    // level.cleared is registered by modules/level/index.ts at barrel load.
    // Route handler serialization must include it for this org.
    const res = await app.request("/api/event-catalog", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ name: string; source: string; owner: string | null }>;
    };
    const lc = body.items.find((i) => i.name === "level.cleared");
    expect(lc).toBeDefined();
    expect(lc!.source).toBe("internal");
    expect(lc!.owner).toBe("level");
  });

  test("GET /api/event-catalog/:name returns a single internal event", async () => {
    const res = await app.request("/api/event-catalog/level.cleared", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      source: string;
      fields: Array<{ path: string }>;
    };
    expect(body.name).toBe("level.cleared");
    expect(body.source).toBe("internal");
    expect(body.fields.map((f) => f.path)).toContain("stars");
  });

  test("GET /api/event-catalog/:name 404 for unknown external event", async () => {
    const res = await app.request("/api/event-catalog/no_such_event", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /api/event-catalog/:name rejects internal events (400)", async () => {
    const res = await app.request("/api/event-catalog/level.cleared", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({ description: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  test("PATCH /api/event-catalog/:name upgrades external to canonical", async () => {
    // Seed an external entry via the service directly.
    const uniqueName = `route_upgrade_${Date.now()}`;
    await eventCatalogService.recordExternalEvent(fx.orgId, uniqueName, {
      ts: 1,
    });
    const res = await app.request(`/api/event-catalog/${uniqueName}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        description: "User signed in",
        fields: [{ path: "ts", type: "number", required: true }],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      description: string;
      fields: Array<{ path: string; required: boolean }>;
    };
    expect(body.status).toBe("canonical");
    expect(body.description).toBe("User signed in");
    expect(body.fields[0]).toEqual({
      path: "ts",
      type: "number",
      required: true,
    });
  });
});
