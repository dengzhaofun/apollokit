/**
 * Unified server-SDK error class.
 *
 * Every business endpoint returns the standard envelope
 *   { code, data, message, requestId }
 * (see `apps/server/src/lib/response.ts`). Successful responses use
 * `code: "ok"` and the payload in `data`. Errors carry the
 * module-specific code (e.g. `check_in.config_not_found`) at HTTP 4xx,
 * `validation_error` at HTTP 400, or `internal_error` at HTTP 500.
 *
 * The hey-api-generated SDK exposes the raw envelope on error responses;
 * users who want a thrown-error API call `throwOnError: true` per call,
 * or wrap calls in `unwrap()` (see `client.ts`) which re-throws as
 * `ApolloKitApiError` so error handling is one shape regardless of
 * which generated function failed.
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
 * Type guard that checks whether an unknown response body looks like
 * the standard envelope. Used by `unwrap()` and downstream consumers
 * that hand-build error handlers.
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
