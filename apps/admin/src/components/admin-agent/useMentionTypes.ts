import * as React from "react"

import type { MentionType } from "./mention-types"

const TYPES_ENDPOINT = "/api/ai/admin/mentions/types"

/**
 * Module-level cache: the registry rarely changes during a tab's
 * lifetime. The endpoint is also cheap (in-memory map reflection on the
 * server), but we still avoid hammering it on every panel mount.
 */
let cachedPromise: Promise<MentionType[]> | null = null

function fetchTypes(): Promise<MentionType[]> {
  if (!cachedPromise) {
    cachedPromise = fetch(TYPES_ENDPOINT, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`mentions/types ${res.status}`)
        const json = (await res.json()) as { types: MentionType[] }
        return json.types
      })
      .catch((err) => {
        // Reset cache so a transient failure doesn't permanently disable
        // the popover for this tab.
        cachedPromise = null
        throw err
      })
  }
  return cachedPromise
}

/**
 * Pull the mention type registry once per tab. Returns `[]` while loading
 * — the popover degrades gracefully (no tabs visible) until types arrive.
 *
 * Does NOT use React Query / SWR to avoid pulling in a cache library just
 * for one nearly-static endpoint.
 */
export function useMentionTypes(): {
  types: MentionType[]
  isLoading: boolean
  error: Error | null
} {
  const [types, setTypes] = React.useState<MentionType[]>([])
  const [isLoading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    let alive = true
    fetchTypes()
      .then((t) => {
        if (alive) {
          setTypes(t)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  return { types, isLoading, error }
}
