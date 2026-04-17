/**
 * Simple-interest projection for storage-box deposits.
 *
 * Pure function. No clock, no database. Caller supplies `from` and `to`.
 *
 *   interest = floor( principal * rateBps / 10_000 * elapsedMs / periodMs )
 *
 * - `rateBps` is basis points — 100 = 1%, 10_000 = 100%.
 * - `periodDays` is the number of days over which `rateBps` applies,
 *   e.g. periodDays=365 + rateBps=300 means 3% per year.
 * - elapsed is clamped at ≥ 0 so that `to < from` yields 0, not a
 *   negative balance.
 */
export function projectInterest(
  principal: number,
  rateBps: number,
  periodDays: number,
  from: Date,
  to: Date,
): number {
  if (principal <= 0 || rateBps <= 0 || periodDays <= 0) return 0;
  const elapsedMs = to.getTime() - from.getTime();
  if (elapsedMs <= 0) return 0;
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const raw = (principal * rateBps * elapsedMs) / (10_000 * periodMs);
  return Math.floor(raw);
}
