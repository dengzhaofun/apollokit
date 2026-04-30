/**
 * ApolloKit Server SDK wrapper.
 *
 * Configures the hey-api-generated client with:
 * - `ak_` admin API key injection (`x-api-key` header)
 * - exponential-backoff retry on 429 / 5xx (idempotent methods only)
 *
 * Server SDK is for trusted server-to-server calls only — admin API
 * keys carry full org-level authority and must NEVER ship in browser
 * bundles or game clients. For that case install `@apollokit/client`
 * instead (publishable key + HMAC).
 *
 * Generated services are class-based (one class per OpenAPI tag, e.g.
 * `BadgeAdminService`, `CharacterService`). Adding a new module on the
 * server with a new tag automatically produces a new service class on
 * the next codegen run — this wrapper does not need to change.
 */

import {
  createRetryInterceptor,
  type RetryOptions,
} from "@repo/sdk-core";

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
  /**
   * Retry options for transient failures. Pass `false` to disable
   * retries entirely. Defaults: 3 attempts, exponential backoff,
   * idempotent methods (GET/HEAD/OPTIONS) only.
   */
  retry?: RetryOptions | false;
}

/**
 * Initialize the apollokit server SDK. Call once at process startup.
 *
 * Returns the underlying hey-api `Client` so callers can pass it as the
 * `client` option to any generated function for explicit threading.
 * The default import-bound `client` is also configured by this call,
 * so most callers don't need to thread it through.
 */
export function createServerClient(
  config: ApolloKitServerConfig,
): typeof client {
  client.setConfig({ baseUrl: config.baseUrl });

  // Inject `x-api-key: ak_…` on every request. The middleware
  // `apps/server/src/middleware/require-admin-or-api-key.ts:30` reads
  // this exact header — Authorization/Bearer is NOT accepted.
  client.interceptors.request.use((request) => {
    request.headers.set("x-api-key", config.apiKey);
    return request;
  });

  if (config.retry !== false) {
    const retryInterceptor = createRetryInterceptor(
      config.retry === undefined ? {} : config.retry,
    );
    client.interceptors.response.use(retryInterceptor);
  }

  return client;
}

export { client };
