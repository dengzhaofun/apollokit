/**
 * Message primitive set — mirrors AI Elements' official structure
 * (https://elements.ai-sdk.dev/components/message):
 *
 *   <Message from="user|assistant|system">
 *     <MessageContent variant="contained|flat">{children}</MessageContent>
 *     <MessageAvatar src="..." name="..." />
 *   </Message>
 *
 * `Message` = layout (left for assistant, right for user, role-data attrs).
 * `MessageContent` = the bubble (or flat container — for tool cards we
 *   want flat so the ApplyConfigCard's own border doesn't double up).
 * `MessageAvatar` = optional identity badge.
 *
 * Splitting `Message` and `MessageContent` (vs the previous one-piece
 * implementation) lets non-bubble children (avatars, status pills) sit
 * beside the bubble without inheriting its background/padding.
 */

import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar"
import { cn } from "#/lib/utils"

type MessageRole = "user" | "assistant" | "system"

export function Message({
  from,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { from: MessageRole }) {
  if (from === "system") return null
  const isUser = from === "user"
  return (
    <div
      data-role={from}
      className={cn(
        "group flex w-full items-start gap-2",
        isUser ? "flex-row-reverse justify-start" : "flex-row justify-start",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type MessageContentVariant = "contained" | "flat"

/**
 * The visual bubble. `variant="flat"` removes the bubble styling — use
 * for assistant messages whose only child is a self-styled tool card,
 * so the card's border doesn't get nested inside another rounded bg.
 */
export function MessageContent({
  className,
  children,
  variant = "contained",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: MessageContentVariant
}) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "max-w-[85%] space-y-2 text-sm",
        variant === "contained" &&
          // Bubble. Role-based bg comes from the parent's `data-role`
          // sibling-selector trick — we read `[data-role=user]` /
          // `[data-role=assistant]` off the closest Message ancestor.
          "rounded-lg px-3 py-2 " +
            "group-data-[role=user]:bg-primary " +
            "group-data-[role=user]:text-primary-foreground " +
            "group-data-[role=assistant]:bg-muted " +
            "group-data-[role=assistant]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Optional avatar. We render it inline beside the bubble, role-aware.
 * `src` is preferred; `name` is the fallback initials and a11y label.
 */
export function MessageAvatar({
  src,
  name,
  className,
}: {
  src?: string
  name: string
  className?: string
}) {
  // First two chars of name — Latin: "AI" -> "AI", Chinese: "助手" -> "助手"
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <Avatar className={cn("size-7 shrink-0", className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className="text-[10px] font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
