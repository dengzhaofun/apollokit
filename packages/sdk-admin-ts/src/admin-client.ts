/**
 * ApolloKit Admin SDK wrapper.
 *
 * Configures the generated hey-api client with:
 * - ak_ admin API key injection (x-api-key header)
 */

import { client } from "./generated/client.gen.js";

export interface ApolloKitAdminConfig {
  /** Server base URL (e.g. "https://api.example.com") */
  baseUrl: string;
  /** Admin API key (ak_ prefix) */
  apiKey: string;
}

/**
 * Initialize the apollokit admin SDK.
 *
 * Call this once at app startup before making any API calls.
 */
export function createAdminClient(
  config: ApolloKitAdminConfig,
): typeof client {
  client.setConfig({ baseUrl: config.baseUrl });

  // Inject x-api-key header on every request
  client.interceptors.request.use((request) => {
    request.headers.set("x-api-key", config.apiKey);
    return request;
  });

  return client;
}

export { client };
