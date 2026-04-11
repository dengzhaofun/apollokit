/**
 * Pure, dependency-free time utilities for the check-in module.
 *
 * These functions compute "natural day" and "cycle key" strings under a
 * given IANA timezone, using only `Intl.DateTimeFormat`. We intentionally
 * do NOT depend on `date-fns-tz` / `luxon` / `dayjs` — Cloudflare Workers
 * bundles everything that is imported, so every KB of date library
 * counts against cold start and CPU budget.
 *
 * Everything here operates on already-normalized `YYYY-MM-DD` strings or
 * plain `Date` instances. No hidden timezone state.
 */

import type { ResetMode } from "./types";

/**
 * Format a `Date` as `YYYY-MM-DD` in the given IANA timezone.
 *
 * `en-CA` locale is used because it happens to produce ISO-8601 date
 * output (`2026-04-11`) across all modern runtimes including V8 isolates.
 */
export function toNaturalDate(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/**
 * Parse a `YYYY-MM-DD` string into numeric parts. Throws on malformed
 * input — callers should only feed it values produced by `toNaturalDate`.
 */
function parseNaturalDate(s: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid natural date: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Compute the number of days between two `YYYY-MM-DD` strings, using UTC
 * midnight as an anchor. Because both inputs are already "wall-clock"
 * dates under the same timezone, UTC arithmetic gives the correct day
 * delta regardless of DST.
 */
function dayDiff(prev: string, next: string): number {
  const a = parseNaturalDate(prev);
  const b = parseNaturalDate(next);
  const ma = Date.UTC(a.year, a.month - 1, a.day);
  const mb = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((mb - ma) / 86_400_000);
}

/**
 * Returns true iff `next` is exactly one calendar day after `prev` in
 * the shared natural-date space. Does not care about hours/minutes —
 * both inputs are already day-precision.
 */
export function isConsecutiveDay(prev: string, next: string): boolean {
  return dayDiff(prev, next) === 1;
}

/**
 * Compute the ISO-style week-of-year key for a natural date, using
 * `weekStartsOn` to decide which day anchors the week.
 *
 * `weekStartsOn`: 0=Sun ... 6=Sat. We don't copy ISO-8601 week numbering
 * (which pins to Monday and has a "week 53 belongs to next year" rule)
 * because the tenant explicitly configures the week start — mixing ISO
 * rules on top would surprise people. Instead we use a simple ordinal:
 * number of full weeks since a fixed anchor, then format as `YYYY-WW`
 * using the year of the anchoring week-start day.
 */
function weekKey(dateStr: string, weekStartsOn: number): string {
  const { year, month, day } = parseNaturalDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay(); // 0=Sun ... 6=Sat
  // How many days back to the most recent week-start:
  const backoff = (dow - weekStartsOn + 7) % 7;
  const weekStart = new Date(utc.getTime() - backoff * 86_400_000);

  // Week number within the week-start's year: count full weeks since
  // Jan 1 of that year, inclusive of the first partial week.
  const wsYear = weekStart.getUTCFullYear();
  const yearStart = Date.UTC(wsYear, 0, 1);
  const daysSinceYearStart = Math.floor(
    (weekStart.getTime() - yearStart) / 86_400_000,
  );
  const weekNum = Math.floor(daysSinceYearStart / 7) + 1;

  return `${wsYear}-${String(weekNum).padStart(2, "0")}`;
}

/**
 * Compute the cycle key for a given natural date + reset mode.
 *
 * - `none`  → `'all'` (single sentinel cycle forever)
 * - `week`  → `YYYY-WW` (configurable week start)
 * - `month` → `YYYY-MM`
 */
export function cycleKeyFor(
  dateStr: string,
  mode: ResetMode,
  weekStartsOn: number,
): string {
  switch (mode) {
    case "none":
      return "all";
    case "month": {
      const { year, month } = parseNaturalDate(dateStr);
      return `${year}-${String(month).padStart(2, "0")}`;
    }
    case "week":
      return weekKey(dateStr, weekStartsOn);
  }
}
