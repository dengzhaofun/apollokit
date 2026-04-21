/**
 * Route-layer tests for the assist-pool module.
 *
 * Covers the HTTP surface that service-layer tests can't see:
 *   - `requireAdminOrApiKey` → 401 without a cookie
 *   - Zod input validation → 400
 *   - `ModuleError` → router `onError` status mapping
 *   - Path prefix (`/api/assist-pool`) + happy-path end-to-end
 *   - Force-expire admin action
 *
 * Drives the real `/api/auth/sign-up/email` + `/api/auth/organization/create`
 * flow in-process to get a genuine session cookie — no curl, no wrangler.
 *
 * Cleanup: afterAll deletes the test org (cascades assist_pool_* rows) and
 * the test user (cascades session / account).
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
  const email = `assist-routes-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    body: JSON.stringify({
      email,
      password: "password12345",
      name: "Assist Routes Test",
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(
      `sign-up failed ${signUp.status}: ${await signUp.text()}`,
    );
  }

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
      name: `Assist Routes Org ${stamp}`,
      slug: `assist-routes-${stamp}`,
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

describe("assist-pool routes", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg();
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("GET /api/assist-pool/configs without cookie → 401", async () => {
    const res = await app.request("/api/assist-pool/configs");
    expect(res.status).toBe(401);
  });

  test("zod validation: negative targetAmount → 400", async () => {
    const res = await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Bad Target",
        targetAmount: -5,
        contributionPolicy: { kind: "fixed", amount: 5 },
      }),
    });
    expect(res.status).toBe(400);
  });

  test("zod validation: uniform policy with max < min → 400", async () => {
    const res = await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Bad Uniform",
        targetAmount: 100,
        contributionPolicy: { kind: "uniform", min: 50, max: 10 },
      }),
    });
    expect(res.status).toBe(400);
  });

  test("happy path: create config, initiate, contribute, complete", async () => {
    const create = await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Route Happy",
        alias: "route-happy",
        targetAmount: 30,
        mode: "decrement",
        contributionPolicy: { kind: "fixed", amount: 10 },
        perAssisterLimit: 5,
      }),
    });
    expect(create.status).toBe(201);
    const cfg = (await create.json()) as { id: string; alias: string };
    expect(cfg.alias).toBe("route-happy");

    const initiate = await app.request("/api/assist-pool/instances", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        configKey: "route-happy",
        initiatorEndUserId: "biz-user-happy",
      }),
    });
    expect(initiate.status).toBe(201);
    const inst = (await initiate.json()) as {
      id: string;
      remaining: number;
      status: string;
    };
    expect(inst.status).toBe("in_progress");
    expect(inst.remaining).toBe(30);

    // Drive 3 contributions from distinct assisters
    for (const assister of ["helper-1", "helper-2", "helper-3"]) {
      const contrib = await app.request(
        `/api/assist-pool/instances/${inst.id}/contribute`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: fx.cookie,
          },
          body: JSON.stringify({ assisterEndUserId: assister }),
        },
      );
      expect(contrib.status).toBe(200);
    }

    // Final read shows completed
    const finalRead = await app.request(
      `/api/assist-pool/instances/${inst.id}`,
      { headers: { cookie: fx.cookie } },
    );
    expect(finalRead.status).toBe(200);
    const finalInst = (await finalRead.json()) as {
      status: string;
      remaining: number;
    };
    expect(finalInst.status).toBe("completed");
    expect(finalInst.remaining).toBe(0);
  });

  test("ModuleError mapping: duplicate alias → 409", async () => {
    await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Dup 1",
        alias: "dup-route",
        targetAmount: 10,
        contributionPolicy: { kind: "fixed", amount: 5 },
      }),
    });
    const dup = await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Dup 2",
        alias: "dup-route",
        targetAmount: 10,
        contributionPolicy: { kind: "fixed", amount: 5 },
      }),
    });
    expect(dup.status).toBe(409);
    const body = (await dup.json()) as { code?: string };
    expect(body.code).toBe("assist_pool.alias_conflict");
  });

  test("ModuleError mapping: self-assist forbidden → 409", async () => {
    await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "No Self Route",
        alias: "no-self-route",
        targetAmount: 50,
        contributionPolicy: { kind: "fixed", amount: 10 },
      }),
    });
    const init = await app.request("/api/assist-pool/instances", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        configKey: "no-self-route",
        initiatorEndUserId: "self-u",
      }),
    });
    const inst = (await init.json()) as { id: string };

    const selfContrib = await app.request(
      `/api/assist-pool/instances/${inst.id}/contribute`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: fx.cookie,
        },
        body: JSON.stringify({ assisterEndUserId: "self-u" }),
      },
    );
    expect(selfContrib.status).toBe(409);
    const body = (await selfContrib.json()) as { code?: string };
    expect(body.code).toBe("assist_pool.self_assist_forbidden");
  });

  test("force-expire flips status to expired", async () => {
    await app.request("/api/assist-pool/configs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        name: "Force Expire",
        alias: "force-expire",
        targetAmount: 100,
        contributionPolicy: { kind: "fixed", amount: 10 },
      }),
    });
    const init = await app.request("/api/assist-pool/instances", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fx.cookie,
      },
      body: JSON.stringify({
        configKey: "force-expire",
        initiatorEndUserId: "biz-force",
      }),
    });
    const inst = (await init.json()) as { id: string };

    const expire = await app.request(
      `/api/assist-pool/instances/${inst.id}/force-expire`,
      {
        method: "POST",
        headers: { cookie: fx.cookie },
      },
    );
    expect(expire.status).toBe(200);
    const body = (await expire.json()) as { status: string };
    expect(body.status).toBe("expired");

    // Further contribute calls → 409 instance_expired
    const contrib = await app.request(
      `/api/assist-pool/instances/${inst.id}/contribute`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: fx.cookie,
        },
        body: JSON.stringify({ assisterEndUserId: "too-late" }),
      },
    );
    expect(contrib.status).toBe(409);
    const errBody = (await contrib.json()) as { code?: string };
    expect(errBody.code).toBe("assist_pool.instance_expired");
  });

  test("404 on missing config alias", async () => {
    const res = await app.request("/api/assist-pool/configs/does-not-exist", {
      headers: { cookie: fx.cookie },
    });
    expect(res.status).toBe(404);
  });

  test("list filters respect query params (status=in_progress)", async () => {
    const list = await app.request(
      "/api/assist-pool/instances?status=in_progress",
      { headers: { cookie: fx.cookie } },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      items: Array<{ status: string }>;
    };
    for (const item of body.items) {
      expect(item.status).toBe("in_progress");
    }
  });
});
