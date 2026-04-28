/**
 * Unified client-SDK error class — mirrors `@apollokit/server`'s
 * `ApolloKitApiError` so consumers can handle errors with the same
 * shape regardless of which SDK they're using.
 *
 * Every `/api/client/*` business endpoint returns the standard
 * envelope `{ code, data, message, requestId }` (see
 * `apps/server/src/lib/response.ts`). Successful responses use
 * `code: "ok"`; errors carry the module-specific code (e.g.
 * `client.invalid_credential`, `validation_error`,
 * `internal_error`) at HTTP 4xx / 5xx.
 */

export interface ApolloKitErrorEnvelope {
  code: string;
  data: null;
  message: string;
  requestId: string;
}

export class ApolloKitApiError extends Error {
  /** Module-specific error code from the server envelope. */
  readonly code: string;
  /** HTTP status code (4xx / 5xx). */
  readonly status: number;
  /** Server-issued request id — paste into Tinybird trace lookup. */
  readonly requestId: string;

  constructor(envelope: ApolloKitErrorEnvelope, status: number) {
    super(envelope.message || envelope.code);
    this.name = "ApolloKitApiError";
    this.code = envelope.code;
    this.status = status;
    this.requestId = envelope.requestId;
  }
}

/**
 * Type guard for envelope shape detection. Use when manually handling
 * a hey-api result (`throwOnError: false` mode).
 */
export function isErrorEnvelope(value: unknown): value is ApolloKitErrorEnvelope {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    v.code !== "ok" &&
    typeof v.message === "string" &&
    typeof v.requestId === "string"
  );
}
