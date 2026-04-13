/**
 * ApolloKit Client SDK wrapper.
 *
 * Configures the generated hey-api client with:
 * - cpk_ publishable key injection (x-api-key header)
 * - HMAC-SHA256 signing for endUserId verification
 *
 * Two modes of operation:
 * - Server-side: provide `secret` — SDK computes HMAC automatically
 * - Browser-side: omit `secret` — caller must pass pre-computed `userHash`
 *   (the secret must never be exposed in client-side bundles)
 */

import { client } from "./generated/client.gen.js";
import { computeHmac } from "./hmac.js";

export interface ApolloKitClientConfig {
  /** Server base URL (e.g. "https://api.example.com") */
  baseUrl: string;
  /** Client publishable key (cpk_ prefix) */
  publishableKey: string;
  /**
   * Client secret (csk_ prefix). Only use in server-side / trusted environments.
   * When provided, the SDK computes HMAC automatically for each request.
   * Never include this in browser bundles.
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

  // Inject x-api-key header on every request
  client.interceptors.request.use((request) => {
    request.headers.set("x-api-key", config.publishableKey);
    return request;
  });

  return client;
}

/**
 * Compute a userHash for a given endUserId.
 *
 * Use this when operating in server-side mode (secret available)
 * to pre-compute hashes that can be passed to browser clients.
 */
export async function signEndUser(
  endUserId: string,
  secret: string,
): Promise<string> {
  return computeHmac(endUserId, secret);
}

export { client };
