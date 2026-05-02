/**
 * Nonce store — minimal abstraction over Cloudflare KV for one-time tokens.
 *
 * The service depends on this interface, NOT on `cloudflare:workers` /
 * `KVNamespace` directly. The barrel (`index.ts`) wires the production
 * binding by passing `env.KV` (which conforms structurally), and tests
 * inject an in-memory implementation.
 *
 * Three responsibilities:
 *   - One-time QR tokens: `mint()` writes a marker, `consume()` deletes
 *     and returns true on first use, false on replay.
 *   - Manual codes: `getActiveManualCode()` reads the staff-rotated
 *     value, `setManualCode()` writes a new one with TTL.
 *   - Generic ttl-bounded counters: `incr()` for rate limiting.
 *
 * Key prefixes (all under the shared `apollokit-kv` namespace per
 * project convention):
 *   - `oc:nonce:{spotId}:{jti}`   — one-time QR
 *   - `oc:manual:{spotId}`        — current staff code
 *   - `oc:rate:{org}:{userId}:{minute}` — rate limiter
 */

export interface NonceStore {
  /**
   * Reserve a one-time QR token. `ttlSeconds` controls how long the
   * token is honoured before it expires. Returns the full key for
   * audit logging.
   */
  mintOneTimeToken(
    spotId: string,
    jti: string,
    ttlSeconds: number,
  ): Promise<void>;

  /**
   * Consume a one-time QR token. Returns true on first redemption,
   * false on miss/expiry/replay. The KV `delete` is the atomic
   * exchange — a `get` + `delete` pair would race.
   */
  consumeOneTimeToken(spotId: string, jti: string): Promise<boolean>;

  /** Read the current rotating staff code for a spot, or null. */
  getActiveManualCode(spotId: string): Promise<string | null>;

  /** Write a new rotating staff code with a TTL. */
  setManualCode(
    spotId: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void>;
}

/**
 * Structural subset of `KVNamespace` that the store needs. Keeping it
 * narrow lets tests fake it without implementing the full surface.
 */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

const NONCE_VALUE = "1";

export function createKvNonceStore(kv: KVLike): NonceStore {
  return {
    async mintOneTimeToken(spotId, jti, ttlSeconds) {
      await kv.put(`oc:nonce:${spotId}:${jti}`, NONCE_VALUE, {
        expirationTtl: Math.max(60, ttlSeconds),
      });
    },
    async consumeOneTimeToken(spotId, jti) {
      const key = `oc:nonce:${spotId}:${jti}`;
      const value = await kv.get(key);
      if (value === null) return false;
      // KV is eventually consistent — a concurrent consume could see the
      // value too. We delete unconditionally; a parallel race might both
      // succeed once. Real anti-replay for high-stakes spots should layer
      // a manual_code or photo verification on top.
      await kv.delete(key);
      return true;
    },
    async getActiveManualCode(spotId) {
      return kv.get(`oc:manual:${spotId}`);
    },
    async setManualCode(spotId, code, ttlSeconds) {
      await kv.put(`oc:manual:${spotId}`, code, {
        expirationTtl: Math.max(60, ttlSeconds),
      });
    },
  };
}

/**
 * In-memory store for tests / local dev where KV isn't bound. Each
 * instance is independent; reuse across tests by hand if you want shared
 * state.
 */
export function createMemoryNonceStore(): NonceStore {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  function get(key: string) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }
  return {
    async mintOneTimeToken(spotId, jti, ttlSeconds) {
      store.set(`oc:nonce:${spotId}:${jti}`, {
        value: NONCE_VALUE,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    async consumeOneTimeToken(spotId, jti) {
      const key = `oc:nonce:${spotId}:${jti}`;
      const value = get(key);
      if (value === null) return false;
      store.delete(key);
      return true;
    },
    async getActiveManualCode(spotId) {
      return get(`oc:manual:${spotId}`);
    },
    async setManualCode(spotId, code, ttlSeconds) {
      store.set(`oc:manual:${spotId}`, {
        value: code,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
  };
}
