import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Portals children into the layout-level header slot rendered by
 * `_dashboard.tsx`. Use this to place page-specific action buttons
 * (e.g. "+ New", "Seasons", delete) in the breadcrumb bar instead of
 * adding a second `<header>` to each page.
 *
 * - Mount one instance per page; unmounting clears the slot.
 * - Siblings stack horizontally (the slot is a flex row).
 * - During SSR / before hydration returns `null`; actions appear on
 *   the client tick, which matches how the dashboard shell already
 *   gates rendering behind a `mounted` effect.
 */
export const PAGE_HEADER_SLOT_ID = "page-header-actions"

export function PageHeaderActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById(PAGE_HEADER_SLOT_ID))
  }, [])

  if (!target) return null
  return createPortal(children, target)
}
