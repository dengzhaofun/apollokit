/**
 * Pure time helpers for the assist-pool module.
 *
 * `expiresInSeconds` is stored on the config; instance-level `expiresAt`
 * is computed once at `createInstance` time (instance lifetime does
 * not shift if the admin later edits the config).
 */

export function computeExpiresAt(now: Date, expiresInSeconds: number): Date {
  return new Date(now.getTime() + expiresInSeconds * 1000);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
