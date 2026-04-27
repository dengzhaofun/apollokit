/**
 * Detect Postgres `unique_violation` (SQLSTATE 23505) across driver quirks.
 *
 * `neon-http` and `postgres-js` both surface the SQLSTATE on the thrown
 * error, but at different paths: sometimes `err.code`, sometimes
 * `err.cause.code`, and the error message can also stringify the code.
 * We probe all three so callers don't need to know which driver wrapped
 * the error this time.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === "23505") return true;
  if (e.cause && typeof e.cause === "object" && e.cause.code === "23505")
    return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.includes("23505");
}
