import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"

import { useCanManage } from "#/hooks/use-can-manage"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"
import * as m from "#/paraglide/messages.js"

/**
 * Wraps an action control and disables it when the current org role
 * lacks write permission.
 *
 * owner/admin → children render as-is.
 * member (or loading/unknown role) → children are replaced with a
 *   disabled button carrying the same label/icons, wrapped in a
 *   tooltip explaining why.
 *
 * Supports two common shapes:
 *   1. Plain button with a handler:
 *        <WriteGate>
 *          <Button onClick={onCreate}>New</Button>
 *        </WriteGate>
 *   2. base-ui render (`<Button render={<Link to="/new" />}>New</Button>`):
 *        <WriteGate>
 *          <Button render={<Link to="/x/new" />}>New</Button>
 *        </WriteGate>
 *      In member mode the gate strips `render` so the underlying
 *      <button> renders directly. The Link element is never
 *      instantiated, so its `to` is ignored and there is no accidental
 *      navigation. Children stay on the outer Button (base-ui keeps the
 *      label there), so no extraction is needed.
 *
 * The outer `<span>` is there because a disabled `<button>` swallows
 * pointer events in some browsers, which breaks the tooltip trigger.
 * `pointer-events-auto` keeps the span hoverable.
 *
 * Phase 2 replaces this with `<PermissionGate resource action>` once
 * `createAccessControl` statements land server-side.
 */
export function WriteGate({
  children,
}: {
  children: ReactElement<{
    render?: unknown
    asChild?: boolean
    children?: ReactNode
    disabled?: boolean
    onClick?: unknown
  }>
}) {
  const canManage = useCanManage()
  if (canManage) return children
  if (!isValidElement(children)) return children

  // base-ui mode: children already on the outer Button.
  // Legacy Radix-Slot mode: hoist inner element's children up.
  const outerProps = children.props
  let labelContent: ReactNode = outerProps.children
  if (outerProps.asChild && isValidElement(outerProps.children)) {
    const inner = outerProps.children as ReactElement<{ children?: ReactNode }>
    labelContent = inner.props.children ?? null
  }

  const gated = cloneElement(children, {
    // Strip both Slot APIs so the underlying <button> renders directly
    // (and the inner Link element is never instantiated).
    render: undefined,
    asChild: false,
    disabled: true,
    onClick: undefined,
    children: labelContent,
  } as Partial<(typeof children)["props"]>)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="pointer-events-auto inline-block cursor-not-allowed" />
        }
      >
        {gated}
      </TooltipTrigger>
      <TooltipContent>{m.role_write_denied_tooltip()}</TooltipContent>
    </Tooltip>
  )
}
