/**
 * Streaming markdown renderer for assistant text replies.
 *
 * Uses Vercel's `streamdown` (the same engine AI Elements ships) — it
 * handles partially-streamed markdown gracefully (won't half-render an
 * unclosed code fence, table, etc.) and includes:
 *   - GFM tables, task lists, strikethrough
 *   - Code fences with shiki syntax highlighting
 *   - Math (KaTeX) and Mermaid diagrams via plugins (we don't enable
 *     those right now — keeps bundle smaller)
 *
 * The `prose` Tailwind classes give consistent typography. We scope to
 * `prose-sm` so it fits inside chat bubbles without dominating.
 */

import { Streamdown } from "streamdown"

import { cn } from "#/lib/utils"

export function Response({
  className,
  children,
}: {
  className?: string
  /** Markdown source. Pass the streamed assistant text here. */
  children: string
}) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none text-sm",
        // Override prose defaults that look weird inside small chat bubbles:
        "prose-p:my-1.5 prose-p:leading-relaxed",
        "prose-headings:my-2 prose-headings:font-semibold",
        "prose-pre:my-2",
        "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
        "prose-a:underline-offset-2",
        // Inline code: streamdown defaults to a light-bg chip which
        // collides with our user bubble's `bg-primary` (purple). Use
        // `currentColor`-tinted backgrounds via the group-data trick:
        // — In user bubble (`data-role=user`): translucent foreground
        //   over primary so it reads on purple.
        // — In assistant bubble (`data-role=assistant`): subtle slate.
        "prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium prose-code:before:content-none prose-code:after:content-none",
        "group-data-[role=user]:prose-code:bg-primary-foreground/20 group-data-[role=user]:prose-code:text-primary-foreground",
        "group-data-[role=assistant]:prose-code:bg-foreground/10 group-data-[role=assistant]:prose-code:text-foreground",
        // Links also need to inherit role-aware foreground:
        "group-data-[role=user]:prose-a:text-primary-foreground",
        "group-data-[role=assistant]:prose-a:text-primary",
        className,
      )}
    >
      <Streamdown>{children}</Streamdown>
    </div>
  )
}
