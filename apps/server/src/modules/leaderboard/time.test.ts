/**
 * Pure unit tests for leaderboard/time.ts — no DB, no network.
 * Fast by design; run with
 *   `pnpm --filter=server test src/modules/leaderboard/time.test.ts`.
 */
import { describe, expect, test } from "vitest";

import {
  cycleIsDue,
  cycleKeyFor,
  previousCycleKey,
  toNaturalDate,
} from "./time";

const UTC = "UTC";
const CN = "Asia/Shanghai";

describe("leaderboard/time.cycleKeyFor", () => {
  test("daily resolves to YYYY-MM-DD in the given timezone", () => {
    // 2026-04-17 16:00 UTC = 2026-04-18 00:00 Asia/Shanghai
    const t = new Date(Date.UTC(2026, 3, 17, 16, 0, 0));
    expect(cycleKeyFor(t, "daily", UTC, 1)).toBe("2026-04-17");
    expect(cycleKeyFor(t, "daily", CN, 1)).toBe("2026-04-18");
  });

  test("monthly returns YYYY-MM", () => {
    const t = new Date(Date.UTC(2026, 3, 17, 6, 30));
    expect(cycleKeyFor(t, "monthly", UTC, 1)).toBe("2026-04");
  });

  test("weekly formats YYYY-Www with configured week-start", () => {
    // 2026-04-17 is a Friday (ISO).
    const friday = new Date(Date.UTC(2026, 3, 17, 12, 0));
    expect(cycleKeyFor(friday, "weekly", UTC, 1)).toMatch(/^2026-W\d\d$/);
    // Changing weekStartsOn changes the anchor — both Friday week
    // numbers should still land in the same year.
    expect(cycleKeyFor(friday, "weekly", UTC, 0)).toMatch(/^2026-W\d\d$/);
  });

  test("all_time returns 'all'", () => {
    expect(
      cycleKeyFor(new Date(), "all_time", UTC, 1),
    ).toBe("all");
  });
});

describe("leaderboard/time.previousCycleKey", () => {
  test("daily returns yesterday", () => {
    const t = new Date(Date.UTC(2026, 3, 17, 10));
    expect(previousCycleKey(t, "daily", UTC, 1)).toBe("2026-04-16");
  });

  test("monthly returns previous month, handling year rollover", () => {
    const t = new Date(Date.UTC(2026, 0, 5));
    expect(previousCycleKey(t, "monthly", UTC, 1)).toBe("2025-12");
  });

  test("all_time has no previous cycle", () => {
    expect(previousCycleKey(new Date(), "all_time", UTC, 1)).toBeNull();
  });
});

describe("leaderboard/time.cycleIsDue", () => {
  test("is due after the cycle rolled over", () => {
    // yesterday's key is due today
    const now = new Date(Date.UTC(2026, 3, 17, 1));
    expect(cycleIsDue(now, "2026-04-16", "daily", UTC, 1)).toBe(true);
    expect(cycleIsDue(now, "2026-04-17", "daily", UTC, 1)).toBe(false);
  });

  test("all_time never due", () => {
    const now = new Date();
    expect(cycleIsDue(now, "all", "all_time", UTC, 1)).toBe(false);
  });
});

describe("leaderboard/time.toNaturalDate", () => {
  test("respects timezone offset across day boundary", () => {
    const t = new Date(Date.UTC(2026, 3, 17, 16, 30));
    expect(toNaturalDate(t, "UTC")).toBe("2026-04-17");
    expect(toNaturalDate(t, "Asia/Shanghai")).toBe("2026-04-18");
    expect(toNaturalDate(t, "America/Los_Angeles")).toBe("2026-04-17");
  });
});
