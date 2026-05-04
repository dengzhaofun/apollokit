/**
 * Calendar-month helpers for MAU tracking.
 *
 * MAU buckets are UTC-keyed: a player active at any UTC moment in
 * May 2026 counts towards the May 2026 bucket regardless of their
 * own timezone. This is the simplest defensible billing rule —
 * per-tenant timezones would mean billing-period boundaries shift
 * by tenant, which makes invoice reconciliation painful.
 */

/**
 * Returns "YYYY-MM" for the given instant in UTC. Used as the
 * partition key for `mau_active_player.year_month` and as part of
 * the KV bloom-filter key.
 */
export function currentYearMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Returns the previous calendar month's "YYYY-MM" relative to `now`.
 * Used by the month-1 cron to snapshot the just-finished period.
 */
export function previousYearMonth(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  return currentYearMonth(d);
}

/**
 * Returns the first day (UTC midnight) of the month identified by
 * a "YYYY-MM" key, as a Date. Used to populate
 * `mau_snapshot.period_start`.
 */
export function periodStartFromYearMonth(yearMonth: string): Date {
  const [yStr, mStr] = yearMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`invalid yearMonth: ${yearMonth}`);
  }
  return new Date(Date.UTC(y, m - 1, 1));
}
