/**
 * Shared retry middleware for `@hey-api/client-fetch` interceptors.
 *
 * Both `@apollokit/server` and `@apollokit/client` install this in their
 * `createServerClient` / `createClient` so transient `429` and `5xx`
 * responses are automatically retried with exponential backoff. The
 * middleware is conservative — only safe (idempotent) HTTP methods are
 * retried unless the caller opts in via `retryAllMethods: true`.
 *
 * The interceptor signature mirrors `@hey-api/client-fetch`:
 *   (response, request, options) => Response | Promise<Response>
 *
 * Plug in like:
 *   client.interceptors.response.use(
 *     createRetryInterceptor({ maxAttempts: 3 }),
 *   );
 */

export interface RetryOptions {
  /** Total attempts including the first call. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default 250. */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default 4000. */
  maxDelayMs?: number;
  /**
   * Retry non-idempotent methods (POST/PATCH) too. Default false — the
   * server may have already applied side effects, so retrying a POST is
   * generally unsafe unless the endpoint is idempotent.
   */
  retryAllMethods?: boolean;
  /** Override which status codes trigger a retry. Default [429, 502, 503, 504]. */
  retryStatuses?: ReadonlyArray<number>;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_RETRY_STATUSES = [429, 502, 503, 504] as const;

function backoffDelay(attempt: number, base: number, cap: number): number {
  const exp = base * 2 ** (attempt - 1);
  const jitter = Math.random() * base;
  return Math.min(cap, exp + jitter);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export type RetryInterceptor = (
  response: Response,
  request: Request,
) => Promise<Response>;

export function createRetryInterceptor(
  options: RetryOptions = {},
): RetryInterceptor {
  const {
    maxAttempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    retryAllMethods = false,
    retryStatuses = DEFAULT_RETRY_STATUSES,
  } = options;
  const statuses = new Set(retryStatuses);

  return async (response, request) => {
    if (response.ok || !statuses.has(response.status)) return response;
    if (!retryAllMethods && !SAFE_METHODS.has(request.method.toUpperCase())) {
      return response;
    }

    let lastResponse = response;
    for (let attempt = 1; attempt < maxAttempts; attempt++) {
      const retryAfterMs =
        parseRetryAfter(lastResponse.headers.get("retry-after")) ??
        backoffDelay(attempt, baseDelayMs, maxDelayMs);
      await new Promise((r) => setTimeout(r, retryAfterMs));
      lastResponse = await fetch(request.clone());
      if (lastResponse.ok || !statuses.has(lastResponse.status)) {
        return lastResponse;
      }
    }
    return lastResponse;
  };
}
