/**
 * ApolloKit Server SDK wrapper.
 *
 * Configures the hey-api-generated client with:
 * - `ak_` admin API key injection (`x-api-key` header)
 *
 * Server SDK is for trusted server-to-server calls only — admin API
 * keys carry full org-level authority and must NEVER ship in browser
 * bundles or game clients. For that use case install
 * `@apollokit/client` instead (publishable key + HMAC).
 *
 * Mirrors the shape of `@apollokit/client`: thin wrapper around the
 * generated `client`, no opinionated unwrap helper. Callers reach for
 * generated functions directly and pull `.data` from the standard
 * envelope themselves — see `examples/smoke.ts` and the README.
 */

import { client } from "./generated/client.gen.js";

export interface ApolloKitServerConfig {
  /** Server base URL (e.g. "https://api.example.com"). */
  baseUrl: string;
  /**
   * Admin API key (`ak_…` prefix) issued from the dashboard's
   * `/api-keys` page or via `POST /api/auth/api-key` (configId=`admin`).
   * Carries full organization-level authority.
   */
  apiKey: string;
}

/**
 * Initialize the apollokit server SDK. Call once at process startup.
 *
 * Returns the underlying hey-api `Client` so callers can pass it as the
 * `client` option to any generated function for explicit threading.
 * The default import-bound `client` is also configured by this call,
 * so most callers don't need to thread it through.
 */
export function createServerClient(config: ApolloKitServerConfig): typeof client {
  client.setConfig({ baseUrl: config.baseUrl });

  // Inject `x-api-key: ak_…` on every request. The middleware
  // `apps/server/src/middleware/require-admin-or-api-key.ts:30` reads
  // this exact header — Authorization/Bearer is NOT accepted.
  client.interceptors.request.use((request) => {
    request.headers.set("x-api-key", config.apiKey);
    return request;
  });

  return client;
}

export { client };
