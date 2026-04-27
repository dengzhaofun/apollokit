/**
 * Tracks whether an embedded AI chat panel (inside a Drawer/Page) is
 * currently open, so the global right-bottom FAB can hide itself and
 * we don't end up with two AI entry points on screen.
 *
 * A counter — not a boolean — because in the future we might have
 * nested or sibling Drawers; mount/unmount just increments and
 * decrements, never racing.
 */

import * as React from "react"

type AssistContextValue = {
  /** Number of currently-mounted embedded chat panels. */
  embeddedCount: number
  /** Returns a cleanup that decrements; call from useEffect. */
  registerEmbedded: () => () => void
}

const AssistContext = React.createContext<AssistContextValue | null>(null)

export function AssistProvider({ children }: { children: React.ReactNode }) {
  const [embeddedCount, setEmbeddedCount] = React.useState(0)

  const registerEmbedded = React.useCallback(() => {
    setEmbeddedCount((c) => c + 1)
    return () => setEmbeddedCount((c) => Math.max(0, c - 1))
  }, [])

  const value = React.useMemo(
    () => ({ embeddedCount, registerEmbedded }),
    [embeddedCount, registerEmbedded],
  )

  return <AssistContext.Provider value={value}>{children}</AssistContext.Provider>
}

export function useAssistContext(): AssistContextValue {
  const ctx = React.useContext(AssistContext)
  if (!ctx) {
    // Safe default — the global FAB still works without an AssistProvider
    // mounted, just can't auto-hide. Returning a noop registrar avoids
    // crashes during e.g. unit tests that don't wrap in the provider.
    return { embeddedCount: 0, registerEmbedded: () => () => {} }
  }
  return ctx
}
