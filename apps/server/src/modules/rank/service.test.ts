/**
 * Service-layer tests for the rank module.
 *
 * Hits the real Postgres configured in `.dev.vars` (should be local PG
 * — see memory: "单元测试优先使用本地数据库"). Each describe() seeds
 * its own test org in beforeAll and relies on ON DELETE CASCADE.
 *
 * We do not wire a real leaderboard service here — rank's fan-out is
 * exercised as a no-op via the default `() => null` getter, so these
 * tests are pure rank + Postgres with no leaderboard dependency.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { createEventBus, type EventBus } from "../../lib/event-bus";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createRankService } from "./service";
import type { CreateTierConfigInput, SettleMatchInput } from "./validators";

/** Standard 3-tier / 3-subtier / 5-star config used across tests. */
function standardConfigInput(alias: string): CreateTierConfigInput {
  return {
    alias,
    name: `Config ${alias}`,
    ratingParams: {
      strategy: "elo",
      baseK: 32,
      teamMode: "avgTeamElo",
      initialMmr: 1000,
    },
    tiers: [
      {
        alias: "bronze",
        name: "青铜",
        order: 0,
        minRankScore: 0,
        maxRankScore: 999,
        subtierCount: 3,
        starsPerSubtier: 5,
      },
      {
        alias: "silver",
        name: "白银",
        order: 1,
        minRankScore: 1000,
        maxRankScore: 1999,
        subtierCount: 3,
        starsPerSubtier: 5,
      },
      {
        alias: "gold",
        name: "黄金",
        order: 2,
        minRankScore: 2000,
        maxRankScore: null,
        subtierCount: 3,
        starsPerSubtier: 5,
      },
    ],
  };
}

async function setupActiveSeason(
  svc: ReturnType<typeof createRankService>,
  orgId: string,
  configAlias: string,
  seasonAlias: string,
): Promise<{ seasonId: string }> {
  const { config } = await svc.createTierConfig(
    orgId,
    standardConfigInput(configAlias),
  );
  const now = new Date();
  const season = await svc.createSeason(orgId, {
    alias: seasonAlias,
    name: `Season ${seasonAlias}`,
    tierConfigId: config.id,
    startAt: new Date(now.getTime() - 86_400_000).toISOString(),
    endAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
  });
  const activated = await svc.activateSeason(orgId, season.id);
  expect(activated.status).toBe("active");
  return { seasonId: season.id };
}

function match(
  externalId: string,
  aWin: boolean,
  tierConfigAlias: string,
): SettleMatchInput & { organizationId: string } {
  return {
    organizationId: "", // filled by caller
    tierConfigAlias,
    externalMatchId: externalId,
    gameMode: "1v1",
    participants: [
      { endUserId: "player-A", teamId: "A", placement: aWin ? 1 : 2, win: aWin },
      { endUserId: "player-B", teamId: "B", placement: aWin ? 2 : 1, win: !aWin },
    ],
  };
}

// ─── Tier config CRUD ─────────────────────────────────────────────

describe("rank service — tier config CRUD", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-tierconfig");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("createTierConfig persists config + tiers in order", async () => {
    const { config, tiers } = await svc.createTierConfig(
      orgId,
      standardConfigInput("classic_5v5"),
    );
    expect(config.alias).toBe("classic_5v5");
    expect(tiers).toHaveLength(3);
    const orders = tiers.map((t) => t.order).sort();
    expect(orders).toEqual([0, 1, 2]);
  });

  test("createTierConfig rejects duplicate alias", async () => {
    await expect(
      svc.createTierConfig(orgId, standardConfigInput("classic_5v5")),
    ).rejects.toMatchObject({ code: "rank.tier_config_alias_conflict" });
  });

  test("getTierConfig resolves by alias or id", async () => {
    const byAlias = await svc.getTierConfig(orgId, "classic_5v5");
    const byId = await svc.getTierConfig(orgId, byAlias.config.id);
    expect(byId.config.id).toBe(byAlias.config.id);
    expect(byId.tiers).toHaveLength(3);
  });

  test("updateTierConfig replaces tiers atomically", async () => {
    const updated = await svc.updateTierConfig(orgId, "classic_5v5", {
      tiers: [
        {
          alias: "iron",
          name: "黑铁",
          order: 0,
          minRankScore: 0,
          maxRankScore: 499,
          subtierCount: 2,
          starsPerSubtier: 3,
        },
        {
          alias: "diamond",
          name: "钻石",
          order: 1,
          minRankScore: 500,
          maxRankScore: null,
          subtierCount: 2,
          starsPerSubtier: 3,
        },
      ],
    });
    expect(updated.tiers).toHaveLength(2);
    expect(updated.tiers.map((t) => t.alias).sort()).toEqual([
      "diamond",
      "iron",
    ]);
    expect(updated.config.version).toBeGreaterThan(1);
  });

  test("listTierConfigs returns all configs for the org", async () => {
    await svc.createTierConfig(orgId, standardConfigInput("casual_3v3"));
    const all = await svc.listTierConfigs(orgId);
    const aliases = all.items.map((x) => x.config.alias).sort();
    expect(aliases).toEqual(["casual_3v3", "classic_5v5"]);
  });
});

// ─── Season lifecycle ─────────────────────────────────────────────

describe("rank service — season lifecycle", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;
  let configId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-seasons");
    const { config } = await svc.createTierConfig(
      orgId,
      standardConfigInput("league"),
    );
    configId = config.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("createSeason defaults to upcoming status", async () => {
    const season = await svc.createSeason(orgId, {
      alias: "s1",
      name: "Season 1",
      tierConfigId: configId,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-04-01T00:00:00.000Z",
    });
    expect(season.status).toBe("upcoming");
  });

  test("activateSeason flips upcoming → active", async () => {
    const season = await svc.listSeasons(orgId, { status: "upcoming" });
    expect(season.items).toHaveLength(1);
    const activated = await svc.activateSeason(orgId, season.items[0]!.id);
    expect(activated.status).toBe("active");
  });

  test("activateSeason rejects a second active season on same tierConfig", async () => {
    const s2 = await svc.createSeason(orgId, {
      alias: "s2",
      name: "Season 2",
      tierConfigId: configId,
      startAt: "2026-04-02T00:00:00.000Z",
      endAt: "2026-07-02T00:00:00.000Z",
    });
    await expect(svc.activateSeason(orgId, s2.id)).rejects.toMatchObject({
      code: "rank.season_overlap",
    });
  });

  test("finalizeSeason flips active → finished and is idempotent", async () => {
    const [active] = (await svc.listSeasons(orgId, { status: "active" })).items;
    expect(active).toBeDefined();
    const first = await svc.finalizeSeason(orgId, active!.id);
    expect(first.snapshotCount).toBeGreaterThanOrEqual(0);
    // second call is a no-op
    const second = await svc.finalizeSeason(orgId, active!.id);
    expect(second.snapshotCount).toBe(0);
    const after = await svc.getSeason(orgId, active!.id);
    expect(after.status).toBe("finished");
  });
});

// ─── Settle match: 3-game A/B sequence ───────────────────────────

describe("rank service — settleMatch 3-game sequence", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;
  let seasonId: string;
  const events_log: Array<{ type: string; payload: unknown }> = [];
  const testEvents: EventBus = {
    on: events.on,
    off: events.off,
    emit: async (type, payload) => {
      events_log.push({ type, payload });
      await events.emit(type, payload);
    },
  };

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-settle");
    const svcWithLog = createRankService({ db, events: testEvents });
    ({ seasonId } = await setupActiveSeason(
      svcWithLog,
      orgId,
      "classic",
      "s1",
    ));
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("first match: A wins over B — MMR delta is symmetric", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const m = match("ext-1", true, "classic");
    m.organizationId = orgId;
    const result = await svcWithLog.settleMatch(m);
    expect(result.alreadySettled).toBe(false);
    expect(result.participants).toHaveLength(2);

    const a = result.participants.find((p) => p.endUserId === "player-A")!;
    const b = result.participants.find((p) => p.endUserId === "player-B")!;
    expect(a.mmrBefore).toBe(1000);
    expect(a.mmrAfter).toBeCloseTo(1016, 5);
    expect(b.mmrAfter).toBeCloseTo(984, 5);
    expect(a.starsDelta).toBe(1);
    expect(b.starsDelta).toBe(-1);
  });

  test("second match (same externalMatchId): alreadySettled=true", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const m = match("ext-1", true, "classic");
    m.organizationId = orgId;
    const result = await svcWithLog.settleMatch(m);
    expect(result.alreadySettled).toBe(true);
    expect(result.participants).toHaveLength(2);
  });

  test("second match (new externalMatchId, B wins): cumulative state correct", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const m = match("ext-2", false, "classic");
    m.organizationId = orgId;
    const result = await svcWithLog.settleMatch(m);
    const a = result.participants.find((p) => p.endUserId === "player-A")!;
    const b = result.participants.find((p) => p.endUserId === "player-B")!;
    // A went 1016 → now; B went 984 → now. Equal ratings after 1 loss + 1 win:
    // A: from 1016, loses to B at 984 → expected ~0.523, delta ≈ -16.7
    expect(a.mmrBefore).toBeCloseTo(1016, 5);
    expect(b.mmrBefore).toBeCloseTo(984, 5);
    expect(a.mmrAfter).toBeLessThan(a.mmrBefore);
    expect(b.mmrAfter).toBeGreaterThan(b.mmrBefore);
    // total delta across both players ≈ 0
    const totalDelta =
      a.mmrAfter - a.mmrBefore + (b.mmrAfter - b.mmrBefore);
    expect(totalDelta).toBeCloseTo(0, 3);
  });

  test("third match (A wins again): player_state counters accumulate correctly", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const m = match("ext-3", true, "classic");
    m.organizationId = orgId;
    await svcWithLog.settleMatch(m);

    const a = await svcWithLog.getPlayerState({
      organizationId: orgId,
      seasonId,
      endUserId: "player-A",
    });
    expect(a.matchesPlayed).toBe(3);
    expect(a.wins).toBe(2);
    expect(a.losses).toBe(1);

    const b = await svcWithLog.getPlayerState({
      organizationId: orgId,
      seasonId,
      endUserId: "player-B",
    });
    expect(b.matchesPlayed).toBe(3);
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(2);
  });

  test("events: rank.match_settled emitted per participant per match", async () => {
    const settled = events_log.filter((e) => e.type === "rank.match_settled");
    // 3 unique matches × 2 participants = 6 events (the duplicate ext-1 skipped)
    expect(settled.length).toBe(6);
  });

  test("getPlayerHistory lists user's participant rows desc by id", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const hist = await svcWithLog.getPlayerHistory({
      organizationId: orgId,
      endUserId: "player-A",
      seasonId,
    });
    expect(hist.items).toHaveLength(3);
    expect(hist.items[0]!.seasonId).toBe(seasonId);
  });

  test("getGlobalLeaderboard falls back to PG when no leaderboard wired", async () => {
    const svcWithLog = createRankService({ db, events: testEvents });
    const top = await svcWithLog.getGlobalLeaderboard({
      organizationId: orgId,
      seasonId,
    });
    expect(top.rankings.length).toBe(2);
    // Winner should be ranked first by rankScore desc
    expect(top.rankings[0]!.rank).toBe(1);
  });
});

// ─── Season not active / missing ─────────────────────────────────

describe("rank service — settleMatch rejection paths", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;
  let configId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-reject");
    const { config } = await svc.createTierConfig(
      orgId,
      standardConfigInput("reject-cfg"),
    );
    configId = config.id;
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("settleMatch against upcoming season is rejected", async () => {
    const s = await svc.createSeason(orgId, {
      alias: "upcoming-s",
      name: "Upcoming",
      tierConfigId: configId,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-04-01T00:00:00.000Z",
    });
    await expect(
      svc.settleMatch({
        organizationId: orgId,
        seasonId: s.id,
        externalMatchId: "reject-1",
        participants: [
          { endUserId: "a", teamId: "A", placement: 1, win: true },
          { endUserId: "b", teamId: "B", placement: 2, win: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "rank.season_not_active" });
  });

  test("settleMatch without tierConfigAlias or seasonId is rejected", async () => {
    await expect(
      svc.settleMatch({
        organizationId: orgId,
        externalMatchId: "reject-2",
        participants: [
          { endUserId: "a", teamId: "A", placement: 1, win: true },
          { endUserId: "b", teamId: "B", placement: 2, win: false },
        ],
      } as SettleMatchInput & { organizationId: string }),
    ).rejects.toMatchObject({ code: "rank.invalid_input" });
  });

  test("settleMatch with single-team participants is rejected", async () => {
    // Activate the upcoming season so we get past the season-active check.
    // Actually: let's just create a new season for this test and activate it.
    const s = await svc.createSeason(orgId, {
      alias: "active-s",
      name: "Active",
      tierConfigId: configId,
      startAt: new Date(Date.now() - 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await svc.activateSeason(orgId, s.id);
    await expect(
      svc.settleMatch({
        organizationId: orgId,
        seasonId: s.id,
        externalMatchId: "reject-3",
        participants: [
          { endUserId: "a", teamId: "A", placement: 1, win: true },
          { endUserId: "b", teamId: "A", placement: 2, win: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "rank.invalid_participants" });
  });
});

// ─── adjustPlayer ─────────────────────────────────────────────────

describe("rank service — adjustPlayer", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;
  let seasonId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-adjust");
    ({ seasonId } = await setupActiveSeason(svc, orgId, "adj-cfg", "adj-s1"));
    // Seed a match so a player_state row exists.
    await svc.settleMatch({
      organizationId: orgId,
      seasonId,
      externalMatchId: "adj-m1",
      participants: [
        { endUserId: "audit-user", teamId: "A", placement: 1, win: true },
        { endUserId: "other", teamId: "B", placement: 2, win: false },
      ],
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("adjustPlayer mutates rankScore", async () => {
    const before = await svc.getPlayerState({
      organizationId: orgId,
      seasonId,
      endUserId: "audit-user",
    });
    const patched = await svc.adjustPlayer(orgId, "audit-user", {
      seasonId,
      rankScore: before.rankScore + 500,
      reason: "manual bonus for test",
    });
    expect(patched.rankScore).toBe(before.rankScore + 500);
  });

  test("adjustPlayer rejects unknown tierId", async () => {
    await expect(
      svc.adjustPlayer(orgId, "audit-user", {
        seasonId,
        tierId: "00000000-0000-4000-8000-000000000099",
        reason: "try wrong tier",
      }),
    ).rejects.toMatchObject({ code: "rank.tier_not_found" });
  });
});

// ─── finalizeSeason with snapshots ───────────────────────────────

describe("rank service — finalizeSeason writes snapshots", () => {
  const events = createEventBus();
  const svc = createRankService({ db, events });
  let orgId: string;
  let seasonId: string;

  beforeAll(async () => {
    orgId = await createTestOrg("rank-svc-finalize");
    ({ seasonId } = await setupActiveSeason(svc, orgId, "fin-cfg", "fin-s1"));
    await svc.settleMatch({
      organizationId: orgId,
      seasonId,
      externalMatchId: "fin-m1",
      participants: [
        { endUserId: "finA", teamId: "A", placement: 1, win: true },
        { endUserId: "finB", teamId: "B", placement: 2, win: false },
      ],
    });
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("finalize writes one snapshot per player_state, ranked globally", async () => {
    const result = await svc.finalizeSeason(orgId, seasonId);
    expect(result.snapshotCount).toBe(2);

    const snapshots = await svc.listSnapshots(orgId, seasonId);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.finalGlobalRank).toBe(1);
    expect(snapshots[1]!.finalGlobalRank).toBe(2);
    // winner comes first (higher rankScore)
    expect(snapshots[0]!.endUserId).toBe("finA");
  });
});
