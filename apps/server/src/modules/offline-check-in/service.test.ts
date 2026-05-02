/**
 * Service-layer tests for offline-check-in.
 *
 * Real Postgres via the `db` singleton + an in-memory `NonceStore`. The
 * RewardServices are mocked — we just record what `grantRewards` would
 * have dispatched, so we can assert idempotency without bringing
 * itemService / currencyService into scope.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import type { RewardServices } from "../../lib/rewards";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import { createMemoryNonceStore } from "./nonce-store";
import { createOfflineCheckInService } from "./service";
import type { OfflineCheckInVerification } from "./types";

type Granted = {
  kind: "item" | "currency" | "entity";
  source: string;
  payload: unknown;
};

function makeMocks() {
  const granted: Granted[] = [];
  const services: RewardServices = {
    itemSvc: {
      async grantItems(p) {
        granted.push({ kind: "item", source: p.source, payload: p.grants });
      },
      async deductItems() {},
    },
    currencySvc: {
      async grant(p) {
        granted.push({ kind: "currency", source: p.source, payload: p.grants });
      },
      async deduct() {},
    },
    entitySvc: {
      async acquireEntity(_org, _user, blueprintId, source) {
        granted.push({ kind: "entity", source, payload: { blueprintId } });
      },
    },
  };
  return { services, granted };
}

const SHANGHAI_LAT = 31.2304;
const SHANGHAI_LNG = 121.4737;

const GPS_ANY: OfflineCheckInVerification = {
  methods: [{ kind: "gps", radiusM: 100 }],
  combinator: "any",
};

const GPS_AND_QR_ALL: OfflineCheckInVerification = {
  methods: [
    { kind: "gps", radiusM: 100 },
    { kind: "qr", mode: "one_time" },
  ],
  combinator: "all",
};

describe("offline-check-in service", () => {
  let orgId: string;
  const nonceStore = createMemoryNonceStore();
  const { services: rewardSvcs, granted } = makeMocks();
  const svc = createOfflineCheckInService({ db }, rewardSvcs, nonceStore);

  beforeAll(async () => {
    orgId = await createTestOrg("offline-check-in-svc");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("create campaign + spot, then check-in inside the geofence succeeds", async () => {
    const campaign = await svc.createCampaign(orgId, {
      name: "TC-1",
      alias: "tc1",
      mode: "collect",
      completionRule: { kind: "all" },
      completionRewards: [],
    });
    const spot = await svc.createSpot(orgId, campaign.id, {
      alias: "main-stage",
      name: "Main Stage",
      latitude: SHANGHAI_LAT,
      longitude: SHANGHAI_LNG,
      geofenceRadiusM: 100,
      verification: GPS_ANY,
      spotRewards: [{ type: "item", id: "stamp-a", count: 1 }],
      collectionEntryAliases: [],
      isActive: true,
    });
    expect(spot.alias).toBe("main-stage");

    // Move the campaign out of draft so check-in is allowed.
    await svc.updateCampaign(orgId, campaign.id, { status: "active" });

    const result = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u1",
      spotAlias: "main-stage",
      lat: SHANGHAI_LAT + 0.0001, // ~11 m north
      lng: SHANGHAI_LNG,
      accuracyM: 5,
    });

    expect(result.accepted).toBe(true);
    expect(result.verifiedVia).toEqual(["gps"]);
    expect(result.granted).toEqual([{ type: "item", id: "stamp-a", count: 1 }]);
    // distance is non-trivial but <100m
    expect(result.distanceM).toBeGreaterThan(0);
    expect(result.distanceM!).toBeLessThan(50);
    // completion rule = "all" with one spot → completed in one go
    expect(result.justCompleted).toBe(true);
    expect(result.progress.completedAt).not.toBeNull();
    expect(result.progress.spotsCompleted).toEqual(["main-stage"]);
    expect(granted.some((g) => g.source === "offline_check_in.spot")).toBe(true);
  });

  test("GPS too far rejects with verification_failed", async () => {
    const campaign = await svc.createCampaign(orgId, {
      name: "TC-2",
      alias: "tc2",
      mode: "collect",
      completionRule: { kind: "all" },
      completionRewards: [],
    });
    await svc.updateCampaign(orgId, campaign.id, { status: "active" });
    await svc.createSpot(orgId, campaign.id, {
      alias: "spot-x",
      name: "Spot X",
      latitude: SHANGHAI_LAT,
      longitude: SHANGHAI_LNG,
      geofenceRadiusM: 50,
      verification: GPS_ANY,
      spotRewards: [],
      collectionEntryAliases: [],
      isActive: true,
    });
    await expect(
      svc.checkIn({
        organizationId: orgId,
        campaignKey: campaign.id,
        endUserId: "u-far",
        spotAlias: "spot-x",
        lat: SHANGHAI_LAT + 0.01, // ~1.1 km away
        lng: SHANGHAI_LNG,
      }),
    ).rejects.toThrow(/GPS too far/);
  });

  test("repeat spot check-in is idempotent in collect mode", async () => {
    const campaign = await svc.createCampaign(orgId, {
      name: "TC-3",
      alias: "tc3",
      mode: "collect",
      completionRule: { kind: "n_of_m", n: 3 },
      completionRewards: [],
    });
    await svc.updateCampaign(orgId, campaign.id, { status: "active" });
    await svc.createSpot(orgId, campaign.id, {
      alias: "alpha",
      name: "Alpha",
      latitude: SHANGHAI_LAT,
      longitude: SHANGHAI_LNG,
      geofenceRadiusM: 100,
      verification: GPS_ANY,
      spotRewards: [{ type: "currency", id: "coin", count: 10 }],
      collectionEntryAliases: [],
      isActive: true,
    });

    const baseline = granted.length;
    const a = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u3",
      spotAlias: "alpha",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
    });
    const b = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u3",
      spotAlias: "alpha",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
    });
    expect(a.accepted).toBe(true);
    // Second attempt is accepted (verification passed) but reward did
    // NOT fire again (idempotency ledger).
    expect(b.accepted).toBe(true);
    expect(b.rejectReason).toBe("already_checked_in");
    expect(b.granted).toEqual([]);
    // Exactly one currency grant occurred for this user/spot.
    const currencyGrantsForAlpha = granted
      .slice(baseline)
      .filter((g) => g.kind === "currency");
    expect(currencyGrantsForAlpha.length).toBe(1);
  });

  test("one-time QR token can only be consumed once", async () => {
    const campaign = await svc.createCampaign(orgId, {
      name: "TC-4",
      alias: "tc4",
      mode: "collect",
      completionRule: { kind: "all" },
      completionRewards: [],
    });
    await svc.updateCampaign(orgId, campaign.id, { status: "active" });
    const spot = await svc.createSpot(orgId, campaign.id, {
      alias: "qr-spot",
      name: "QR Spot",
      latitude: SHANGHAI_LAT,
      longitude: SHANGHAI_LNG,
      geofenceRadiusM: 100,
      verification: GPS_AND_QR_ALL,
      spotRewards: [],
      collectionEntryAliases: [],
      isActive: true,
    });
    const minted = await svc.mintQrTokens(orgId, spot.id, 1, 600);
    const token = minted.tokens[0]!;

    const ok = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u-qr-1",
      spotAlias: "qr-spot",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
      qrToken: token,
    });
    expect(ok.verifiedVia).toEqual(["gps", "qr"]);

    // Same user re-checking-in: short-circuited at progress level (already
    // recorded), but the SECOND scan with the same token by a DIFFERENT
    // user should fail outright because nonce has been consumed.
    await expect(
      svc.checkIn({
        organizationId: orgId,
        campaignKey: campaign.id,
        endUserId: "u-qr-2",
        spotAlias: "qr-spot",
        lat: SHANGHAI_LAT,
        lng: SHANGHAI_LNG,
        qrToken: token,
      }),
    ).rejects.toThrow(/QR token/);
  });

  test("daily mode dedups same-day attempts but allows next-day", async () => {
    const campaign = await svc.createCampaign(orgId, {
      name: "TC-5",
      alias: "tc5",
      mode: "daily",
      completionRule: { kind: "daily_total", days: 2 },
      completionRewards: [{ type: "currency", id: "completion-coin", count: 100 }],
      timezone: "Asia/Shanghai",
    });
    await svc.updateCampaign(orgId, campaign.id, { status: "active" });
    await svc.createSpot(orgId, campaign.id, {
      alias: "gate",
      name: "Gate",
      latitude: SHANGHAI_LAT,
      longitude: SHANGHAI_LNG,
      geofenceRadiusM: 100,
      verification: GPS_ANY,
      spotRewards: [],
      collectionEntryAliases: [],
      isActive: true,
    });
    const day1 = new Date("2026-05-02T03:00:00Z"); // 11:00 Shanghai
    const day1Later = new Date("2026-05-02T08:00:00Z"); // 16:00 Shanghai
    const day2 = new Date("2026-05-03T03:00:00Z");

    const r1 = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u5",
      spotAlias: "gate",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
      now: day1,
    });
    expect(r1.accepted).toBe(true);
    expect(r1.progress.dailyCount).toBe(1);
    expect(r1.justCompleted).toBe(false);

    const r1b = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u5",
      spotAlias: "gate",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
      now: day1Later,
    });
    // Same day → marker `gate@2026-05-02` is already in spotsCompleted.
    expect(r1b.rejectReason).toBe("already_checked_in");
    expect(r1b.progress.dailyCount).toBe(1);

    const r2 = await svc.checkIn({
      organizationId: orgId,
      campaignKey: campaign.id,
      endUserId: "u5",
      spotAlias: "gate",
      lat: SHANGHAI_LAT,
      lng: SHANGHAI_LNG,
      now: day2,
    });
    expect(r2.accepted).toBe(true);
    expect(r2.progress.dailyCount).toBe(2);
    // completion_rule.daily_total=2 → completion fires now
    expect(r2.justCompleted).toBe(true);
    expect(r2.granted).toEqual([
      { type: "currency", id: "completion-coin", count: 100 },
    ]);
  });
});
