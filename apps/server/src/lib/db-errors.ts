/**
 * Detect Postgres `unique_violation` (SQLSTATE 23505) across driver quirks.
 *
 * `node-postgres` surfaces the SQLSTATE at different paths depending on
 * how the error bubbles: sometimes `err.code`, sometimes `err.cause.code`,
 * and the error message can also stringify the code. We probe all three.
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
