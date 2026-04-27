import * as React from "react"

import { Button } from "#/components/ui/button"

import { Tool, type ToolCallState } from "../ai-elements"

/**
 * Card shown when the agent emits an `apply*Config` tool call. Renders
 * the proposed input as a key/value table, with an "Apply" / "Discard"
 * pair while the proposal is awaiting review, or a static "Applied"
 * badge once the user has accepted it.
 *
 * Generic over the tool's input type so the same card works for every
 * future module's apply tool — pass `applied={true}` to lock in the
 * confirmation state after writing back to the form.
 */
export function ApplyConfigCard<T extends object>({
  toolName,
  state,
  proposed,
  applied,
  onApply,
  onReject,
}: {
  toolName: string
  state: ToolCallState
  proposed: T
  applied: boolean
  onApply: () => void
  onReject: () => void
}) {
  const effectiveState: ToolCallState = applied ? "output-available" : state

  return (
    <Tool name={toolName} state={effectiveState}>
      <ProposedFields value={proposed as Record<string, unknown>} />
      {state === "input-available" && !applied ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onReject}>
            重新提议
          </Button>
          <Button size="sm" onClick={onApply}>
            应用到表单
          </Button>
        </div>
      ) : null}
    </Tool>
  )
}

function ProposedFields({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  )
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">（无字段）</p>
    )
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono text-foreground break-all">
            {formatValue(v)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}
