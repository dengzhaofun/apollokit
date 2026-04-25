/**
 * Thin HTTP client for the server's `/api/*` business routes.
 *
 * Every business endpoint returns the standard envelope:
 *   { code: string, data: T | null, message: string, requestId: string }
 *
 * This wrapper unwraps `.data` on success, so hooks and routes can
 * stay on their original typings — e.g. `useQuery` still receives the
 * resource object / `{ items }` list, not the envelope.
 *
 * Errors are normalized into `ApiError` whose `body.error` mirrors the
 * envelope's `message` for backward compatibility (dozens of existing
 * toast call sites read `err.body.error`). New code can prefer
 * `err.message`, `err.code`, or `err.requestId` directly.
 *
 * NOTE: Better Auth (`/api/auth/*`) uses its own client in
 * `lib/auth-client.ts` and does NOT go through this wrapper — so the
 * envelope assumption is safe here.
 */

// Same-origin: prod admin worker forwards `/api/*` via service binding;
// dev vite proxies `/api/*` to localhost:8787. Either way, an empty
// base means `fetch("/api/...")` works in both worlds.
const BASE_URL = ""

type ApiErrorBody = {
  /** Backward-compat alias for `message`. */
  error: string
  code: string
  message: string
  requestId: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message || body.error)
    this.name = "ApiError"
  }

  get code(): string {
    return this.body.code
  }

  get requestId(): string {
    return this.body.requestId
  }
}

type SuccessEnvelope<T> = {
  code: "ok"
  data: T | null
  message: string
  requestId: string
}

type ErrorEnvelope = {
  code: string
  data: null
  message: string
  requestId: string
}

type AnyEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope

function isEnvelope(value: unknown): value is AnyEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    "requestId" in value
  )
}

function toErrorBody(status: number, parsed: unknown): ApiErrorBody {
  if (isEnvelope(parsed)) {
    return {
      error: parsed.message,
      code: parsed.code,
      message: parsed.message,
      requestId: parsed.requestId,
    }
  }
  // Fallback for non-envelope error bodies (e.g. unexpected 5xx from a
  // proxy, or legacy endpoint that slipped through). Preserve whatever
  // text/JSON we got so the toast still shows something useful.
  const fallbackMessage =
    typeof parsed === "string"
      ? parsed
      : parsed && typeof parsed === "object" && "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Request failed with status ${status}`
  return {
    error: fallbackMessage,
    code: "http_error",
    message: fallbackMessage,
    requestId: "",
  }
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  const parsed = await parseBody(res)

  if (!res.ok) {
    throw new ApiError(res.status, toErrorBody(res.status, parsed))
  }

  if (parsed === undefined) {
    return undefined as T
  }

  // Unwrap envelope; non-envelope responses (shouldn't happen after
  // the server-side migration, but just in case) fall through as-is.
  if (isEnvelope(parsed)) {
    return parsed.data as T
  }
  return parsed as T
}

/**
 * Resolve a possibly-relative URL returned by the server into an
 * absolute URL browsers can load. Assets whose public URL is a CDN
 * domain come back absolute already; the worker-proxy fallback
 * returns `/api/media-library/object/...` which needs the server base.
 */
export function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${BASE_URL}${url.startsWith("/") ? url : `/${url}`}`
}

async function uploadFormData<T>(
  path: string,
  form: FormData,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  })

  const parsed = await parseBody(res)

  if (!res.ok) {
    throw new ApiError(res.status, toErrorBody(res.status, parsed))
  }

  if (parsed === undefined) {
    return undefined as T
  }
  if (isEnvelope(parsed)) {
    return parsed.data as T
  }
  return parsed as T
}

export const api = {
  get<T>(path: string) {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    })
  },
  patch<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: "PATCH",
      body: body != null ? JSON.stringify(body) : undefined,
    })
  },
  put<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    })
  },
  delete(path: string) {
    return request<void>(path, { method: "DELETE" })
  },
  upload<T>(path: string, form: FormData) {
    return uploadFormData<T>(path, form)
  },
}
