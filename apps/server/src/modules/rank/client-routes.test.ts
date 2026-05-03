/**
 * Route-layer tests for rank client router.
 *
 * Thin — HTTP edges only:
 *  - 401 missing x-api-key
 *  - 400 missing x-end-user-id
 *  - happy path for /state / /history / /leaderboard under devMode
 *  - assert NO POST /settle is exposed on the client router
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import app from "../../index";
import { db } from "../../db";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { clientCredentialService } from "../client-credentials";
import { rankService } from "./index";

describe("rank client routes", () => {
  let orgId: string;
  let publishableKey: string;
  let seasonId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-client-routes");

    const cred = await clientCredentialService.create(orgId, {
      name: "rank-client-test",
    });
    publishableKey = cred.publishableKey;
    await clientCredentialService.updateDevMode(orgId, cred.id, true);

    // Seed a tier config + active season and run one settle so player
    // states exist for /state, /history, /leaderboard to read.
    const { config } = await rankService.createTierConfig(orgId, {
      alias: "client_cfg",
      name: "Client Cfg",
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
    });
    const season = await rankService.createSeason(orgId, {
      alias: "c_s1",
      name: "Client S1",
      tierConfigId: config.id,
      startAt: new Date(Date.now() - 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await rankService.activateSeason(orgId, season.id);
    seasonId = season.id;

    await rankService.settleMatch({
      tenantId: orgId,
      seasonId,
      externalMatchId: "client-m1",
      participants: [
        { endUserId: "player-x", matchTeamId: "A", placement: 1, win: true },
        { endUserId: "player-y", matchTeamId: "B", placement: 2, win: false },
      ],
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("401 without x-api-key", async () => {
    const res = await app.request(
      "/api/client/rank/state?tierConfigAlias=client_cfg",
    );
    expect(res.status).toBe(401);
  });

  test("400 without x-end-user-id header", async () => {
    const res = await app.request(
      "/api/client/rank/state?tierConfigAlias=client_cfg",
      { headers: { "x-api-key": publishableKey } },
    );
    expect(res.status).toBe(400);
  });

  test("400 when locator missing (no tierConfigAlias nor seasonId)", async () => {
    const res = await app.request("/api/client/rank/state", {
      headers: {
        "x-api-key": publishableKey,
        "x-end-user-id": "player-x",
      },
    });
    expect(res.status).toBe(400);
  });

  test("GET /state returns player view", async () => {
    const res = await app.request(
      "/api/client/rank/state?tierConfigAlias=client_cfg",
      {
        headers: {
          "x-api-key": publishableKey,
          "x-end-user-id": "player-x",
        },
      },
    );
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: {
        endUserId: string;
        rankScore: number;
        wins: number;
      };
    };
    expect(env.data.endUserId).toBe("player-x");
    expect(env.data.wins).toBe(1);
  });

  test("GET /history returns caller's participant rows", async () => {
    const res = await app.request(
      `/api/client/rank/history?seasonId=${seasonId}`,
      {
        headers: {
          "x-api-key": publishableKey,
          "x-end-user-id": "player-x",
        },
      },
    );
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: {
        items: Array<{ endUserId: string; win: boolean }>;
      };
    };
    expect(env.data.items).toHaveLength(1);
    expect(env.data.items[0]!.endUserId).toBe("player-x");
    expect(env.data.items[0]!.win).toBe(true);
  });

  test("GET /leaderboard (global, no tierId) returns rankings array", async () => {
    const res = await app.request(
      `/api/client/rank/leaderboard?seasonId=${seasonId}`,
      {
        headers: {
          "x-api-key": publishableKey,
          "x-end-user-id": "player-x",
        },
      },
    );
    expect(res.status).toBe(200);
    const env = (await res.json()) as {
      code: string;
      data: {
        rankings: Array<{ endUserId: string; score: number }>;
      };
    };
    // Fallback PG path is active when no leaderboard is wired (tests
    // don't mount leaderboard). Either way, rankings should be present.
    expect(Array.isArray(env.data.rankings)).toBe(true);
  });

  test("client router does NOT expose POST /settle (cheat-path guard)", async () => {
    const res = await app.request("/api/client/rank/settle", {
      method: "POST",
      headers: {
        "x-api-key": publishableKey,
        "x-end-user-id": "player-x",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tierConfigAlias: "client_cfg",
        externalMatchId: "cheat-attempt",
        participants: [
          { endUserId: "player-x", matchTeamId: "A", placement: 1, win: true },
          { endUserId: "player-y", matchTeamId: "B", placement: 2, win: false },
        ],
      }),
    });
    // Should be 404 (route not registered) or 405 (method not allowed).
    // 200/201 would be a security bug.
    expect([404, 405]).toContain(res.status);
  });
});

// Prevent unused-import linter warnings.
void db;
