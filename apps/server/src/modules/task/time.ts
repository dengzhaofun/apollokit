/**
 * Pure, dependency-free time utilities for the task module.
 *
 * Computes period keys for lazy reset logic. Uses `Intl.DateTimeFormat`
 * only — no date library dependencies. Same approach as check-in/time.ts.
 */

import type { TaskPeriod } from "./types";

/**
 * Format a `Date` as `YYYY-MM-DD` in the given IANA timezone.
 */
function toNaturalDate(date: Date, timezone: string): string {
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
 * Compute the week key for a natural date, using `weekStartsOn` to
 * decide which day anchors the week.
 *
 * `weekStartsOn`: 0=Sun ... 6=Sat. Uses a simple ordinal — count full
 * weeks since a fixed anchor, then format as `YYYY-WW` using the year
 * of the anchoring week-start day.
 */
function weekKey(dateStr: string, weekStartsOn: number): string {
  const { year, month, day } = parseNaturalDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay(); // 0=Sun ... 6=Sat
  const backoff = (dow - weekStartsOn + 7) % 7;
  const weekStart = new Date(utc.getTime() - backoff * 86_400_000);

  const wsYear = weekStart.getUTCFullYear();
  const yearStart = Date.UTC(wsYear, 0, 1);
  const daysSinceYearStart = Math.floor(
    (weekStart.getTime() - yearStart) / 86_400_000,
  );
  const weekNum = Math.floor(daysSinceYearStart / 7) + 1;

  return `${wsYear}-${String(weekNum).padStart(2, "0")}`;
}

/**
 * Compute the period key for the given date + task period.
 *
 * - `'none'`    → `'none'` (permanent tasks, never resets)
 * - `'daily'`   → `'2026-04-16'`
 * - `'weekly'`  → `'2026-W16'` (configurable week start)
 * - `'monthly'` → `'2026-04'`
 */
export function computePeriodKey(
  period: TaskPeriod,
  timezone: string,
  weekStartsOn: number,
  now: Date,
): string {
  switch (period) {
    case "none":
      return "none";
    case "daily":
      return toNaturalDate(now, timezone);
    case "weekly": {
      const dateStr = toNaturalDate(now, timezone);
      return weekKey(dateStr, weekStartsOn);
    }
    case "monthly": {
      const dateStr = toNaturalDate(now, timezone);
      const { year, month } = parseNaturalDate(dateStr);
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }
}

/**
 * Returns true if the stored period key is stale relative to the current.
 */
export function isPeriodStale(
  storedKey: string,
  currentKey: string,
): boolean {
  return storedKey !== currentKey;
}
