import { AlertCircle, Flame, Gift, Sparkles } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "#/lib/utils"

/**
 * RedDot — renders a red-dot badge overlayed on a trigger element.
 *
 * Supports the 6 displayTypes used by `apps/server/src/modules/badge`:
 *   - dot          :  solid red circle (presence indicator)
 *   - number       :  numeric count (99+ cap)
 *   - new          :  "NEW" chip (new-feature promos)
 *   - hot          :  flame icon + HOT (operational promos)
 *   - exclamation  :  ! icon (system alerts)
 *   - gift         :  gift icon (claimable rewards)
 *
 * Usage:
 *   <RedDot displayType="number" count={3}>
 *     <Button>Mail</Button>
 *   </RedDot>
 *
 * `count <= 0` hides the dot entirely so callers can unconditionally
 * wrap and let the data decide visibility.
 */

export type RedDotDisplayType =
  | "dot"
  | "number"
  | "new"
  | "hot"
  | "exclamation"
  | "gift"

type RedDotProps = {
  children?: ReactNode
  displayType: RedDotDisplayType
  count?: number
  /** Cap for number mode. Default 99. Over-cap shows `${cap}+`. */
  cap?: number
  className?: string
  /** Show the badge even when count=0 (e.g. hot/new that don't depend on count). */
  forceVisible?: boolean
}

export function RedDot({
  children,
  displayType,
  count = 0,
  cap = 99,
  className,
  forceVisible,
}: RedDotProps) {
  // Visibility rules. `hot` / `new` / `gift` / `exclamation` accept
  // forceVisible because they often act like labels (HOT on a menu
  // entry even when count is 0). `dot` / `number` strictly depend on
  // count > 0.
  const labelLike =
    displayType === "new" ||
    displayType === "hot" ||
    displayType === "exclamation" ||
    displayType === "gift"
  const visible = count > 0 || (forceVisible && labelLike)

  if (!children) {
    // Standalone badge (no trigger). Just render the chip.
    return visible ? (
      <RedDotChip
        displayType={displayType}
        count={count}
        cap={cap}
        className={className}
      />
    ) : null
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      {visible ? (
        <span className="pointer-events-none absolute -top-1 -right-1 flex">
          <RedDotChip displayType={displayType} count={count} cap={cap} />
        </span>
      ) : null}
    </span>
  )
}

function RedDotChip({
  displayType,
  count,
  cap,
  className,
}: {
  displayType: RedDotDisplayType
  count: number
  cap: number
  className?: string
}) {
  const base =
    "inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none shadow-sm ring-2 ring-background"

  if (displayType === "dot") {
    return (
      <span
        data-slot="red-dot"
        data-variant="dot"
        className={cn(base, "size-2 bg-red-500 p-0 ring-2", className)}
      />
    )
  }

  if (displayType === "number") {
    const shown = count > cap ? `${cap}+` : String(count)
    return (
      <span
        data-slot="red-dot"
        data-variant="number"
        className={cn(
          base,
          "min-w-4 h-4 bg-red-500 px-1 text-white tabular-nums",
          className,
        )}
      >
        {shown}
      </span>
    )
  }

  if (displayType === "new") {
    return (
      <span
        data-slot="red-dot"
        data-variant="new"
        className={cn(
          base,
          "h-4 gap-0.5 bg-red-500 px-1.5 text-white uppercase tracking-wide",
          className,
        )}
      >
        <Sparkles className="size-2.5" />
        NEW
      </span>
    )
  }

  if (displayType === "hot") {
    return (
      <span
        data-slot="red-dot"
        data-variant="hot"
        className={cn(
          base,
          "h-4 gap-0.5 bg-orange-500 px-1.5 text-white uppercase tracking-wide",
          className,
        )}
      >
        <Flame className="size-2.5" />
        HOT
      </span>
    )
  }

  if (displayType === "exclamation") {
    return (
      <span
        data-slot="red-dot"
        data-variant="exclamation"
        className={cn(
          base,
          "size-4 bg-amber-500 text-white p-0",
          className,
        )}
      >
        <AlertCircle className="size-3" />
      </span>
    )
  }

  // gift
  return (
    <span
      data-slot="red-dot"
      data-variant="gift"
      className={cn(
        base,
        "h-4 gap-0.5 bg-pink-500 px-1 text-white",
        count > 0 && count !== 1 ? "" : "",
        className,
      )}
    >
      <Gift className="size-2.5" />
      {count > 1 ? <span className="tabular-nums">{count}</span> : null}
    </span>
  )
}
