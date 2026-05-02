/**
 * Offline-check-in module barrel.
 *
 * Glues:
 *   - `deps` (db + events) from the AppDeps singleton.
 *   - `itemService`, `currencyService`, `entityService` for reward dispatch.
 *   - `env.KV` from the wrangler binding for one-time-token / manual-code
 *     storage. Wrapped via `createKvNonceStore` so the service layer
 *     depends on a tiny interface, not on `cloudflare:workers` directly.
 *
 * The lazy KV wrapper mirrors the storage / analytics pattern in
 * `deps.ts`: KV access only happens when a verifier needs it, so
 * importing this module under drizzle-kit / vitest doesn't fail.
 */

import { env } from "cloudflare:workers";

import { deps } from "../../deps";
import { currencyService } from "../currency";
import { entityService } from "../entity";
import { itemService } from "../item";
import { createKvNonceStore, type NonceStore, type KVLike } from "./nonce-store";
import { createOfflineCheckInService } from "./service";

export { createOfflineCheckInService };
export type { OfflineCheckInService } from "./service";

// Lazy KV → NonceStore: structurally subset of KVNamespace so the
// in-memory shim used by vitest works just as well.
function lazyNonceStore(): NonceStore {
  let cached: NonceStore | null = null;
  function resolve() {
    if (!cached) {
      const kv = (env as { KV?: KVLike }).KV;
      if (!kv) {
        throw new Error(
          "[offline-check-in] env.KV binding is not available — cannot run QR / manual-code verifiers",
        );
      }
      cached = createKvNonceStore(kv);
    }
    return cached;
  }
  return {
    mintOneTimeToken: (...args) => resolve().mintOneTimeToken(...args),
    consumeOneTimeToken: (...args) => resolve().consumeOneTimeToken(...args),
    getActiveManualCode: (...args) => resolve().getActiveManualCode(...args),
    setManualCode: (...args) => resolve().setManualCode(...args),
  };
}

export const offlineCheckInService = createOfflineCheckInService(
  deps,
  {
    itemSvc: itemService,
    currencySvc: currencyService,
    entitySvc: entityService,
  },
  lazyNonceStore(),
);

export { offlineCheckInRouter } from "./routes";
export { offlineCheckInClientRouter } from "./client-routes";
