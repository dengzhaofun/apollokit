import * as React from "react"

import { Tool, type ToolCallState } from "../ai-elements"

/**
 * Read-only counterpart to `PatchConfigCard`, used by the
 * **global-assistant** agent. Server-side tool `execute` already wrote
 * to the module service, so the card just shows what changed —
 * the user has nothing to confirm.
 *
 * Two main display states map to AI SDK part states:
 *   - `input-streaming` / `input-available` — the model is mid-call;
 *     the agent's `execute` will run after `input-available`.
 *   - `output-available` — execute returned successfully. The card
 *     surfaces the patch fields with a "已执行" badge.
 *   - `output-error` — execute threw. The card shows the error string
 *     so the user knows the change did NOT happen.
 */
export function PatchExecutedCard({
  toolName,
  state,
  resourceKey,
  patch,
  errorMessage,
}: {
  toolName: string
  state: ToolCallState
  resourceKey: string
  patch: Record<string, unknown>
  /** Set when state === "output-error". */
  errorMessage?: string
}) {
  return (
    <Tool name={toolName} state={state}>
      <div className="mb-2 text-xs text-muted-foreground">
        目标：
        <span className="font-mono text-foreground break-all">{resourceKey}</span>
      </div>
      <PatchFields value={patch} />
      {state === "output-available" ? (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          已执行 —— 服务端已写入。
        </p>
      ) : null}
      {state === "output-error" ? (
        <p className="mt-2 text-xs text-destructive">
          执行失败：{errorMessage ?? "未知错误"}
        </p>
      ) : null}
    </Tool>
  )
}

function PatchFields({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">（patch 为空）</p>
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
  if (v === null) return "null"
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}
