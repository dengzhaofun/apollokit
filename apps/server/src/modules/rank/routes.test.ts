/**
 * Route-layer tests for rank admin router.
 *
 * Thin — only HTTP edges: requireAdminOrApiKey 401, Zod 400, happy paths
 * for /tier-configs create + /settle ingest + /seasons/activate. Full
 * business logic coverage is in service.test.ts.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import app from "../../index";
import { organization, user } from "../../schema";
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
  const email = `rank-routes-${label}-${stamp}@example.test`;

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "apollokit-test-pw-z3xK9fQp",
      name: `Rank Routes ${label}`,
    }),
  });
  if (signUp.status !== 200) {
    throw new Error(`sign-up ${signUp.status}: ${await signUp.text()}`);
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
      name: `Rank Routes Org ${stamp}`,
      slug: `rank-${label}-${stamp}`,
    }),
  });
  if (createOrg.status !== 200) {
    throw new Error(`org create ${createOrg.status}: ${await createOrg.text()}`);
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
    throw new Error(`set-active ${setActive.status}: ${await setActive.text()}`);
  }

  const userRows = await db.select().from(user).where(eq(user.email, email));
  const adminUserId = userRows[0]!.id;
  return { cookie, orgId, adminUserId, email };
}

describe("rank admin routes — auth & validation", () => {
  test("GET /api/rank/tier-configs returns 401 without auth", async () => {
    const res = await app.request("/api/rank/tier-configs");
    expect(res.status).toBe(401);
  });

  test("POST /api/rank/tier-configs returns 400 on bad body", async () => {
    const fx = await signUpAndOrg("bad-body");
    try {
      const res = await app.request("/api/rank/tier-configs", {
        method: "POST",
        headers: { cookie: fx.cookie, "content-type": "application/json" },
        body: JSON.stringify({ alias: "", name: "" }), // missing ratingParams + tiers
      });
      expect(res.status).toBe(400);
    } finally {
      await db.delete(organization).where(eq(organization.id, fx.orgId));
      await db.delete(user).where(eq(user.id, fx.adminUserId));
    }
  });

  test("POST /api/rank/settle returns 401 without auth", async () => {
    const res = await app.request("/api/rank/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tierConfigAlias: "x",
        externalMatchId: "m1",
        participants: [
          { endUserId: "a", matchTeamId: "A", placement: 1, win: true },
          { endUserId: "b", matchTeamId: "B", placement: 2, win: false },
        ],
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("rank admin routes — tier config CRUD happy path", () => {
  let fx: SignedInFixture;

  beforeAll(async () => {
    fx = await signUpAndOrg("crud");
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("POST /tier-configs + GET list + GET by alias", async () => {
    const createRes = await app.request("/api/rank/tier-configs", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        alias: "route_cfg",
        name: "Route Cfg",
        ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
        tiers: [
          {
            alias: "bronze",
            name: "Bronze",
            order: 0,
            minRankScore: 0,
            maxRankScore: 999,
            subtierCount: 3,
            starsPerSubtier: 5,
          },
          {
            alias: "silver",
            name: "Silver",
            order: 1,
            minRankScore: 1000,
            maxRankScore: null,
            subtierCount: 3,
            starsPerSubtier: 5,
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await expectOk<{
      id: string;
      alias: string;
      tiers: unknown[];
    }>(createRes);
    expect(created.alias).toBe("route_cfg");
    expect(created.tiers).toHaveLength(2);

    const listRes = await app.request("/api/rank/tier-configs", {
      headers: { cookie: fx.cookie },
    });
    expect(listRes.status).toBe(200);
    const list = await expectOk<{ items: Array<{ alias: string }> }>(listRes);
    expect(list.items.some((i) => i.alias === "route_cfg")).toBe(true);

    const getRes = await app.request("/api/rank/tier-configs/route_cfg", {
      headers: { cookie: fx.cookie },
    });
    expect(getRes.status).toBe(200);
  });
});

describe("rank admin routes — /settle end-to-end", () => {
  let fx: SignedInFixture;
  let seasonId: string;

  beforeAll(async () => {
    fx = await signUpAndOrg("settle");
    // Seed a tier config + active season.
    const cfg = await app.request("/api/rank/tier-configs", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        alias: "settle_cfg",
        name: "Settle Cfg",
        ratingParams: { strategy: "elo", baseK: 32, teamMode: "avgTeamElo" },
        tiers: [
          {
            alias: "bronze",
            name: "Bronze",
            order: 0,
            minRankScore: 0,
            maxRankScore: null,
            subtierCount: 1,
            starsPerSubtier: 5,
          },
        ],
      }),
    });
    expect(cfg.status).toBe(201);
    const cfgBody = await expectOk<{ id: string }>(cfg);

    const season = await app.request("/api/rank/seasons", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        alias: "s1",
        name: "Season 1",
        tierConfigId: cfgBody.id,
        startAt: new Date(Date.now() - 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    });
    expect(season.status).toBe(201);
    const seasonBody = await expectOk<{ id: string }>(season);
    seasonId = seasonBody.id;

    const activate = await app.request(
      `/api/rank/seasons/${seasonId}/activate`,
      {
        method: "POST",
        headers: { cookie: fx.cookie },
      },
    );
    expect(activate.status).toBe(200);
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, fx.orgId));
    await db.delete(user).where(eq(user.id, fx.adminUserId));
  });

  test("POST /settle against active season is 200 + produces deltas", async () => {
    const res = await app.request("/api/rank/settle", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        tierConfigAlias: "settle_cfg",
        externalMatchId: "route-m1",
        gameMode: "1v1",
        participants: [
          { endUserId: "route-a", matchTeamId: "A", placement: 1, win: true },
          { endUserId: "route-b", matchTeamId: "B", placement: 2, win: false },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{
      matchId: string;
      alreadySettled: boolean;
      participants: Array<{ endUserId: string; mmrAfter: number }>;
    }>(res);
    expect(data.alreadySettled).toBe(false);
    expect(data.participants).toHaveLength(2);
    const winner = data.participants.find((p) => p.endUserId === "route-a")!;
    expect(winner.mmrAfter).toBeGreaterThan(1000);
  });

  test("POST /settle duplicate externalMatchId returns alreadySettled=true", async () => {
    const res = await app.request("/api/rank/settle", {
      method: "POST",
      headers: { cookie: fx.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        tierConfigAlias: "settle_cfg",
        externalMatchId: "route-m1",
        participants: [
          { endUserId: "route-a", matchTeamId: "A", placement: 1, win: true },
          { endUserId: "route-b", matchTeamId: "B", placement: 2, win: false },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const data = await expectOk<{ alreadySettled: boolean }>(res);
    expect(data.alreadySettled).toBe(true);
  });
});
