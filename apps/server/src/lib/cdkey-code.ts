/**
 * Redemption-code string generator.
 *
 * Goals:
 *   - Human-readable: groups of 4 separated by '-' (e.g. ABCD-EFGH-IJKL-MNOP).
 *   - Unambiguous: avoids visually similar characters (0/O, 1/I/L).
 *   - Cryptographically random via Web Crypto (available in Workers).
 *
 * Alphabet is 32 characters so each byte's lower 5 bits maps cleanly.
 * Default length is 16 usable characters → 32^16 ≈ 10^24 space.
 * Uniqueness is still enforced by the (tenant_id, code) unique index;
 * collisions just retry.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 chars, no 0/1/I/L/O

/**
 * Generate a random code string of the given length, separated into groups
 * of 4 by '-'. `length` must be a multiple of 4 (default 16).
 */
export function generateCdkeyCode(length = 16): string {
  if (length <= 0 || length % 4 !== 0) {
    throw new Error("cdkey length must be a positive multiple of 4");
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! & 0x1f];
    if ((i + 1) % 4 === 0 && i < length - 1) out += "-";
  }
  return out;
}

/** Normalize a user-entered code: uppercase + strip whitespace. */
export function normalizeCdkeyCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Minimal well-formed check: non-empty after normalize, only contains our
 * alphabet characters and '-'. Does NOT check that the code exists — that
 * is the redeem path's job.
 */
export function isWellFormedCdkeyCode(raw: string): boolean {
  const s = normalizeCdkeyCode(raw);
  if (s.length === 0 || s.length > 256) return false;
  return /^[23456789A-HJ-NP-Z-]+$/.test(s);
}
