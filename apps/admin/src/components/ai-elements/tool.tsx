/**
 * Compact card for rendering a tool call's lifecycle inside a chat
 * message. Shows the tool name + a state badge; children render the
 * tool-specific input/confirmation UI.
 *
 * Tool-call states (per AI SDK v5+ UIMessage parts):
 *   - input-streaming: model still emitting the input arg-by-arg
 *   - input-available: input fully resolved, awaiting execution / approval
 *   - output-available: tool finished (executed or denied)
 *   - output-error: validation / runtime error
 *
 * Our admin-agent tools don't have `execute` (client-side), so the
 * lifecycle effectively ends at `input-available` until the user
 * approves and we synthesize the next user message.
 */
import { CheckIcon, LoaderIcon, WrenchIcon, XIcon } from "lucide-react"
import * as React from "react"

import { Badge } from "#/components/ui/badge"
import { cn } from "#/lib/utils"

export type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"

export function Tool({
  name,
  state,
  className,
  children,
}: {
  name: React.ReactNode
  state: ToolCallState
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <WrenchIcon className="size-3.5 text-muted-foreground" />
          <span>{name}</span>
        </div>
        <ToolStateBadge state={state} />
      </div>
      {children ? <div className="p-3">{children}</div> : null}
    </div>
  )
}

function ToolStateBadge({ state }: { state: ToolCallState }) {
  if (state === "input-streaming") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <LoaderIcon className="size-3 animate-spin" />
        生成中
      </Badge>
    )
  }
  if (state === "input-available") {
    return (
      <Badge variant="outline" className="text-[10px]">
        待审核
      </Badge>
    )
  }
  if (state === "output-available") {
    return (
      <Badge variant="default" className="gap-1 text-[10px]">
        <CheckIcon className="size-3" />
        已应用
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1 text-[10px]">
      <XIcon className="size-3" />
      失败
    </Badge>
  )
}
