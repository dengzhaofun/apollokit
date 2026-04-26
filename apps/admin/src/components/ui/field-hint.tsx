import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "#/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"

/**
 * Form field description helpers — three tiers of hint visibility.
 *
 * **Default to `<FieldHint>`.** Most field descriptions should be discoverable
 * via an info icon next to the Label, not always-visible body text.
 *
 * `<FieldHint>` (L2) — info icon next to the Label, hover/focus reveals tooltip.
 *   Use for explaining what a field means, how it's used, what happens when
 *   you set/leave-blank a value. The bulk of form descriptions belong here.
 *   Examples: "Empty = unlimited", "Higher numbers come first",
 *   "Required for event_count methods", "Link to a lottery pool".
 *
 * `<FieldDescription>` (L1) — inline below the field, with an info icon prefix.
 *   Reserved for **irreversible / destructive warnings** that the user must
 *   not miss while filling the form. Don't use this for ordinary semantics
 *   explanations — those go in `<FieldHint>` instead.
 *   Examples: "Cannot be changed after creation",
 *   "Scope is locked once created".
 *
 * Pure format constraints (charset / casing / separators) — fold into the
 * input `placeholder`, don't use either component.
 */

export function FieldDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs text-foreground/75",
        className
      )}
      {...props}
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export interface FieldHintProps {
  children: React.ReactNode
  className?: string
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
  label?: string
}

export function FieldHint({
  children,
  className,
  side = "top",
  align = "start",
  label = "More info",
}: FieldHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
