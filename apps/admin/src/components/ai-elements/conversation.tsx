/**
 * Scrollable chat container that auto-sticks to the bottom when new
 * messages stream in (the typical chat-app behavior). If the user
 * scrolls up to read history, we suspend auto-scroll until they scroll
 * back near the bottom.
 *
 * Hand-rolled in-repo equivalent of `@ai-sdk/elements`'s `Conversation`
 * primitive. See README in `components/ai-elements/` for why this lives
 * here instead of being installed via the CLI.
 */

import * as React from "react"

import { cn } from "#/lib/utils"

const STICK_THRESHOLD_PX = 80

export function Conversation({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = React.useState(true)

  // Auto-scroll on new content while sticky.
  React.useEffect(() => {
    if (!stickToBottom) return
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  })

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const distanceFromBottom =
      el.scrollHeight - el.clientHeight - el.scrollTop
    setStickToBottom(distanceFromBottom < STICK_THRESHOLD_PX)
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn(
        "flex-1 overflow-y-auto px-3 py-3 space-y-3 [scrollbar-gutter:stable]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ConversationEmptyState({
  title,
  description,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
