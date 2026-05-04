/**
 * Bloom filter for the MAU hot path.
 *
 * Purpose: skip the Postgres `INSERT … ON CONFLICT DO NOTHING` for
 * the >99% of authenticated end-user requests where the player has
 * already been seen this month. Reading a 2 KiB blob from
 * `apollokit-kv` is a single-digit-ms call cached at the edge; an
 * unnecessary PG round-trip costs an order of magnitude more.
 *
 * Filter parameters
 * -----------------
 *   m = 16384 bits (2 KiB)
 *   k = 3 hashes
 *
 * For ~10 k unique players per (team, month) the false-positive
 * rate is ≈ (1 - exp(-3·10000/16384))^3 ≈ 11 % — high, but the
 * direction of error matters: a false positive means we *skip* the
 * PG insert (assume already seen), so we can only **undercount**
 * players, never double-count. Undercounting biases towards
 * customer-friendly billing, which is the explicit product call.
 *
 * For tighter accuracy on hot teams, scale `BLOOM_BITS` up — KV
 * value cap is 25 MiB, so even 1 MB (~5 M players at <1 % FPR)
 * fits trivially. We start small to keep the read cost down on the
 * common case; revisit when a hot tenant breaches the FPR target.
 *
 * Race semantics
 * --------------
 * Two concurrent first-time activations for player A both read
 * bloom = unset, both PG-insert (the second hits ON CONFLICT DO
 * NOTHING), both write bloom = set. The KV "last writer wins"
 * model means a *different* player B's bit might be lost when A
 * and B race; B's next request will see bloom = unset, hit PG,
 * find their row already exists, and re-write the bloom. Bloom
 * never lies in the "false negative" direction (a bit doesn't
 * spontaneously clear), so worst case is one extra PG round-trip.
 *
 * Hash construction: SHA-256 of the eu_user_id, sliced into three
 * 4-byte big-endian uint32s, mod `BLOOM_BITS`. Three independent-
 * looking 32-bit numbers from one digest is the standard "double
 * hashing" technique except we have plenty of bits in a SHA-256
 * output to just take three slices directly.
 */

export const BLOOM_BITS = 16_384;
export const BLOOM_BYTES = BLOOM_BITS / 8;
export const HASH_COUNT = 3;

/**
 * KV key for the (team, year_month) bloom blob. Prefixed `mau:` so
 * a future ops sweep of stale entries can `kv:list --prefix mau:`
 * without colliding with Better Auth's `auth:` keys in the same
 * namespace.
 */
export function bloomKey(teamId: string, yearMonth: string): string {
  return `mau:bloom:${teamId}:${yearMonth}`;
}

/**
 * Compute the three bit positions for a given eu_user_id. SHA-256
 * is plenty fast on Workers — single-digit microseconds per call —
 * and removes the need for a non-cryptographic hash dependency.
 */
export async function hashPositions(euUserId: string): Promise<number[]> {
  const bytes = new TextEncoder().encode(euUserId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new DataView(digest);
  const positions: number[] = [];
  for (let i = 0; i < HASH_COUNT; i++) {
    // Each uint32 occupies 4 bytes; SHA-256 has 32 bytes so we
    // can fit up to 8 hashes without slicing the same window twice.
    const u32 = view.getUint32(i * 4, false);
    positions.push(u32 % BLOOM_BITS);
  }
  return positions;
}

/**
 * Returns true iff every position bit is set in the given blob.
 * `null` (no blob ever written) returns false — must hit PG.
 */
export function bloomCheck(
  buf: ArrayBuffer | null,
  positions: number[],
): boolean {
  if (!buf || buf.byteLength !== BLOOM_BYTES) return false;
  const bytes = new Uint8Array(buf);
  for (const pos of positions) {
    const byteIdx = pos >>> 3;
    const bitIdx = pos & 7;
    if ((bytes[byteIdx]! & (1 << bitIdx)) === 0) return false;
  }
  return true;
}

/**
 * Returns a NEW ArrayBuffer with the requested bits set, copied
 * from `buf` (or zero-initialized if `buf` is null / wrong size).
 *
 * Returning a fresh buffer keeps callers from accidentally
 * mutating a shared object while the KV.put is in flight.
 */
export function bloomSet(
  buf: ArrayBuffer | null,
  positions: number[],
): ArrayBuffer {
  const out = new Uint8Array(BLOOM_BYTES);
  if (buf && buf.byteLength === BLOOM_BYTES) {
    out.set(new Uint8Array(buf));
  }
  for (const pos of positions) {
    const byteIdx = pos >>> 3;
    const bitIdx = pos & 7;
    out[byteIdx]! |= 1 << bitIdx;
  }
  return out.buffer;
}
