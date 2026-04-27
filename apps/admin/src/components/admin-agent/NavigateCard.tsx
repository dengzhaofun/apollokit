import { ArrowRightIcon } from "lucide-react"

import { Button } from "#/components/ui/button"

import { Tool, type ToolCallState } from "../ai-elements"

/**
 * Card shown when the agent emits a `navigateTo` tool call.
 *
 * One-click navigation: the user clicks the button, the parent's
 * `onNavigate` runs router.navigate(), and we mark the tool resolved.
 */
export function NavigateCard({
  state,
  module,
  intent,
  reason,
  navigated,
  onNavigate,
}: {
  state: ToolCallState
  module: string
  intent: "list" | "create"
  reason: string
  navigated: boolean
  onNavigate: () => void
}) {
  const effectiveState: ToolCallState = navigated ? "output-available" : state
  const intentLabel =
    intent === "create" ? "创建表单" : "列表"

  return (
    <Tool name={`navigateTo · ${module}:${intent}`} state={effectiveState}>
      <p className="text-sm text-foreground">{reason}</p>
      {state === "input-available" && !navigated ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onNavigate} className="gap-1">
            <ArrowRightIcon className="size-3.5" />
            前往 {module} 的{intentLabel}
          </Button>
        </div>
      ) : null}
    </Tool>
  )
}
