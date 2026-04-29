import * as React from "react"

import type { MentionResult } from "./mention-types"

const SEARCH_ENDPOINT = "/api/ai/admin/mentions/search"
const DEBOUNCE_MS = 200

/**
 * Search mentionable resources matching `q`, optionally restricted to
 * `types` (no value = all registered types).
 *
 * Behavior:
 *   - Debounces 200ms after `q`/`types` change to avoid hammering the
 *     server on every keystroke.
 *   - Cancels in-flight requests via AbortController when the inputs
 *     change again — the older response would be stale anyway.
 *   - When `enabled` is false (popover closed), nothing is fetched and
 *     state is reset.
 *
 * Returns `{results, isLoading, error}` for the popover to render.
 */
export function useMentionSearch({
  q,
  types,
  enabled,
  limit = 8,
}: {
  q: string
  types?: readonly string[]
  enabled: boolean
  limit?: number
}): {
  results: MentionResult[]
  isLoading: boolean
  error: Error | null
} {
  const [results, setResults] = React.useState<MentionResult[]>([])
  const [isLoading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)

  // Stable types-key for dependency: arrays change reference on every
  // render even when content is the same.
  const typesKey = React.useMemo(
    () => (types && types.length > 0 ? [...types].sort().join(",") : ""),
    [types],
  )

  React.useEffect(() => {
    if (!enabled) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (typesKey) params.set("types", typesKey)
      params.set("limit", String(limit))

      setLoading(true)
      fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`mentions/search ${res.status}`)
          const json = (await res.json()) as { results: MentionResult[] }
          setResults(json.results)
          setError(null)
          setLoading(false)
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, typesKey, enabled, limit])

  return { results, isLoading, error }
}
