/**
 * Pure unit tests for activity/time.ts — no DB, no network.
 *   `pnpm --filter=server test src/modules/activity/time.test.ts`
 */
import { describe, expect, test } from "vitest";

import { computeNextFireAt, deriveState, validateTimeOrder } from "./time";

function cfg(overrides: Partial<{
  status: string;
  visibleAt: Date;
  startAt: Date;
  endAt: Date;
  hiddenAt: Date;
}> = {}) {
  const base = new Date(Date.UTC(2026, 3, 17, 10));
  return {
    status: "scheduled",
    visibleAt: base,
    startAt: new Date(base.getTime() + 3_600_000),
    endAt: new Date(base.getTime() + 2 * 3_600_000),
    hiddenAt: new Date(base.getTime() + 4 * 3_600_000),
    ...overrides,
  } as {
    status: "draft" | "scheduled" | "teasing" | "active" | "ended" | "archived";
    visibleAt: Date;
    startAt: Date;
    endAt: Date;
    hiddenAt: Date;
  };
}

describe("activity/time.deriveState", () => {
  const c = cfg();

  test("draft is sticky — stays draft regardless of now", () => {
    const draft = { ...c, status: "draft" as const };
    expect(deriveState(draft, new Date(c.hiddenAt.getTime() + 1))).toBe("draft");
  });

  test("before visibleAt → scheduled", () => {
    expect(deriveState(c, new Date(c.visibleAt.getTime() - 1))).toBe(
      "scheduled",
    );
  });

  test("between visibleAt and startAt → teasing", () => {
    expect(deriveState(c, new Date(c.visibleAt.getTime() + 1000))).toBe(
      "teasing",
    );
  });

  test("between startAt and endAt → active", () => {
    expect(deriveState(c, new Date(c.startAt.getTime() + 1000))).toBe("active");
  });

  test("between endAt and hiddenAt → ended", () => {
    expect(deriveState(c, new Date(c.endAt.getTime() + 1000))).toBe("ended");
  });

  test("at/after hiddenAt → archived", () => {
    expect(deriveState(c, c.hiddenAt)).toBe("archived");
    expect(deriveState(c, new Date(c.hiddenAt.getTime() + 1))).toBe("archived");
  });
});

describe("activity/time.validateTimeOrder", () => {
  test("happy path passes", () => {
    const c = cfg();
    expect(validateTimeOrder(c)).toBeNull();
  });

  test("rejects visibleAt > startAt", () => {
    const c = cfg({
      visibleAt: new Date(Date.UTC(2026, 3, 17, 12)),
      startAt: new Date(Date.UTC(2026, 3, 17, 11)),
    });
    expect(validateTimeOrder(c)).toMatch(/visibleAt/);
  });

  test("rejects endAt <= startAt", () => {
    const c = cfg({
      endAt: new Date(cfg().startAt.getTime()),
    });
    expect(validateTimeOrder(c)).toMatch(/startAt/);
  });

  test("rejects endAt > hiddenAt", () => {
    const base = cfg();
    const c = {
      ...base,
      endAt: new Date(base.hiddenAt.getTime() + 1),
    };
    expect(validateTimeOrder(c)).toMatch(/hiddenAt/);
  });
});

describe("activity/time.computeNextFireAt", () => {
  const activity = {
    visibleAt: new Date(Date.UTC(2026, 3, 17, 10)),
    startAt: new Date(Date.UTC(2026, 3, 17, 11)),
    endAt: new Date(Date.UTC(2026, 3, 17, 12)),
    hiddenAt: new Date(Date.UTC(2026, 3, 17, 14)),
  };

  test("once_at returns fireAt verbatim", () => {
    const fireAt = new Date(Date.UTC(2026, 3, 17, 11, 30));
    expect(
      computeNextFireAt(
        { triggerKind: "once_at", fireAt, offsetFrom: null, offsetSeconds: null },
        activity,
      ),
    ).toEqual(fireAt);
  });

  test("relative_offset from start_at (default) adds seconds", () => {
    const got = computeNextFireAt(
      {
        triggerKind: "relative_offset",
        fireAt: null,
        offsetFrom: null,
        offsetSeconds: 300,
      },
      activity,
    );
    expect(got?.getTime()).toBe(activity.startAt.getTime() + 300_000);
  });

  test("relative_offset from end_at works", () => {
    const got = computeNextFireAt(
      {
        triggerKind: "relative_offset",
        fireAt: null,
        offsetFrom: "end_at",
        offsetSeconds: -600,
      },
      activity,
    );
    expect(got?.getTime()).toBe(activity.endAt.getTime() - 600_000);
  });

  test("cron without expr returns null", () => {
    expect(
      computeNextFireAt(
        {
          triggerKind: "cron",
          fireAt: null,
          offsetFrom: null,
          offsetSeconds: null,
          cronExpr: null,
        },
        activity,
      ),
    ).toBeNull();
  });

  test("cron with daily expression returns next UTC-12:00 match", () => {
    const from = new Date(Date.UTC(2026, 3, 17, 10));
    const next = computeNextFireAt(
      {
        triggerKind: "cron",
        fireAt: null,
        offsetFrom: null,
        offsetSeconds: null,
        cronExpr: "0 12 * * *",
      },
      { ...activity, timezone: "UTC" },
      from,
    );
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-04-17T12:00:00.000Z");
  });

  test("cron with invalid expression returns null (silently)", () => {
    expect(
      computeNextFireAt(
        {
          triggerKind: "cron",
          fireAt: null,
          offsetFrom: null,
          offsetSeconds: null,
          cronExpr: "not a cron expression",
        },
        activity,
      ),
    ).toBeNull();
  });
});
