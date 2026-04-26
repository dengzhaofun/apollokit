/**
 * Command palette open-state shared between the sidebar's search button
 * and the global `<CommandPalette>` dialog. The palette is mounted once
 * in `_dashboard.tsx`, the sidebar search button calls `setOpen(true)` to
 * open it, and the cmd+K listener inside the palette toggles it too.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

type CommandPaletteContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])
  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  }
  return ctx
}
