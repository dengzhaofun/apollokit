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
 *   2. Radix Slot (`<Button asChild><Link to="/new">New</Link></Button>`):
 *        <WriteGate>
 *          <Button asChild><Link to="/x/new">New</Link></Button>
 *        </WriteGate>
 *      In member mode the gate pulls the inner Link's children out
 *      (so the icon/text stay), strips `asChild`, and renders a plain
 *      disabled Button. The Link never mounts, so its `to` is
 *      ignored and there is no accidental navigation.
 *
 * The outer `<span>` is there because a disabled `<button>` swallows
 * pointer events in some browsers, which breaks Radix's tooltip
 * trigger. `pointer-events-auto` keeps the span hoverable.
 *
 * Phase 2 replaces this with `<PermissionGate resource action>` once
 * `createAccessControl` statements land server-side.
 */
export function WriteGate({
  children,
}: {
  children: ReactElement<{
    asChild?: boolean
    children?: ReactNode
    disabled?: boolean
    onClick?: unknown
  }>
}) {
  const canManage = useCanManage()
  if (canManage) return children
  if (!isValidElement(children)) return children

  // If the button is using Radix Slot (asChild) with a single element
  // child (typically a TanStack Router `<Link>`), extract that inner
  // element's children as the new label — we want the same icon+text
  // to appear in the disabled state, but without the Link's `to`
  // being active.
  const outerProps = children.props
  let labelContent: ReactNode = outerProps.children
  if (outerProps.asChild && isValidElement(outerProps.children)) {
    const inner = outerProps.children as ReactElement<{ children?: ReactNode }>
    labelContent = inner.props.children ?? null
  }

  const gated = cloneElement(children, {
    // Force non-Slot so the props below actually reach the <button>.
    asChild: false,
    disabled: true,
    onClick: undefined,
    children: labelContent,
  } as Partial<(typeof children)["props"]>)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pointer-events-auto inline-block cursor-not-allowed">
          {gated}
        </span>
      </TooltipTrigger>
      <TooltipContent>{m.role_write_denied_tooltip()}</TooltipContent>
    </Tooltip>
  )
}
