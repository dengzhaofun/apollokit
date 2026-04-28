/**
 * ApolloKit Client SDK wrapper.
 *
 * Configures the generated hey-api client with:
 * - cpk_ publishable key injection (x-api-key header)
 * - HMAC-SHA256 signing for endUserId verification (auto-computed when
 *   `secret` is configured and the caller supplies x-end-user-id)
 *
 * Two modes of operation:
 * - **Server-side / Node**: provide `secret`. SDK installs an async
 *   request interceptor that, on every call carrying x-end-user-id but
 *   no x-user-hash, signs the id with `csk_` and injects the hash. The
 *   caller writes `headers: { 'x-end-user-id': uid }` and forgets HMAC
 *   exists — equivalent to plan §1's `withUser(uid)` ergonomics
 *   without a separate proxy API.
 * - **Browser-side**: omit `secret`. The caller (typically your own
 *   game's frontend code) must pass a server-pre-signed `x-user-hash`
 *   header per request — `csk_` must never reach a browser bundle.
 *
 * The auto-HMAC interceptor is conservative: if the caller already
 * supplied `x-user-hash` it leaves it alone (lets you manually sign for
 * a different endUserId, or stub HMAC during tests). It also no-ops
 * when `x-end-user-id` is absent — public client routes (e.g.
 * announcement.active) work without an end user.
 */

import { client } from "./generated/client.gen.js";
import { computeHmac } from "./hmac.js";

export interface ApolloKitClientConfig {
  /** Server base URL (e.g. "https://api.example.com") */
  baseUrl: string;
  /** Client publishable key (cpk_ prefix) */
  publishableKey: string;
  /**
   * Client secret (csk_ prefix). Only use in server-side / trusted
   * environments. When provided, the SDK installs an interceptor that
   * automatically computes `x-user-hash` from the request's
   * `x-end-user-id` header. Never include this in browser bundles.
   */
  secret?: string;
}

/**
 * Initialize the apollokit client SDK.
 *
 * Call this once at app startup before making any API calls.
 */
export function createClient(config: ApolloKitClientConfig): typeof client {
  client.setConfig({ baseUrl: config.baseUrl });

  // 1. cpk_ injection — always.
  client.interceptors.request.use((request) => {
    request.headers.set("x-api-key", config.publishableKey);
    return request;
  });

  // 2. Auto-HMAC — only when secret is configured. The interceptor
  // signature in @hey-api/client-fetch supports `Promise<Request>`
  // returns, so the async crypto call here is safe.
  if (config.secret) {
    const secret = config.secret;
    client.interceptors.request.use(async (request) => {
      const endUserId = request.headers.get("x-end-user-id");
      const existingHash = request.headers.get("x-user-hash");
      if (endUserId && !existingHash) {
        const hash = await computeHmac(endUserId, secret);
        request.headers.set("x-user-hash", hash);
      }
      return request;
    });
  }

  return client;
}

/**
 * Compute a userHash for a given endUserId.
 *
 * Use this when:
 * - You're a backend issuing pre-signed credentials to a browser /
 *   Unity client (which can't hold `csk_`).
 * - You want to stub or override the auto-HMAC interceptor for a
 *   single request — pass `headers: { 'x-user-hash': await signEndUser(...) }`
 *   and the interceptor leaves it alone.
 */
export async function signEndUser(
  endUserId: string,
  secret: string,
): Promise<string> {
  return computeHmac(endUserId, secret);
}

export { client };
