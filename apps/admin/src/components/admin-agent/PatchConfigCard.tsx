import * as React from "react"

import { Button } from "#/components/ui/button"

import { Tool, type ToolCallState } from "../ai-elements"

/**
 * Card shown when the agent emits a `patch*` tool call against an
 * @-mentioned resource. Distinct from `ApplyConfigCard`:
 *
 *   - Apply card: full config for the create form. The user clicks
 *     "应用到表单", we write into the form via the registry helper.
 *   - Patch card: partial fields for an existing resource. The user
 *     clicks "确认应用", we fire `PATCH /api/<module>/.../{key}` with
 *     the partial body — no form context needed, so this works on
 *     every surface (dashboard, list, edit).
 *
 * The card shows the resource key + the patch fields. After firing the
 * PATCH the card locks into a "已应用" state (or "失败" with the error)
 * so the user has a record of what changed.
 */
export type PatchCardState =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "applied" }
  | { kind: "failed"; message: string }
  | { kind: "rejected" }

export function PatchConfigCard({
  toolName,
  state,
  resourceKey,
  patch,
  cardState,
  onApply,
  onReject,
}: {
  toolName: string
  state: ToolCallState
  /** The `key` field from the tool input — id or alias the PATCH targets. */
  resourceKey: string
  /** The partial patch object to apply. */
  patch: Record<string, unknown>
  cardState: PatchCardState
  onApply: () => void
  onReject: () => void
}) {
  const effectiveState: ToolCallState =
    cardState.kind === "applied" || cardState.kind === "rejected"
      ? "output-available"
      : cardState.kind === "failed"
      ? "output-error"
      : state

  return (
    <Tool name={toolName} state={effectiveState}>
      <div className="mb-2 text-xs text-muted-foreground">
        目标：<span className="font-mono text-foreground break-all">{resourceKey}</span>
      </div>
      <PatchFields value={patch} />
      {cardState.kind === "failed" ? (
        <p className="mt-2 text-xs text-destructive">应用失败：{cardState.message}</p>
      ) : null}
      {state === "input-available" &&
      cardState.kind !== "applied" &&
      cardState.kind !== "rejected" ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={cardState.kind === "applying"}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={onApply}
            disabled={cardState.kind === "applying"}
          >
            {cardState.kind === "applying" ? "应用中…" : "确认应用"}
          </Button>
        </div>
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
