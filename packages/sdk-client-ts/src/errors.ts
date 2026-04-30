/**
 * Re-exports the unified `ApolloKitApiError` from `@repo/sdk-core` so
 * server and client SDKs share one error class — `instanceof
 * ApolloKitApiError` works regardless of which SDK threw.
 *
 * Every `/api/client/*` business endpoint returns the standard envelope
 * `{ code, data, message, requestId }` (see
 * `apps/server/src/lib/response.ts`). Successful responses use
 * `code: "ok"`; errors carry the module-specific code (e.g.
 * `client.invalid_credential`, `validation_error`,
 * `internal_error`) at HTTP 4xx / 5xx.
 */

export {
  ApolloKitApiError,
  isApolloKitApiError,
  isErrorEnvelope,
} from "@repo/sdk-core";
export type { ApolloKitErrorEnvelope } from "@repo/sdk-core";
