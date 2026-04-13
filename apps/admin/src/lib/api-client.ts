const BASE_URL =
  import.meta.env.VITE_AUTH_SERVER_URL ?? "http://localhost:8787"

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string; code?: string },
  ) {
    super(body.error)
    this.name = "ApiError"
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

  if (res.status === 204) return undefined as T

  const body = await res.json()

  if (!res.ok) {
    throw new ApiError(res.status, body)
  }

  return body as T
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
  delete(path: string) {
    return request<void>(path, { method: "DELETE" })
  },
}
