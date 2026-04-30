/**
 * Re-exports the unified `ApolloKitApiError` from `@repo/sdk-core` so
 * server and client SDKs share one error class — `instanceof
 * ApolloKitApiError` works regardless of which SDK threw.
 *
 * Every business endpoint returns the standard envelope
 *   { code, data, message, requestId }
 * (see `apps/server/src/lib/response.ts`). Successful responses use
 * `code: "ok"` and the payload in `data`. Errors carry the
 * module-specific code (e.g. `check_in.config_not_found`) at HTTP 4xx,
 * `validation_error` at HTTP 400, or `internal_error` at HTTP 500.
 */

export {
  ApolloKitApiError,
  isApolloKitApiError,
  isErrorEnvelope,
} from "@repo/sdk-core";
export type { ApolloKitErrorEnvelope } from "@repo/sdk-core";
