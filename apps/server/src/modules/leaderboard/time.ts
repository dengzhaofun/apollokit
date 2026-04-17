/**
 * Pure time utilities for leaderboard cycle math.
 *
 * Like `modules/check-in/time.ts`, these functions use only
 * `Intl.DateTimeFormat`. The two modules have separate files because
 * their cycle vocabularies differ (check-in: none/week/month;
 * leaderboard: daily/weekly/monthly/all_time) and the historical
 * cycleKey format for check-in's `none` is `"all"`, which doesn't
 * make sense for a leaderboard that wants to distinguish a single
 * `2026-04-17` bucket.
 *
 * All public functions take already-normalized "natural date" strings
 * (`YYYY-MM-DD`) or `Date` objects. No hidden timezone state.
 */

import type { CycleMode } from "./types";

export function toNaturalDate(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function parseNaturalDate(s: string): {
  year: number;
  month: number;
  day: number;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid natural date: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Ordinal week of the week-start's year. See `modules/check-in/time.ts`
 * for the rationale against ISO-8601 — we honor the tenant's configured
 * `weekStartsOn` rather than forcing Monday-anchored numbering.
 */
function weekKey(dateStr: string, weekStartsOn: number): string {
  const { year, month, day } = parseNaturalDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  const backoff = (dow - weekStartsOn + 7) % 7;
  const weekStart = new Date(utc.getTime() - backoff * 86_400_000);
  const wsYear = weekStart.getUTCFullYear();
  const yearStart = Date.UTC(wsYear, 0, 1);
  const daysSinceYearStart = Math.floor(
    (weekStart.getTime() - yearStart) / 86_400_000,
  );
  const weekNum = Math.floor(daysSinceYearStart / 7) + 1;
  return `${wsYear}-W${String(weekNum).padStart(2, "0")}`;
}

export function cycleKeyFor(
  now: Date,
  cycle: CycleMode,
  timezone: string,
  weekStartsOn: number,
): string {
  const today = toNaturalDate(now, timezone);
  switch (cycle) {
    case "daily":
      return today;
    case "weekly":
      return weekKey(today, weekStartsOn);
    case "monthly": {
      const { year, month } = parseNaturalDate(today);
      return `${year}-${String(month).padStart(2, "0")}`;
    }
    case "all_time":
      return "all";
  }
}

/**
 * Compute the most-recently-ended cycleKey as of `now`. Used by the
 * settlement cron to decide what to close.
 *
 * Implementation: subtract 1 day / 1 week / 1 month and re-run
 * `cycleKeyFor`. For `all_time`, there is no prior cycle — returns
 * null to signal "never settle".
 */
export function previousCycleKey(
  now: Date,
  cycle: CycleMode,
  timezone: string,
  weekStartsOn: number,
): string | null {
  if (cycle === "all_time") return null;

  // Work in the target timezone's natural day.
  const today = toNaturalDate(now, timezone);
  const { year, month, day } = parseNaturalDate(today);

  switch (cycle) {
    case "daily": {
      const d = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
      const yesterday = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      return yesterday;
    }
    case "weekly": {
      const d = new Date(Date.UTC(year, month - 1, day) - 7 * 86_400_000);
      const prevDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      return weekKey(prevDate, weekStartsOn);
    }
    case "monthly": {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    }
  }
}

/**
 * True iff the cycle key that's current at `now` has advanced past
 * the given `cycleKey` — i.e., this cycle is ripe for settlement.
 */
export function cycleIsDue(
  now: Date,
  cycleKey: string,
  cycle: CycleMode,
  timezone: string,
  weekStartsOn: number,
): boolean {
  if (cycle === "all_time") return false;
  const currentKey = cycleKeyFor(now, cycle, timezone, weekStartsOn);
  return currentKey !== cycleKey;
}
