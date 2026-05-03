/**
 * Activity gate integration tests — real Neon dev branch, no mocks.
 *
 * The 4-time-point machine (`deriveState`) itself is unit-tested in
 * `time.test.ts`; here we cover only the DB-side behaviour:
 *   - `getActivityPhases` batch round-trip + missing-id semantics
 *   - `assertActivityWritable` / `assertActivityClaimable` against every
 *     phase, including persisted-status-vs-derived-state divergence
 *     (cron lag), the `draft` sentinel, boundary timestamps, and the
 *     "phase skipped via collapsed timestamps" case.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { db } from "../../db";
import { activityConfigs } from "../../schema/activity";
import { createTestOrg, deleteTestOrg } from "../../testing/fixtures";
import {
  ActivityNotFound,
  ActivityNotInClaimablePhase,
  ActivityNotInWritablePhase,
} from "./errors";
import {
  assertActivityClaimable,
  assertActivityWritable,
  getActivityPhases,
} from "./gate";

const HOUR = 3_600_000;

type SeedTimes = {
  visibleAt: Date;
  startAt: Date;
  endAt: Date;
  hiddenAt: Date;
};

function timesAround(anchor: Date): SeedTimes {
  return {
    visibleAt: new Date(anchor.getTime() - 2 * HOUR),
    startAt: new Date(anchor.getTime() - 1 * HOUR),
    endAt: new Date(anchor.getTime() + 1 * HOUR),
    hiddenAt: new Date(anchor.getTime() + 24 * HOUR),
  };
}

describe("activity/gate", () => {
  let orgId: string;
  let aliasCounter = 0;
  const nextAlias = () => `gate-${++aliasCounter}`;

  async function seedActivity(opts: {
    status?:
      | "draft"
      | "scheduled"
      | "teasing"
      | "active"
      | "ended"
      | "archived";
    times: SeedTimes;
  }): Promise<string> {
    const [row] = await db
      .insert(activityConfigs)
      .values({
        tenantId: orgId,
        alias: nextAlias(),
        name: "gate-test",
        kind: "generic",
        status: opts.status ?? "scheduled",
        visibleAt: opts.times.visibleAt,
        startAt: opts.times.startAt,
        endAt: opts.times.endAt,
        hiddenAt: opts.times.hiddenAt,
      })
      .returning({ id: activityConfigs.id });
    return row!.id;
  }

  beforeAll(async () => {
    orgId = await createTestOrg("activity-gate");
  });

  afterAll(async () => {
    await deleteTestOrg(orgId);
  });

  test("getActivityPhases: empty input returns empty Map (no SQL)", async () => {
    const result = await getActivityPhases(db, []);
    expect(result.size).toBe(0);
  });

  test("getActivityPhases: batch resolves all ids in a single round-trip", async () => {
    const now = new Date();
    const a = await seedActivity({ status: "active", times: timesAround(now) });
    const b = await seedActivity({
      status: "scheduled",
      times: timesAround(new Date(now.getTime() + 10 * HOUR)),
    });
    const phases = await getActivityPhases(db, [a, b], now);
    expect(phases.get(a)).toBe("active");
    expect(phases.get(b)).toBe("scheduled");
  });

  test("getActivityPhases: deduplicates ids and tolerates missing keys", async () => {
    const now = new Date();
    const a = await seedActivity({ status: "active", times: timesAround(now) });
    const phantom = crypto.randomUUID();
    const phases = await getActivityPhases(db, [a, a, phantom], now);
    expect(phases.size).toBe(1);
    expect(phases.get(a)).toBe("active");
    expect(phases.has(phantom)).toBe(false);
  });

  test("assertActivityWritable: passes for phase=active", async () => {
    const now = new Date();
    const id = await seedActivity({
      status: "active",
      times: timesAround(now),
    });
    await expect(assertActivityWritable(db, id, now)).resolves.toBeUndefined();
  });

  test.each([
    ["scheduled", -10 * HOUR],
    ["teasing", -1.5 * HOUR],
    ["ended", +1.5 * HOUR],
    ["archived", +25 * HOUR],
  ] as const)(
    "assertActivityWritable: throws for phase=%s",
    async (label, deltaMs) => {
      const anchor = new Date(Date.now() - deltaMs);
      const id = await seedActivity({
        status: "active", // intentionally stale; gate must use deriveState live
        times: timesAround(anchor),
      });
      await expect(assertActivityWritable(db, id)).rejects.toBeInstanceOf(
        ActivityNotInWritablePhase,
      );
      void label;
    },
  );

  test("assertActivityWritable: draft is sticky even when timestamps are past", async () => {
    const past = new Date(Date.now() - 5 * HOUR);
    const id = await seedActivity({
      status: "draft",
      times: timesAround(past),
    });
    await expect(assertActivityWritable(db, id)).rejects.toBeInstanceOf(
      ActivityNotInWritablePhase,
    );
  });

  test("assertActivityWritable: throws ActivityNotFound for unknown id", async () => {
    const phantom = crypto.randomUUID();
    await expect(assertActivityWritable(db, phantom)).rejects.toBeInstanceOf(
      ActivityNotFound,
    );
  });

  test("assertActivityClaimable: passes for active and ended (pre-archive grace window)", async () => {
    const now = new Date();
    const activeId = await seedActivity({
      status: "active",
      times: timesAround(now),
    });
    const endedId = await seedActivity({
      status: "ended",
      times: timesAround(new Date(now.getTime() - 1.5 * HOUR)),
    });
    await expect(
      assertActivityClaimable(db, activeId, now),
    ).resolves.toBeUndefined();
    await expect(
      assertActivityClaimable(db, endedId, now),
    ).resolves.toBeUndefined();
  });

  test.each([
    ["scheduled", -10 * HOUR],
    ["teasing", -1.5 * HOUR],
    ["archived", +25 * HOUR],
  ] as const)(
    "assertActivityClaimable: throws for phase=%s",
    async (label, deltaMs) => {
      const anchor = new Date(Date.now() - deltaMs);
      const id = await seedActivity({
        status: "active",
        times: timesAround(anchor),
      });
      await expect(assertActivityClaimable(db, id)).rejects.toBeInstanceOf(
        ActivityNotInClaimablePhase,
      );
      void label;
    },
  );

  test("cron lag: persisted status='active' but live derivation yields 'archived'", async () => {
    const longAgo = new Date(Date.now() - 26 * HOUR); // anchor far enough that hiddenAt has passed
    const id = await seedActivity({
      status: "active", // stale snapshot
      times: timesAround(longAgo),
    });
    await expect(assertActivityWritable(db, id)).rejects.toBeInstanceOf(
      ActivityNotInWritablePhase,
    );
    await expect(assertActivityClaimable(db, id)).rejects.toBeInstanceOf(
      ActivityNotInClaimablePhase,
    );
  });

  test("boundary: now === startAt → active (writable passes)", async () => {
    const startAt = new Date();
    const id = await seedActivity({
      status: "scheduled",
      times: {
        visibleAt: new Date(startAt.getTime() - HOUR),
        startAt,
        endAt: new Date(startAt.getTime() + HOUR),
        hiddenAt: new Date(startAt.getTime() + 24 * HOUR),
      },
    });
    await expect(
      assertActivityWritable(db, id, startAt),
    ).resolves.toBeUndefined();
  });

  test("boundary: now === endAt → ended (writable rejects, claimable passes)", async () => {
    const endAt = new Date();
    const id = await seedActivity({
      status: "active",
      times: {
        visibleAt: new Date(endAt.getTime() - 2 * HOUR),
        startAt: new Date(endAt.getTime() - HOUR),
        endAt,
        hiddenAt: new Date(endAt.getTime() + 24 * HOUR),
      },
    });
    await expect(assertActivityWritable(db, id, endAt)).rejects.toBeInstanceOf(
      ActivityNotInWritablePhase,
    );
    await expect(
      assertActivityClaimable(db, id, endAt),
    ).resolves.toBeUndefined();
  });

  test("collapsed teasing: visibleAt === startAt → now=visibleAt is active, not teasing", async () => {
    const start = new Date();
    const id = await seedActivity({
      status: "active",
      times: {
        visibleAt: start,
        startAt: start, // collapsed: no teasing window
        endAt: new Date(start.getTime() + HOUR),
        hiddenAt: new Date(start.getTime() + 24 * HOUR),
      },
    });
    const phases = await getActivityPhases(db, [id], start);
    expect(phases.get(id)).toBe("active");
    await expect(
      assertActivityWritable(db, id, start),
    ).resolves.toBeUndefined();
  });
});
